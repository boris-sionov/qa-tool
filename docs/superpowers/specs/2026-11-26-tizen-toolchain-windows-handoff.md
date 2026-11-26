# Tizen Toolchain — Windows Check (hand-off for a session on the Windows machine)

Date: 2026-11-26. Read `2026-11-26-download-tools-design.md` first (same folder); this file is
phase 1 of it, for Windows only. **No app code in this step, and nothing is installed on a TV.**

## Why

The plan is that QA Tool downloads a trimmed Tizen toolchain (six Samsung packages) instead of
sending QA through the Tizen Studio guide. On macOS (2026-11-22) a trimmed copy of a real Studio
signed a WGT with a throwaway certificate; the six packages were compared with a working Studio
and matched. **Nothing was run on Windows**, and the package-by-package assembly was never
executed anywhere. This step answers: does the assembled tree work on Windows?

## The six packages

`new-common-cli`, `embedded-java`, `sdb`, `certificate-generator`, `sdk-utils`, `sdk-utils-core`
(the chain `COMMON-CLI` → `new-common-cli` → the other five). On macOS: about 184 MB zipped, 279 MB
unpacked. Samsung's repo: `https://download.tizen.org/sdk/tizenstudio/official/`

- list: `pkg_list_windows-64` (one block per package: `Package`, `Version`, `Path`, `SHA256`, `Depends`)
- files: `binary/<package>_<version>_windows-64.zip`; each zip holds a `data\` folder to copy into
  the Studio root

Windows' list may differ from the macOS one (package names, versions, extra dependencies). Check
the `Depends` of `COMMON-CLI` on Windows before assuming the same six.

## What the session needs

| Need | Why |
|---|---|
| Windows 10/11 x64, PowerShell, internet | download from `download.tizen.org` |
| **A working Tizen Studio at `C:\tizen-studio`** (CLI is enough) | the reference to compare the assembled tree against. If there is none, install the CLI-only one from the guide (`web-cli_Tizen_Studio_6.1_windows-64.exe --accept-license C:\tizen-studio`) |
| About 2 GB free | downloads, the reference, the assembled tree |
| A throwaway folder, e.g. `C:\tz-test`, and a temporary `USERPROFILE` for the run | so the real Studio, profiles and certificates are never touched |

Not needed: a TV, a real certificate, Certificate Manager.

## Steps

1. **Record the starting point.** Windows version; the reference's `tizen version` and
   `tools\sdb.exe version`; its `sdk.info` (and where it lives).
2. **Fetch the list and the six zips.** Read the six blocks from `pkg_list_windows-64`, download
   each zip, and check `Get-FileHash -Algorithm SHA256` against the list. Stop on any mismatch.
3. **Assemble.** `Expand-Archive` each zip into its own empty folder; copy every `data\*` into a
   fresh `C:\tz-test\tizen-studio`. Use one empty folder per zip, and never run anything from inside
   a download folder.
4. **Compare with the reference.** List files and hashes of both trees (`Get-ChildItem -Recurse -File`
   plus `Get-FileHash`) and diff. Record what the reference has that the assembled tree lacks, and the
   reverse, then say whether each is needed by the steps below.
5. **Find how the CLI locates its SDK on Windows.** Read `tools\ide\bin\tizen.bat` (the Windows
   launcher; on macOS it is `tizen.sh`, which reads `sdk.info` for `TIZEN_SDK_INSTALLED_PATH`,
   `TIZEN_SDK_DATA_PATH` and optionally `JDK_PATH`). Write down: whether `sdk.info` is used, what it
   must contain, whether the registry or an environment variable matters, and how the Java is picked.
   This is the part the app has to generate at install time.
6. **Run it from the assembled tree.** With `USERPROFILE` pointed at a temp folder: `tizen version`
   (starts a JVM, about 4 s, expects `Tizen CLI x.y.z`) and `tools\sdb.exe version`. If it needs
   `JAVA_TOOL_OPTIONS=-Duser.home=<temp>`, say so, since Java ignores the profile variable.
7. **Sign a WGT with a throwaway certificate.** Create the certificates folder first (on macOS the
   first attempt failed without it), then `tizen certificate -a Test -p <password> -f test -- <folder>`,
   `tizen security-profiles add -n test -a <folder>\test.p12 -p <password>`, and
   `tizen package -t wgt -s test -- <folder with config.xml and index.html>`. Success is a signed
   `.wgt` containing `author-signature.xml` and `signature1.xml`. Use a made-up password, never a real one.
8. **Same run on the reference**, for comparison, if anything above failed.

Windows things to watch: path length (keep the test root short), antivirus quarantining the
downloads or `sdb.exe`, `.bat` quoting with spaces in a profile path, and a JDK from `PATH` winning
over the bundled one.

## Report back (paste into the Mac session)

| Item | Value |
|---|---|
| Windows version, and the reference's `tizen version` | |
| The six packages on Windows: name, version, zip size, SHA256 matched? | |
| Differences between the assembled tree and the reference | |
| `sdk.info`: path, exact content, or "not used" and what is used instead | |
| `tizen version` and `sdb version` from the assembled tree | |
| Signing result (steps 7, 8) and any error text | |
| Unpacked size of the assembled tree; zipped size | |

With that the Mac session writes the workflow that builds `tizen-toolchain-windows.zip`, the Rust
installer and the dialog button (phases 1 to 3 of the design). Also to check there: how
`tizen_prereq.rs` starts the CLI on Windows (`.bat`), since its checks must pass against the
downloaded tree.

## Not covered by this step

Linux; Apple Silicon; installing on a TV; Certificate Manager and creating a Samsung certificate;
the legal question of hosting Samsung's files on a public repository (decided by Boris, noted in
the design).
