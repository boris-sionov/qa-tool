//! Finds the devices on this computer's Wi-Fi/LAN: a TCP probe of every address in the local /24,
//! then the ARP table, which the probe has just filled — so a device with no open port still
//! shows up, by its MAC. ADB on 5555 is what marks an Android TV.

use std::collections::BTreeMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream, UdpSocket};
use std::time::Duration;

use regex::Regex;
use serde::Serialize;

use crate::error::Error;

/// 5555 ADB, 8008/8009 Google Cast, the rest just make ordinary hosts answer.
const PORTS: [u16; 7] = [5555, 8008, 8009, 22, 80, 443, 62078];
const TIMEOUT: Duration = Duration::from_millis(400);

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LanDevice {
    ip: String,
    mac: Option<String>,
    /// The name set on the TV, from Google Cast — read without ADB, so no "Allow" prompt.
    name: Option<String>,
    open_ports: Vec<u16>,
}

#[tauri::command]
pub(crate) async fn lan_scan() -> Result<Vec<LanDevice>, Error> {
    let mut devices = tauri::async_runtime::spawn_blocking(scan)
        .await
        .map_err(|e| Error::new(format!("Scan failed: {e}")))??;
    let names = futures::future::join_all(devices.iter().map(|d| cast_name(&d.ip, &d.open_ports))).await;
    for (device, name) in devices.iter_mut().zip(names) {
        device.name = name;
    }
    Ok(devices)
}

async fn cast_name(ip: &str, open_ports: &[u16]) -> Option<String> {
    if !open_ports.contains(&8008) {
        return None;
    }
    let client = reqwest::Client::builder().timeout(Duration::from_secs(3)).build().ok()?;
    let info: serde_json::Value = client
        .get(format!("http://{ip}:8008/setup/eureka_info?params=name"))
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;
    info["name"].as_str().filter(|n| !n.is_empty()).map(str::to_owned)
}

fn scan() -> Result<Vec<LanDevice>, Error> {
    let own = local_ipv4().ok_or_else(|| Error::new("This computer is not on a network"))?;
    let [a, b, c, _] = own.octets();
    // shortcut: /24 only, which is what home and office Wi-Fi hand out; a wider subnet needs the real mask.
    let mut found: BTreeMap<Ipv4Addr, LanDevice> = std::thread::scope(|s| {
        let probes: Vec<_> = (1..=254u8)
            .map(|d| Ipv4Addr::new(a, b, c, d))
            .filter(|ip| *ip != own)
            .map(|ip| s.spawn(move || (ip, open_ports(ip))))
            .collect();
        probes
            .into_iter()
            .filter_map(|p| p.join().ok())
            .map(|(ip, open_ports)| (ip, LanDevice { ip: ip.to_string(), mac: None, name: None, open_ports }))
            .collect()
    });
    for (ip, mac) in arp_table() {
        if ip.octets()[..3] == [a, b, c] && ip != own {
            found.entry(ip).or_insert_with(|| LanDevice { ip: ip.to_string(), mac: None, name: None, open_ports: vec![] }).mac = Some(mac);
        }
    }
    let devices: Vec<_> = found.into_values().filter(|d| d.mac.is_some() || !d.open_ports.is_empty()).collect();
    log::info!("[LAN scan] {}.{}.{}.0/24: {} devices", a, b, c, devices.len());
    Ok(devices)
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
        println!("{} devices in {:?}", d.len(), start.elapsed());
    }
}
