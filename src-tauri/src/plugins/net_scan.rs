//! Finds the smart TVs on this computer's Wi-Fi/LAN: a TCP probe of every address in the local
//! /24, and the platform read off which ports answer (see `platform`). A second, slower pass over the
//! addresses the ARP table knows (the probe has just filled it) catches TVs that answered too slowly,
//! and an SSDP search finds LG TVs whose ports stay closed with dev mode off — their name and model
//! come from the same answer.

use std::collections::{BTreeMap, HashMap};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream, UdpSocket};
use std::time::Duration;

use regex::Regex;
use serde::Serialize;

use crate::error::Error;

/// 5555 ADB · 3000/3001 LG SSAP, 9922 LG dev-mode SSH · 8001/8002 Samsung remote API,
/// 26101 SDB · 8008 Google Cast, which most TVs answer with their name.
const PORTS: [u16; 8] = [5555, 3000, 3001, 9922, 8001, 8002, 26101, 8008];
const TIMEOUT: Duration = Duration::from_millis(400);
const SLOW_TIMEOUT: Duration = Duration::from_millis(1500);

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LanDevice {
    ip: String,
    /// The name set on the TV — Samsung's remote API, LG's SSDP answer, else Google Cast. Read
    /// without ADB/SDB, so the TV shows no "Allow" prompt.
    name: Option<String>,
    /// Model number, e.g. `UE55DU8000UXSQ`, `65QNED86T6A`. Samsung and LG only.
    model: Option<String>,
    /// Model year, read from the model code. Samsung and LG only.
    year: Option<u16>,
    /// `Tizen 8.0` / `webOS 24`, by model year — not read from the TV. Samsung and LG only.
    os: Option<String>,
    /// `android-tv`, `webos` or `tizen`, as `Platform` names them in the frontend.
    platform: &'static str,
    /// The port the tool connects through is open: ADB, LG dev mode, SDB.
    ready: bool,
    open_ports: Vec<u16>,
}

/// Which TV this is, from the ports that answer. Pairs rather than single ports, so a laptop
/// running a dev server on 3000 is not taken for an LG.
fn platform(ports: &[u16]) -> Option<(&'static str, bool)> {
    let has = |p| ports.contains(&p);
    if has(5555) {
        Some(("android-tv", true))
    } else if has(3000) && has(3001) {
        Some(("webos", has(9922)))
    } else if (has(8001) && has(8002)) || has(26101) {
        Some(("tizen", has(26101)))
    } else {
        None
    }
}

#[tauri::command]
pub(crate) async fn lan_scan() -> Result<Vec<LanDevice>, Error> {
    let (mut devices, lg_urls) = tauri::async_runtime::spawn_blocking(scan)
        .await
        .map_err(|e| Error::new(format!("Scan failed: {e}")))??;
    let lg = lg_details(lg_urls).await;
    let details = futures::future::join_all(devices.iter().map(|d| describe(d, &lg))).await;
    for (device, (name, model, year)) in devices.iter_mut().zip(details) {
        device.name = name;
        device.model = model;
        device.year = year;
        device.os = year.and_then(|y| os_for(device.platform, y));
    }
    Ok(devices)
}

/// Name, model and model year of one TV.
async fn describe(d: &LanDevice, lg: &HashMap<Ipv4Addr, LgInfo>) -> (Option<String>, Option<String>, Option<u16>) {
    let ip = &d.ip;
    if d.platform == "webos" {
        if let Some(info) = ip.parse().ok().and_then(|ip: Ipv4Addr| lg.get(&ip)) {
            return (Some(info.name.clone()), Some(info.model.clone()), lg_year(&info.model));
        }
    }
    if d.open_ports.contains(&8001) {
        let info = get_json(&format!("http://{ip}:8001/api/v2/")).await;
        let device = info.as_ref().map(|i| &i["device"]);
        if let Some(name) = device.and_then(|d| d["name"].as_str()).filter(|n| !n.is_empty()) {
            let model = device.and_then(|d| d["modelName"].as_str()).filter(|m| !m.is_empty());
            // `24_NKL_UHD_T09`: the model year leads.
            let year = device.and_then(|d| d["model"].as_str()).and_then(samsung_year);
            // Samsung HTML-escapes it: `55&quot; Crystal UHD`.
            let name = name.replace("&quot;", "\"").replace("&#39;", "'").replace("&amp;", "&");
            return (Some(name), model.map(str::to_owned), year);
        }
    }
    if d.open_ports.contains(&8008) {
        let name = get_json(&format!("http://{ip}:8008/setup/eureka_info?params=name")).await;
        let name = name.as_ref().and_then(|i| i["name"].as_str()).filter(|n| !n.is_empty());
        return (name.map(clean_lg_name), None, None);
    }
    (None, None, None)
}

fn samsung_year(model: &str) -> Option<u16> {
    let (prefix, _) = model.split_once('_')?;
    prefix.parse::<u16>().ok().filter(|y| (15..=40).contains(y)).map(|y| 2000 + y)
}

async fn get_json(url: &str) -> Option<serde_json::Value> {
    let client = reqwest::Client::builder().timeout(Duration::from_secs(3)).build().ok()?;
    client.get(url).send().await.ok()?.json().await.ok()
}

/// `[LG] webOS TV QNED86T6A` → `QNED86T6A`. A name the owner typed is left alone.
fn clean_lg_name(name: &str) -> String {
    let re = Regex::new(r"(?i)^\[LG\]\s*(webOS TV\s*)?").unwrap();
    let cleaned = re.replace(name, "").trim().to_owned();
    if cleaned.is_empty() { name.to_owned() } else { cleaned }
}

/// Model year from an LG model number. Two schemes: OLED `C1` (series letter + year digit,
/// 1 = 2021) and a year letter (P = 2021 … T = 2025), found after `U?` (`UP7550` → P) or after
/// the digits of `QNED86T6A` / `NANO846QA`.
fn lg_year(model: &str) -> Option<u16> {
    let model = model.split('.').next()?.to_uppercase();
    let body = model.trim_start_matches(|c: char| c.is_ascii_digit());
    let letter = |c: char| match c {
        'M' => Some(2019),
        'N' => Some(2020),
        'P'..='U' => Some(2021 + (c as u16 - 'P' as u16)),
        _ => None,
    };
    if let Some(rest) = body.strip_prefix("OLED") {
        let rest = rest.trim_start_matches(|c: char| c.is_ascii_digit());
        let mut chars = rest.chars().skip(1);
        return match chars.next()? {
            'X' => Some(2020),
            d @ '1'..='8' => Some(2020 + d.to_digit(10)? as u16),
            _ => None,
        };
    }
    let re = Regex::new(r"^(?:U([M-U])\d|(?:QNED|NANO)\d{2,3}([M-U]))").unwrap();
    let c = re.captures(body)?;
    letter(c.get(1).or(c.get(2))?.as_str().chars().next()?)
}

/// Tizen and webOS version that shipped on a model year's TVs.
fn os_for(platform: &str, year: u16) -> Option<String> {
    match (platform, year) {
        ("tizen", 2019) => Some("Tizen 5.0".into()),
        ("tizen", 2020) => Some("Tizen 5.5".into()),
        ("tizen", 2021) => Some("Tizen 6.0".into()),
        ("tizen", 2022) => Some("Tizen 6.5".into()),
        ("tizen", 2023) => Some("Tizen 7.0".into()),
        ("tizen", 2024) => Some("Tizen 8.0".into()),
        ("tizen", 2025) => Some("Tizen 9.0".into()),
        ("webos", 2019) => Some("webOS 4.5".into()),
        ("webos", 2020) => Some("webOS 5".into()),
        ("webos", 2021) => Some("webOS 6".into()),
        ("webos", 2022..=2026) => Some(format!("webOS {}", year - 2000)),
        _ => None,
    }
}

struct LgInfo {
    name: String,
    model: String,
}

/// LG TVs answer an SSDP search with a device description even with Developer Mode off: the name
/// the owner set and the model number. Only the webOS second-screen service is asked for.
/// Returns each answering address with the URL of its description.
fn lg_ssdp() -> HashMap<Ipv4Addr, String> {
    ssdp_search("239.255.255.250:1900", Duration::from_millis(3000))
}

/// One M-SEARCH to `target` (the multicast group, or one TV's own port 1900) and the descriptions
/// that come back, by sender.
fn ssdp_search(target: &str, wait: Duration) -> HashMap<Ipv4Addr, String> {
    let Ok(socket) = UdpSocket::bind("0.0.0.0:0") else { return HashMap::new() };
    let _ = socket.set_read_timeout(Some(Duration::from_millis(300)));
    let request = "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\n\
                   ST: urn:lge-com:service:webos-second-screen:1\r\n\r\n";
    // Sent twice: UDP over Wi-Fi drops packets.
    for _ in 0..2 {
        let _ = socket.send_to(request.as_bytes(), target);
    }
    let location = Regex::new(r"(?i)location:\s*(http://\S+)").unwrap();
    let mut urls = HashMap::new();
    let mut buf = [0u8; 2048];
    let end = std::time::Instant::now() + wait;
    while std::time::Instant::now() < end {
        let Ok((n, SocketAddr::V4(from))) = socket.recv_from(&mut buf) else { continue };
        if let Some(c) = location.captures(&String::from_utf8_lossy(&buf[..n])) {
            urls.entry(*from.ip()).or_insert_with(|| c[1].to_owned());
        }
    }
    urls
}

async fn lg_details(urls: HashMap<Ipv4Addr, String>) -> HashMap<Ipv4Addr, LgInfo> {
    let field = |xml: &str, tag: &str| {
        Regex::new(&format!(r"<{tag}>([^<]*)</{tag}>")).unwrap().captures(xml).map(|c| c[1].trim().to_owned())
    };
    let Ok(client) = reqwest::Client::builder().timeout(Duration::from_secs(3)).build() else { return HashMap::new() };
    let fetched = futures::future::join_all(urls.into_iter().map(|(ip, url)| {
        let client = client.clone();
        async move { Some((ip, client.get(url).send().await.ok()?.text().await.ok()?)) }
    }))
    .await;
    fetched
        .into_iter()
        .flatten()
        .filter_map(|(ip, xml)| {
            let name = field(&xml, "friendlyName").filter(|n| !n.is_empty())?;
            Some((ip, LgInfo { name: clean_lg_name(&name), model: field(&xml, "modelNumber").unwrap_or_default() }))
        })
        .collect()
}

fn tv(ip: Ipv4Addr, open_ports: Vec<u16>) -> Option<(Ipv4Addr, LanDevice)> {
    let (platform, ready) = platform(&open_ports)?;
    let device = LanDevice { ip: ip.to_string(), name: None, model: None, year: None, os: None, platform, ready, open_ports };
    Some((ip, device))
}

/// A TV found by SSDP alone — its ports did not answer in time — is an LG; 9922 says dev mode.
fn lg_from_ssdp(ip: Ipv4Addr) -> (Ipv4Addr, LanDevice) {
    let open_ports = open_ports_parallel(ip, SLOW_TIMEOUT);
    let ready = open_ports.contains(&9922);
    let device = LanDevice { ip: ip.to_string(), name: None, model: None, year: None, os: None, platform: "webos", ready, open_ports };
    (ip, device)
}

fn scan() -> Result<(Vec<LanDevice>, HashMap<Ipv4Addr, String>), Error> {
    let own = local_ipv4().ok_or_else(|| Error::new("This computer is not on a network"))?;
    let [a, b, c, _] = own.octets();
    let in_subnet = |ip: &Ipv4Addr| ip.octets()[..3] == [a, b, c] && *ip != own;
    // shortcut: /24 only, which is what home and office Wi-Fi hand out; a wider subnet needs the real mask.
    let (mut tvs, mut lg_urls): (BTreeMap<Ipv4Addr, LanDevice>, _) = std::thread::scope(|s| {
        let ssdp = s.spawn(lg_ssdp);
        let probes: Vec<_> = (1..=254u8)
            .map(|d| Ipv4Addr::new(a, b, c, d))
            .filter(|ip| *ip != own)
            .map(|ip| s.spawn(move || (ip, open_ports(ip, TIMEOUT))))
            .collect();
        let tvs = probes.into_iter().filter_map(|p| p.join().ok()).filter_map(|(ip, ports)| tv(ip, ports)).collect();
        (tvs, ssdp.join().unwrap_or_default())
    });
    let missed: Vec<Ipv4Addr> = lg_urls.keys().copied().filter(|ip| in_subnet(ip) && !tvs.contains_key(ip)).collect();
    tvs.extend(missed.into_iter().map(lg_from_ssdp));
    // Second pass: a host the ARP table knows (it answered) that showed no TV ports may only have
    // been slow — a TV on weak Wi-Fi drops the first SYN. Same ports, a longer wait.
    let alive: Vec<Ipv4Addr> = arp_table().into_iter().filter(|ip| in_subnet(ip) && !tvs.contains_key(ip)).collect();
    let slow: Vec<_> = std::thread::scope(|s| {
        let probes: Vec<_> = alive.into_iter().map(|ip| s.spawn(move || (ip, open_ports_parallel(ip, SLOW_TIMEOUT)))).collect();
        probes.into_iter().filter_map(|p| p.join().ok()).filter_map(|(ip, ports)| tv(ip, ports)).collect()
    });
    tvs.extend(slow);
    // The multicast answer of an LG can get lost; ask the ones it missed directly.
    let silent: Vec<Ipv4Addr> = tvs.iter().filter(|(ip, d)| d.platform == "webos" && !lg_urls.contains_key(ip)).map(|(ip, _)| *ip).collect();
    let direct: Vec<_> = std::thread::scope(|s| {
        let asks: Vec<_> = silent.into_iter().map(|ip| s.spawn(move || ssdp_search(&format!("{ip}:1900"), Duration::from_millis(1500)))).collect();
        asks.into_iter().filter_map(|a| a.join().ok()).flatten().collect()
    });
    lg_urls.extend(direct);
    log::info!("[LAN scan] {}.{}.{}.0/24: {} TVs", a, b, c, tvs.len());
    Ok((tvs.into_values().collect(), lg_urls))
}

fn is_open(ip: Ipv4Addr, port: u16, timeout: Duration) -> bool {
    TcpStream::connect_timeout(&SocketAddr::new(IpAddr::V4(ip), port), timeout).is_ok()
}

fn open_ports(ip: Ipv4Addr, timeout: Duration) -> Vec<u16> {
    PORTS.iter().copied().filter(|&port| is_open(ip, port, timeout)).collect()
}

/// All ports at once: for the few addresses of the slow pass, where one wait is 1.5 s per port.
fn open_ports_parallel(ip: Ipv4Addr, timeout: Duration) -> Vec<u16> {
    std::thread::scope(|s| {
        let probes: Vec<_> = PORTS.iter().map(|&port| s.spawn(move || (port, is_open(ip, port, timeout)))).collect();
        probes.into_iter().filter_map(|p| p.join().ok()).filter(|(_, open)| *open).map(|(port, _)| port).collect()
    })
}

/// The address the OS would route the internet from. `connect` on UDP sends nothing.
fn local_ipv4() -> Option<Ipv4Addr> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    match socket.local_addr().ok()?.ip() {
        IpAddr::V4(ip) if !ip.is_loopback() => Some(ip),
        _ => None,
    }
}

fn arp_table() -> Vec<Ipv4Addr> {
    let args: &[&str] = if cfg!(windows) { &["-a"] } else { &["-an"] };
    let Ok(output) = std::process::Command::new("arp").args(args).output() else { return vec![] };
    parse_arp(&String::from_utf8_lossy(&output.stdout))
}

/// The addresses with a MAC: one line per entry on macOS/Linux (`? (192.168.1.5) at a4:5e:…`) and
/// Windows (`192.168.1.5   a4-5e-…   dynamic`). Incomplete and broadcast entries are skipped.
fn parse_arp(text: &str) -> Vec<Ipv4Addr> {
    let re = Regex::new(r"(\d{1,3}(?:\.\d{1,3}){3})\D+?([0-9a-fA-F]{1,2}(?:[:-][0-9a-fA-F]{1,2}){5})").unwrap();
    text.lines()
        .filter_map(|line| re.captures(line))
        .filter(|c| !c[2].eq_ignore_ascii_case("ff:ff:ff:ff:ff:ff") && !c[2].eq_ignore_ascii_case("ff-ff-ff-ff-ff-ff"))
        .filter_map(|c| c[1].parse().ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tells_platforms_apart_by_port() {
        // Port sets seen on the office network, 2026-11-10.
        assert_eq!(platform(&[5555, 8008]), Some(("android-tv", true)));
        assert_eq!(platform(&[3000, 3001, 9922, 8008]), Some(("webos", true)));
        assert_eq!(platform(&[3000, 3001, 8008]), Some(("webos", false)));
        assert_eq!(platform(&[8001, 8002, 26101, 8008]), Some(("tizen", true)));
        assert_eq!(platform(&[8001, 8002, 8008]), Some(("tizen", false)));
        assert_eq!(platform(&[8008]), None); // Chromecast, or an Android TV with ADB off
        assert_eq!(platform(&[3000]), None); // a dev server, not an LG
    }

    #[test]
    fn parses_arp_addresses_linux_and_windows() {
        let text = "? (192.168.50.1) at 4:d9:f5:a:b:c on en0 ifscope [ethernet]\n\
                    ? (192.168.50.7) at (incomplete) on en0 ifscope [ethernet]\n\
                    ? (192.168.50.255) at ff:ff:ff:ff:ff:ff on en0\n  \
                    192.168.50.234        a4-5e-60-11-22-33     dynamic\n";
        assert_eq!(parse_arp(text), vec!["192.168.50.1".parse::<Ipv4Addr>().unwrap(), "192.168.50.234".parse().unwrap()]);
    }

    #[test]
    fn reads_lg_year_from_the_model() {
        // Models seen on the office network, 2026-11-11.
        assert_eq!(lg_year("65QNED86T6A.DMFFLWE"), Some(2025));
        assert_eq!(lg_year("50NANO846QA"), Some(2022));
        assert_eq!(lg_year("55UP7550PVG"), Some(2021));
        assert_eq!(lg_year("55UQ75006LF"), Some(2022));
        assert_eq!(lg_year("OLED55C1PUB"), Some(2021));
        assert_eq!(lg_year("OLED65CXPUA"), Some(2020));
        assert_eq!(lg_year("LG Smart TV"), None);
    }

    #[test]
    fn reads_samsung_year_and_names_the_os() {
        assert_eq!(samsung_year("24_NKL_UHD_T09"), Some(2024));
        assert_eq!(samsung_year("21_KANTSU2E_UHD_BASIC"), Some(2021));
        assert_eq!(samsung_year("UHD_BASIC"), None);
        assert_eq!(os_for("tizen", 2024).as_deref(), Some("Tizen 8.0"));
        assert_eq!(os_for("webos", 2025).as_deref(), Some("webOS 25"));
    }

    #[test]
    fn drops_the_lg_prefix_from_the_name() {
        assert_eq!(clean_lg_name("[LG] webOS TV QNED86T6A"), "QNED86T6A");
        assert_eq!(clean_lg_name("הילי"), "הילי");
    }
}

#[cfg(test)]
mod live {
    #[test]
    #[ignore]
    fn live_scan() {
        let start = std::time::Instant::now();
        let d = tauri::async_runtime::block_on(super::lan_scan()).unwrap();
        for x in &d { println!("{:?}", x); }
        println!("{} TVs in {:?}", d.len(), start.elapsed());
    }
}
