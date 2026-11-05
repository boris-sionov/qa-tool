# LG — Ensure Login (save and restore a FreeTV session)

Status: design, not started (2026-11-04).

## Goal

QA keeps losing the FreeTV login on an LG TV: a reinstall, a cleared app, a crash. Logging in again
means the QR / device-code pairing on a second device every time. One button should bring the TV back
to logged in, using a session QA saved earlier **on the same TV**.

Out of scope: logging a TV into an account it was never logged into, several accounts per TV,
Tizen / Android TV / VIDAA.

## What FreeTV does (from the public web bundle, v1.28.x)

- The TV never takes a password. Login is QR / device code, confirmed on another device
  (`/subscriber/login`, `/subscriber/login/proceed`, `/devices/codes`).
- The login lives in a **server session cookie**, renewed in the background with
  `PUT …/httpsession` at half its lifetime. localStorage holds only player data
  (`redgalaxy-player-*`), not the session.
- Each TV has a `deviceUid`; the session is probably bound to it, which is why restore is
  same-TV only.
- The app can be browsed logged out (`ui-player--login-wall` gates playback), so "the login screen
  is not showing" does not mean logged in.

## UI

On each FreeTV row of the LG apps list (`isPriorityApp(id, title)`), next to Inspect / Launch / Stress:

- **Ensure login** — the main action.
- **Save login** — copies the session while the app is running and logged in.
- A muted line under the row: `Login saved 2026-11-04 14:20` or `No saved login`.

A saved login is one per **TV + app id**: PreProd, UAT and Prod builds talk to different servers and
keep separate cookies. Rows that are not FreeTV get neither button.

## How it works

Everything goes through the app's web inspector on port 9998, the channel the stress test already uses
(`checkTvElement` / `cdpEvalInTarget` in `src/app/apps/apps.component.ts`). It exists only for apps
installed in developer mode, which is how QA installs FreeTV; the Content Store build is not reachable.

### Save login

1. Find the app's page target in `http://<tv>:9998/json` (same matching as `isAppRunning`).
2. Check it is logged in (see *Login check*). Refuse to save a logged-out session.
3. Read every cookie with CDP `Network.getAllCookies` — HttpOnly ones included, which page JS cannot
   see — and `localStorage` with `Runtime.evaluate`.
4. Store `{host, appId, savedAt, cookies, localStorage}` (see *Storage*).

### Ensure login

1. Launch the app (`AppManagerService.launch`) and wait for its target on 9998 (poll, 20 s cap).
2. Login check. **Logged in → done:** "Already logged in".
3. No saved login for this TV + app → stop: "Not logged in, and no saved login for this TV".
4. `AppManagerService.close`, then launch again so there is a target to write into.
5. `Network.setCookies` with the saved cookies; `Runtime.evaluate` to write the saved `localStorage`.
6. Close and launch once more, so the app starts with the session from its first request.
7. Login check again → **Logged in**, or **Restore failed — the saved session has expired. Log in on
   the TV and press Save login again.**

Progress shows in `ProgressDialogComponent` with steps *Launch → Check → Restore → Relaunch → Verify*.

### Login check

To be fixed in phase 0 (below). Candidates, in order of preference:

1. `Runtime.evaluate` of a `fetch` to the account endpoint (`/subscriber/my-account` on the app's API
   host) with `credentials: 'include'` — logged in iff 2xx.
2. The app's own state (the store holding the subscriber), read through `Runtime.evaluate`.
3. The DOM: `.view-login__container` / the `icon-user-ok` header icon.

Whichever is used lives in one function, so a FreeTV change touches one place.

### Logging

Every Save and Ensure writes to the log file (`tauri_plugin_log` `info` / `warn`, as `installLog`
does — `console.log` does not reach the file), prefixed `[Login]`: host, app id, the check result,
the number of cookies written, and the outcome. Cookie values are **never** logged.

## Storage

The OS keychain, the way the Confluence token is kept: `keyring` service `com.smarttv.qa-tool`,
account `lg-session|<host>|<appId>`, value the JSON above. Not `localStorage` and not a file — these
are live session credentials.

On Linux this needs the Secret Service backend (`sync-secret-service`); without it `keyring` falls
back to an in-memory mock and nothing persists. That backend is its own PR (see AGENTS.md → Confluence
Release Pages) and must land first.

A small Rust command set — `lg_session_save`, `lg_session_load`, `lg_session_info` (saved-at only,
for the row label), `lg_session_forget` — on a new `lg-session` plugin. Cookie values cross to the
frontend only on their way to CDP. The commands go in all three lists (`generate_handler!`,
`build.rs`, `permissions/<plugin>/default.toml`) — see AGENTS.md.

## Phase 0 — checks on a real LG TV (before any code)

Needs the TV connected to the tool, which currently fails on the QA Linux machine; fix that first.

1. Does 9998 accept `Network.getAllCookies` and `Network.setCookies`? (webOS 6+ is Chromium 79+,
   which has both.) If not, fall back to `Storage.getCookies` / `Storage.setCookies`, then to
   `document.cookie` for the non-HttpOnly ones only — and record whether the session cookie is HttpOnly.
2. Which cookies are the session? Save, log out on the TV, restore only those, confirm.
3. Which login check is reliable (list above)?
4. Does a restored session survive a `PUT …/httpsession` refresh and a TV power cycle?
5. Does a restore after a **reinstall** work (same TV, same `deviceUid`)? This is the main use case.

Record the answers in AGENTS.md under LG WebOS.

## Files

| File | Change |
|---|---|
| `src/app/apps/lg-session.service.ts` (new) | Save / restore / check over CDP; one place for the login check |
| `src/app/apps/apps.component.ts` / `.html` | The two buttons, the saved-at line, the progress dialog. Move the CDP helpers it shares with the stress test into the new service rather than copying them |
| `src-tauri/src/plugins/lg_session.rs` (new) | Keychain save / load / info / forget |
| `src-tauri/build.rs`, `src-tauri/permissions/…/default.toml` | The new commands |
| `AGENTS.md` | Phase 0 results and the feature |

## Testing

- Unit (Karma, `TauriDesktop`): key building and the login-check decision given canned CDP replies.
- Rust: the saved JSON round-trips; a missing entry reads as "nothing saved", a corrupt one as an
  error naming the TV and app.
- By hand on the TV: Save → log out → Ensure login → logged in. Ensure login when already logged in
  does not close the app. Ensure login with nothing saved stops with the message.

## Risks

- **The session expires or is revoked server-side** (logout, device limit, password change): restore
  then fails. The button says so and asks for a fresh Save; it does not retry.
- **FreeTV changes how it stores the session:** the login check and cookie set are in one service.
- **Device session limits** (`HTTP_SESSION_LIMIT`, `VIDEO_SESSION_LIMIT`): restoring does not create
  a new device, so it should not count against the limit — confirm in phase 0.
