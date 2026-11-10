# Android — One-Click ADB Setup (check, install, add to PATH)

Status: design, not started (2026-11-05). To be built and checked on the Windows QA machine.

## Goal

The Android TV and Android phone pages should never fail with a bare adb error. The tool checks
that adb works. If it does not, it says so in the page and offers one **Install ADB** button, which:

- gets Google's platform-tools
- makes the tool use them
- puts `adb` on the user's PATH, so `adb` also works from any new terminal

Windows comes first. macOS and Linux get the same button where Google publishes a build.

Out of scope: phone USB drivers (see *Later*), installing anything machine-wide, and Samsung `sdb`.

## What the tool does today

- **The app never uses an installed adb.** Every call goes through the bundled sidecar
  (`app.shell().sidecar("adb")` in `run_adb` and `adb_connect`, `plugins/adb.rs`). So the question
  is not "is adb installed", but "does the adb we run, run".
- **Windows ships `adb.exe` alone.** `scripts/download-adb.ps1` and the release workflow copy only
  `adb.exe` out of platform-tools. Google's `adb.exe` loads `AdbWinApi.dll` and `AdbWinUsbApi.dll`
  from its own folder. Without them it should not start at all: Windows reports
  `AdbWinApi.dll was not found`, exit `0xC0000135`. If so, Android TV and Android phone are broken
  in every Windows build, v1.0.0 included. Phase 0 confirms this.
- **Linux arm64 ships an x86_64 adb**, which does not run there, because Google publishes no arm64
  Linux build (see AGENTS.md → Building On Linux ARM64).
- **Two adb versions fight.** Each adb client kills a server of another version on port 5037, which
  drops every connected TV (the comment on `scrcpy_open` in `adb_phone.rs`). So the tool, scrcpy
  and the user's terminal must all run *the same* adb. That is the reason to put the tool's adb on
  PATH, rather than letting a terminal pick up some other adb.

## Design

### One adb, resolved in one place

Replace the two `sidecar("adb")` call sites with one resolver in `plugins/adb.rs`:

```rust
pub(super) struct AdbProgram { path: PathBuf, source: AdbSource }  // Installed | Bundled | Path
pub(super) fn adb_program<R: Runtime>(app: &AppHandle<R>) -> Result<AdbProgram, Error>
```

It checks these in order and uses the first that exists:

1. **Installed by the tool:** `<app_local_data_dir>/platform-tools/adb(.exe)`. On Windows that is
   `%LOCALAPPDATA%\com.smarttv.qa-tool\platform-tools\`.
2. **Bundled:** the sidecar next to the app executable.
3. **On PATH**, or in the standard SDK folders: `%LOCALAPPDATA%\Android\Sdk\platform-tools`,
   `~/Library/Android/sdk/platform-tools`, and `/opt/homebrew/bin` / `/usr/local/bin` /
   `/usr/bin`, using the same search `find_scrcpy` does.

The installed copy wins, so after a click on Install, the tool, scrcpy (`ADB` env, already set in
`scrcpy_open`) and new terminals all run one binary. `run_adb` and `adb_connect` use
`tokio::process::Command::new(program.path)` instead of the sidecar. Nothing else changes for
callers.

Why the tool's own folder, not `%LOCALAPPDATA%\Android\Sdk`: Android Studio owns that folder and
tracks it with `package.xml`, and overwriting it can confuse Studio's SDK manager. It is still
searched (step 3), so a machine with Studio already works.

### `adb_status`: the check

A new command, returning:

```ts
interface AdbStatus {
  working: boolean;          // `adb version` ran and printed a version
  source: 'installed' | 'bundled' | 'path' | null;
  path: string | null;
  version: string | null;    // "36.0.0" from "Platform-tools version 36.0.0-…"
  error: string | null;      // why it does not run, e.g. "AdbWinApi.dll was not found"
  onPath: boolean;           // a new terminal finds the same adb we use
  pathAdb: string | null;    // what a new terminal would run instead, if different
  canInstall: boolean;       // false where Google has no build (Linux arm64)
  installHint: string | null; // what to do instead, e.g. "sudo apt install adb"
}
```

`working` comes from running `adb version` with a 5 s timeout. On Windows, exit `0xC0000135` (-1073741515)
maps to "a DLL next to adb.exe is missing", so the message names the actual cause.
`onPath` reads the **user and system PATH from the registry**, not the app's own environment: a
GUI app keeps the PATH it started with.

### The message and the button

`AdbSetupComponent` (new, `src/app/shared/components/adb-setup/`), with state in an
`AdbSetupService` that caches `adb_status` and re-checks after an install. It is shown at the top
of the Android TV and Android phone pages, and in the add-device dialog, before anything else
calls adb.

| Status | What QA sees | Button |
|---|---|---|
| not working, `canInstall` | "ADB is not installed or does not run on this computer: *error*. The Android TV and phone pages need it." | **Install ADB** |
| not working, no `canInstall` | the same, plus `installHint` | none (copy-able command) |
| working, not on PATH | a small muted line: "ADB 36.0.0 works in the tool. `adb` in a terminal: not found / another version (*pathAdb*)." | **Add ADB to terminal** (same install) |
| working, on PATH | nothing on the pages; Info shows "ADB 36.0.0 · installed · on PATH" | **Update ADB** in Info |

The pages do not call adb while the status says it is not working. That replaces today's raw
"Failed to run ADB" errors with the banner.

### `adb_install_tools`: the one click

One command, with progress over a Tauri `Channel`, which drives `ProgressDialogComponent` steps
*Download → Verify → Install → Add to PATH → Check*:

1. **Download** `https://dl.google.com/android/repository/platform-tools-latest-{windows,darwin,linux}.zip`
   with `reqwest`, into a temp file. Use HTTPS only, and only this host. The URL is a constant, never taken
   from input.
2. **Verify** the zip holds `platform-tools/adb(.exe)` (and on Windows both DLLs). Google publishes no
   checksum for `latest`. On Windows, check that `adb.exe` has a valid Authenticode signature from
   **Google LLC** (`WinVerifyTrust` via the `windows` crate, or `Get-AuthenticodeSignature` through
   PowerShell). On macOS, `codesign --verify` (phase 0: does Google sign it?).
3. **Install**, with `adb kill-server` using the current adb first, since a running `adb.exe`
   locks the file on Windows. Then extract to `platform-tools.new/`, rename the old folder to
   `platform-tools.old/`, rename the new one into place, and delete the old one only after step 5
   passes. A failure renames it back.
4. **Add to PATH** without admin:
   - **Windows:**
     - Read `HKCU\Environment\Path` with the `winreg` crate, keeping its type (`REG_EXPAND_SZ`).
     - Append the folder unless it is already listed (compare case-insensitively, ignoring a trailing `\`).
     - Write it back, then broadcast `WM_SETTINGCHANGE` with `"Environment"` (`SendMessageTimeoutW`),
       so new terminals and Explorer pick it up.
     - Never use `setx`: it truncates PATH at 1024 characters.
     - If another adb comes **earlier** on the system PATH (Machine PATH is searched before User
       PATH), say so: "A terminal will still find *path* first", because the user PATH cannot
       override it without admin.
   - **macOS:** add a marked block to `~/.zprofile`:
     `# added by QA Tool` + `export PATH="…/platform-tools:$PATH"`.
   - **Linux x86_64:** the same block, in `~/.profile`.
5. **Check:** run `adb version` from the new path, then `adb start-server`. Re-run `adb_status` and
   expect `working` and `onPath`.

Afterwards the dialog says: "ADB 36.0.0 is installed. Open a **new** terminal to use `adb` there."
Terminals that were already open keep their old PATH. Killing the server drops TV connections, so
`AdbStateService` reconnects the selected TV afterwards (its `connection$` check already does
this when asked).

Each step logs a `[ADB setup]` line through `tauri_plugin_log` (`info` / `warn`, since `console.log`
does not reach the file): the URL, the version, the signature subject, the PATH change, and the outcome.

### Fix the Windows bundle as well

The button should be a fallback, not the only way Android works on Windows:

- `download-adb.ps1` also copies `AdbWinApi.dll` and `AdbWinUsbApi.dll` into `src-tauri/binaries/`.
- A new `src-tauri/tauri.windows.conf.json` adds them as bundle resources mapped to the install
  root (`"resources": {"binaries/AdbWinApi.dll": "AdbWinApi.dll", …}`), so they land next to
  `adb.exe`. Phase 0 checks they do, for both the `.msi` and the NSIS `.exe`.
- `release.yml` fetches them in "Download ADB binary (Windows)", for x64, i686 and arm64.

## Commands

On the `adb-manager` plugin (`samsung_tizen.rs` registers the `adb.rs` commands): `adb_status` and
`adb_install_tools`. Each goes in **all three** lists (`generate_handler!`, `build.rs`,
`permissions/adb-manager/default.toml`), and `acl_tests` checks them.

New crates, Windows only: `winreg`, plus `windows` (features `Win32_UI_WindowsAndMessaging`, and
`Win32_Security_WinTrust` if signature checking uses it). `zip` and `reqwest` are already dependencies.

## Phase 0: checks on the Windows machine (before code)

Install v1.0.0 (`QA.Tool_1.0.0_x64-setup.exe`) and record:

1. Android TV → add a TV. What error appears? Expected: adb does not start.
2. In PowerShell: `& "$env:LOCALAPPDATA\Programs\QA Tool\adb.exe" version`, or the
   `C:\Program Files\QA Tool\` path for the `.msi`. Note the folder's contents and the exact error.
3. `where.exe adb`: is another adb already on PATH (Android Studio, scrcpy, WinGet)? Which version?
4. Copy `AdbWinApi.dll` and `AdbWinUsbApi.dll` from a platform-tools zip next to the app's `adb.exe`.
   Does Android TV then work? This proves the bundle fix.
5. `Get-AuthenticodeSignature .\platform-tools\adb.exe | Format-List`: the signer subject
   to pin in step 2 of the install.

Record the answers in AGENTS.md under Android TV.

## Testing

- **Rust unit:**
  - the PATH edit as a pure function: append, already present, different case, trailing `\`, empty
    PATH, `;;` in the value;
  - version parsing from `adb version` output;
  - the exit-code → message mapping;
  - resolver order with temp folders.
- **Karma (`TauriDesktop`):** the banner for each status in the table; the pages do not call adb
  while not working.
- **By hand on Windows:**
  - fresh user, no adb anywhere → banner → Install → TV connects; a new PowerShell runs `adb version`;
  - an older adb already on user PATH (e.g. scrcpy's) → install → ours is used, no server fight
    (TVs stay connected while running `adb devices` in a terminal);
  - another adb on the **system** PATH → the warning shows;
  - install while a TV is connected → it reconnects;
  - no network → the download step fails with a clear message, and nothing is changed;
  - run Install twice → PATH has the folder once;
  - `Update ADB` replaces a running adb (server killed first).
- **By hand on macOS:** the same flow, `~/.zprofile` block added once.

## Files

| File | Change |
|---|---|
| `src-tauri/src/plugins/adb.rs` | `adb_program` resolver; `run_adb` / `adb_connect` use it; `adb_status`, `adb_install_tools` |
| `src-tauri/src/plugins/adb_path.rs` (new) | PATH reading and editing per OS, `WM_SETTINGCHANGE`; pure helpers for tests |
| `src-tauri/src/plugins/adb_phone.rs` | `scrcpy_open` takes its `ADB` from `adb_program` |
| `src-tauri/src/plugins/samsung_tizen.rs`, `build.rs`, `permissions/adb-manager/default.toml` | the two commands |
| `src-tauri/Cargo.toml` | `winreg`, `windows` (Windows only) |
| `src-tauri/tauri.windows.conf.json` (new) | the two DLLs as resources |
| `scripts/download-adb.ps1`, `.github/workflows/release.yml` | fetch and copy the DLLs |
| `src/app/shared/components/adb-setup/` (new), `src/app/core/services/adb-setup.service.ts` (new) | banner, button, status cache |
| `src/app/android-tv/…`, `src/app/android-phone/…` | show the banner; hold adb calls while not working; Info line |
| `AGENTS.md` | phase 0 results and the feature |

## Later

- **USB drivers for phones on Windows.** A phone over USB needs Google's USB driver (Pixel) or the
  maker's (Samsung, Xiaomi…). Installing a driver needs admin (UAC) and `pnputil`. Start with a
  hint when a phone is plugged in but `adb devices` lists nothing, linking to the right page.
- An **Update available** note, comparing `version` with the platform-tools release notes.

## Risks

- **Google moves the `latest` URL or the zip layout:** the URL is one constant; verify step 2 fails
  clearly instead of installing something half-made.
- **Antivirus quarantines `adb.exe`** or blocks the download: step 5 fails, and the message says to
  check the antivirus.
- **Locked-down PCs** that block `HKCU\Environment` edits: the tool still uses its own adb, and only
  "on PATH" stays off. The banner says so.
- **A system-PATH adb of another version** keeps fighting the server from terminals. It is
  detected and named, but fixing it needs admin, so it is left to the user.
- **Killing the adb server** drops connected TVs for a moment; they are reconnected.
