//! Finds the smart TVs on this computer's Wi-Fi/LAN: a TCP probe of every address in the local
//! /24, and the platform read off which ports answer (see `platform`). The ARP table, which the
//! probe has just filled, adds each TV's MAC.

use std::collections::BTreeMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream, UdpSocket};
use std::time::Duration;

use regex::Regex;
use serde::Serialize;

use crate::error::Error;

/// 5555 ADB · 3000/3001 LG SSAP, 9922 LG dev-mode SSH · 8001/8002 Samsung remote API,
/// 26101 SDB · 8008 Google Cast, which most TVs answer with their name.
const PORTS: [u16; 8] = [5555, 3000, 3001, 9922, 8001, 8002, 26101, 8008];
const TIMEOUT: Duration = Duration::from_millis(400);

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LanDevice {
    ip: String,
    mac: Option<String>,
    /// The name set on the TV — Samsung's remote API, else Google Cast. Read without ADB/SDB,
    /// so the TV shows no "Allow" prompt.
    name: Option<String>,
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
    let mut devices = tauri::async_runtime::spawn_blocking(scan)
        .await
        .map_err(|e| Error::new(format!("Scan failed: {e}")))??;
    let names = futures::future::join_all(devices.iter().map(|d| tv_name(d))).await;
    for (device, name) in devices.iter_mut().zip(names) {
        device.name = name;
    }
    Ok(devices)
}

async fn tv_name(d: &LanDevice) -> Option<String> {
    let ip = &d.ip;
    if d.open_ports.contains(&8001) {
        // `55" Crystal UHD 2024` + `UE55DU8000UXSQ`
        let info = get_json(&format!("http://{ip}:8001/api/v2/")).await;
        let device = info.as_ref().map(|i| &i["device"]);
        if let Some(name) = device.and_then(|d| d["name"].as_str()).filter(|n| !n.is_empty()) {
            let model = device.and_then(|d| d["modelName"].as_str()).unwrap_or_default();
            // Samsung HTML-escapes it: `55&quot; Crystal UHD`.
            let name = name.replace("&quot;", "\"").replace("&#39;", "'").replace("&amp;", "&");
            return Some(if model.is_empty() { name } else { format!("{name} · {model}") });
        }
    }
    if d.open_ports.contains(&8008) {
        let info = get_json(&format!("http://{ip}:8008/setup/eureka_info?params=name")).await?;
        return info["name"].as_str().filter(|n| !n.is_empty()).map(str::to_owned);
    }
    None
}

async fn get_json(url: &str) -> Option<serde_json::Value> {
    let client = reqwest::Client::builder().timeout(Duration::from_secs(3)).build().ok()?;
    client.get(url).send().await.ok()?.json().await.ok()
}

fn scan() -> Result<Vec<LanDevice>, Error> {
    let own = local_ipv4().ok_or_else(|| Error::new("This computer is not on a network"))?;
    let [a, b, c, _] = own.octets();
    // shortcut: /24 only, which is what home and office Wi-Fi hand out; a wider subnet needs the real mask.
    let mut tvs: BTreeMap<Ipv4Addr, LanDevice> = std::thread::scope(|s| {
        let probes: Vec<_> = (1..=254u8)
            .map(|d| Ipv4Addr::new(a, b, c, d))
            .filter(|ip| *ip != own)
            .map(|ip| s.spawn(move || (ip, open_ports(ip))))
            .collect();
        probes
            .into_iter()
            .filter_map(|p| p.join().ok())
            .filter_map(|(ip, open_ports)| {
                let (platform, ready) = platform(&open_ports)?;
                Some((ip, LanDevice { ip: ip.to_string(), mac: None, name: None, platform, ready, open_ports }))
            })
            .collect()
    });
    for (ip, mac) in arp_table() {
        if let Some(tv) = tvs.get_mut(&ip) {
            tv.mac = Some(mac);
        }
    }
    log::info!("[LAN scan] {}.{}.{}.0/24: {} TVs", a, b, c, tvs.len());
    Ok(tvs.into_values().collect())
}

fn open_ports(ip: Ipv4Addr) -> Vec<u16> {
    PORTS
        .iter()
        .copied()
        .filter(|&port| TcpStream::connect_timeout(&SocketAddr::new(IpAddr::V4(ip), port), TIMEOUT).is_ok())
        .collect()
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

fn arp_table() -> Vec<(Ipv4Addr, String)> {
    let args: &[&str] = if cfg!(windows) { &["-a"] } else { &["-an"] };
    let Ok(output) = std::process::Command::new("arp").args(args).output() else { return vec![] };
    parse_arp(&String::from_utf8_lossy(&output.stdout))
}

/// One line per entry on macOS/Linux (`? (192.168.1.5) at a4:5e:…`) and Windows
/// (`192.168.1.5   a4-5e-…   dynamic`). Incomplete and broadcast entries are skipped.
fn parse_arp(text: &str) -> Vec<(Ipv4Addr, String)> {
    let re = Regex::new(r"(\d{1,3}(?:\.\d{1,3}){3})\D+?([0-9a-fA-F]{1,2}(?:[:-][0-9a-fA-F]{1,2}){5})").unwrap();
    text.lines()
        .filter_map(|line| re.captures(line))
        .filter_map(|c| {
            let ip: Ipv4Addr = c[1].parse().ok()?;
            let mac = c[2]
                .split([':', '-'])
                .map(|part| format!("{:0>2}", part.to_lowercase()))
                .collect::<Vec<_>>()
                .join(":");
            (mac != "ff:ff:ff:ff:ff:ff" && mac != "00:00:00:00:00:00").then_some((ip, mac))
        })
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
    fn parses_mac_linux_and_windows_arp() {
        let text = "? (192.168.50.1) at 4:d9:f5:a:b:c on en0 ifscope [ethernet]\n\
                    ? (192.168.50.7) at (incomplete) on en0 ifscope [ethernet]\n\
                    ? (192.168.50.255) at ff:ff:ff:ff:ff:ff on en0\n  \
                    192.168.50.234        a4-5e-60-11-22-33     dynamic\n";
        assert_eq!(
            parse_arp(text),
            vec![
                ("192.168.50.1".parse().unwrap(), "04:d9:f5:0a:0b:0c".into()),
                ("192.168.50.234".parse().unwrap(), "a4:5e:60:11:22:33".into()),
            ]
        );
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
