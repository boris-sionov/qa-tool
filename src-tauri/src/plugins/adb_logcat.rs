//! Live `adb logcat` for one Android TV app, or for the whole device.
//!
//! The whole device log is streamed, but only lines written by the app's process are sent on
//! (an empty package id sends every line).
//! A process id changes every time the app restarts, so `pidof` is asked again every 2 s;
//! a plain `logcat --pid=<n>` would stop being useful at the first restart.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::ipc::Channel;
use tauri::{AppHandle, Runtime};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use super::adb::run_adb;
use crate::error::Error;

struct Session {
    child: CommandChild,
    stop: Arc<AtomicBool>,
}

/// One log screen at a time; starting another ends the previous one.
static SESSION: Mutex<Option<Session>> = Mutex::new(None);

fn end_session() {
    if let Some(s) = SESSION.lock().unwrap().take() {
        s.stop.store(true, Ordering::SeqCst);
        let _ = s.child.kill();
    }
}

/// The app's process ids; `None` when adb itself failed (TV busy or gone), so the caller keeps
/// the last list instead of blanking the filter. `; true` makes "app not running" (pidof exits 1)
/// an empty list rather than an error.
async fn pids_of<R: Runtime>(app: &AppHandle<R>, serial: &str, package_id: &str) -> Option<Vec<String>> {
    run_adb(app, &["-s", serial, "shell", "pidof", package_id, ";", "true"])
        .await
        .ok()
        .map(|o| o.split_whitespace().map(String::from).collect())
}

/// The process id of a `logcat -v threadtime` line: `MM-DD HH:MM:SS.mmm  PID  TID L TAG: msg`.
fn line_pid(line: &str) -> Option<&str> {
    line.split_whitespace().nth(2)
}

/// Streams the app's log lines to `on_line` (all lines when `package_id` is empty); `None` is sent
/// once when the stream ends (TV gone, adb stopped). `clear` empties the device's log buffers first.
#[tauri::command]
pub(crate) async fn adb_logcat_start<R: Runtime>(
    app: AppHandle<R>,
    serial: String,
    package_id: String,
    clear: Option<bool>,
    on_line: Channel<Option<String>>,
) -> Result<(), Error> {
    end_session();
    if clear == Some(true) {
        run_adb(&app, &["-s", &serial, "logcat", "-c"]).await?;
    }
    let all = package_id.is_empty();
    let pids = Arc::new(Mutex::new(if all { Vec::new() } else { pids_of(&app, &serial, &package_id).await.unwrap_or_default() }));

    let (mut rx, child) = app
        .shell()
        .sidecar("adb")
        .map_err(|e| Error::new(format!("Failed to create ADB sidecar: {e}")))?
        .args(["-s", serial.as_str(), "logcat", "-v", "threadtime"])
        .spawn()
        .map_err(|e| Error::new(format!("Failed to start logcat: {e}")))?;
    let stop = Arc::new(AtomicBool::new(false));
    *SESSION.lock().unwrap() = Some(Session { child, stop: stop.clone() });

    if !all {
        let (pids, stop) = (pids.clone(), stop.clone());
        tauri::async_runtime::spawn(async move {
            while !stop.load(Ordering::SeqCst) {
                tokio::time::sleep(Duration::from_secs(2)).await;
                if let Some(now) = pids_of(&app, &serial, &package_id).await {
                    *pids.lock().unwrap() = now;
                }
            }
        });
    }

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    let line = text.trim_end();
                    let mine = all || line_pid(line).is_some_and(|p| pids.lock().unwrap().iter().any(|x| x == p));
                    if mine && on_line.send(Some(line.to_string())).is_err() {
                        break;
                    }
                }
                CommandEvent::Terminated(_) | CommandEvent::Error(_) => break,
                _ => {}
            }
        }
        stop.store(true, Ordering::SeqCst);
        let _ = on_line.send(None);
    });
    Ok(())
}

#[tauri::command]
pub(crate) async fn adb_logcat_stop() -> Result<(), Error> {
    end_session();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::line_pid;

    #[test]
    fn pid_is_the_third_field() {
        let line = "11-17 13:47:08.000  4845  4913 E HttpCurlLoggingInterceptor: curl -X GET \\";
        assert_eq!(line_pid(line), Some("4845"));
    }
}
