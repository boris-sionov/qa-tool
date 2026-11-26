# Samsung — The App Downloads The Tizen Toolchain

Status: plan, not started (2026-11-26). Nothing is committed. Revised the same day: Samsung only
(adb, LG, VIDAA and chii are out of scope and stay as they are).

## Goal

A Samsung signed install needs the Tizen CLI, its own Java, `sdb` and the certificate tools. Today
QA installs Tizen Studio by hand from the guide in the Requirements dialog. Instead, the app
downloads that toolchain itself, from our own GitHub release, and checks it afterwards.

This does **not** shrink the installer: Tizen Studio was never in it. It removes the manual
install for QA.

Decisions (Boris, 2026-11-26):
- Hosted on our own GitHub, not on freetv-server and not on Samsung.
- Internal use only, never sold.
- Samsung only.

## What gets hosted

The six packages of Samsung's CLI install, which a signed install needs and which a trimmed copy
was shown to sign a WGT with (2026-11-22): `new-common-cli`, `embedded-java`, `sdb`,
`certificate-generator`, `sdk-utils`, `sdk-utils-core`. About 184 MB zipped, 279 MB unpacked.

| Asset | Contains |
|---|---|
| `tizen-toolchain-macos.zip` | the trimmed Studio tree for macOS (Intel binaries; Apple Silicon needs Rosetta) |
| `tizen-toolchain-windows.zip` | the same for Windows |
| `tizen-toolchain-linux-x86_64.zip` | the same for Linux x86_64 (there is no arm64 build from Samsung) |

Release `tizen-toolchain-1` in `boris-sionov/qa-tool`. A release asset can be 2 GiB, so size is
no problem, and it stays out of `git clone`.

Built once by a manual workflow `tizen-toolchain-release.yml`: it takes the six zips from Samsung's
`download.tizen.org/sdk/tizenstudio/official/`, checks each against Samsung's published SHA256,
merges their `data/` folders, and publishes the release. It prints the SHA256 of each result; those
go into the Rust code.

## Design

### Where it installs

`~/tizen-studio` (`C:\tizen-studio` on Windows). That is the first entry of `studio_candidates()`
(`samsung_tizen.rs`), so `tizen_detect_studio` and every check in `tizen_prereq.rs` find it with no
change. If a Studio is already found, the app downloads nothing.

### Rust: `plugins/tizen_toolchain.rs` (new, on `adb-manager`)

- `tizen_toolchain_install(on_progress: Channel)`:
  1. stop if a Studio already exists;
  2. download the zip for this OS with `reqwest`, streaming to a temp file and reporting percent;
  3. check SHA256 (`sha2`); a mismatch deletes the file and fails;
  4. unzip (`zip` crate, already used for XAPK) into `<studio>.tmp`, `chmod +x` on Unix, write the
     `sdk.info` that `tizen.sh` reads (install path, data path);
  5. rename `<studio>.tmp` to the final folder, so a half-done install is never mistaken for a
     complete one.
- Then it runs the existing `tizen_check_prerequisites` and returns its result.
- All three places for every command (handler, `build.rs`, `permissions/adb-manager/default.toml`),
  and `acl_tests` extended.

Files fetched by our own code carry no macOS quarantine flag, so Gatekeeper does not block them.

### Angular

- The Requirements dialog gets a primary **Install automatically** button above the manual guide, with
  the existing `<app-spinner>` and progress dialog (steps: Download, Verify, Unpack, Check).
- After a failure it shows the reason (offline, blocked, hash mismatch) and **Retry**; the manual
  guide stays underneath as the fallback.
- Entering Samsung with the toolchain missing opens the dialog, as the first-time check already does.
- Apple Silicon: Rosetta needs an administrator, so it stays a one-line step in the dialog, shown
  before the button.

### The `sdb` sidecar

Unchanged. It is 1 MB and the "Bundled sdb" check stays as it is.

## Phases

| # | Work | Done when |
|---|---|---|
| 1 | The workflow, run once; release published; hashes recorded; check that `tizen version` and a signed install work from the downloaded tree (this also settles what `sdk.info` must hold) | a clean machine signs a WGT with a test certificate |
| 2 | `tizen_toolchain.rs`, ACL, tests (hash mismatch, partial download, existing Studio is left alone, ACL lists) | `cargo test -p qa-tool` passes |
| 3 | Dialog button, progress, retry; guide text | `npm run start` on a machine without Studio installs and shows all checks green |
| 4 | `AGENTS.md`: Prerequisites Check and the licence paragraph | updated |

## Risks

| Risk | Handling |
|---|---|
| **The Tizen SDK licence forbids redistribution, and the repo is public**, so this is public hosting, not internal | Boris's decision; internal use makes it unlikely to matter, but it is not covered by "internal". A private repo would need a token in the app, which defeats the idea |
| Samsung has no Windows or Linux copy tested | phase 1 runs each OS; Windows and Linux were never run so far |
| The assembled tree was never run end to end (only a trimmed copy of a real Studio was) | phase 1 is exactly that check, before any app code |
| First run needs the network and 184 MB | progress, Retry, and the manual guide as fallback |
| Certificate creation needs Certificate Manager (about 2 GB, interactive sign-in) | stays the optional last step of the guide; importing an existing profile needs nothing |
| Apple Silicon without Rosetta | the dialog says so first; the download alone still works |

## Open questions

1. Install on entering Samsung for the first time (recommended), or also at app start?
2. Keep the manual guide as a fallback under the button (recommended), or remove it?
