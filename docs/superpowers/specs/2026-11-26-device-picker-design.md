# Device picker — no device is opened until QA picks one

Status: draft for approval, 2026-11-26. Nothing built.

## Intent

Today the tool opens a device on its own: the last selection is saved and restored, so **Open apps**
reconnects to the previous TV, and an LG "default" device is picked at start. When that TV is off QA
waits for a connection that was never asked for, then reads an error.

QA wants to choose. Every platform's Apps and Info pages start from a tidy list of devices; one
click opens a device; one click goes back to the list. There is no dropdown, and no device is ever
opened, selected or connected unless QA clicked it.

## Goals

1. **Home → saved device.** Clicking a saved device in the platform's Home stage opens it: select,
   connect (as today) and land on its Apps page.
2. **Home → Open apps** opens no device. The button gets a new label (**Choose a device**) and lands on
   the Apps page showing the device list.
3. **One shared list**, `<app-device-picker>`, used by Android TV, Samsung, LG and Android Phone, on
   the Apps and Info pages when no device is selected, and for the Home stage's saved-devices list.
4. **Rows**: icon, name, address, a status dot, an *Open* affordance. A **Add new device** row last.
5. **Search** by name and by IP, live as QA types, the same box as the app lists
   (`<app-list-filter>` + `matches()`). Enter does nothing.
6. **Status dot, no text**: filled green = answers now; hollow grey = does not answer; pulsing grey =
   checking; amber (phones) = connected, waiting for Allow. Hollow vs filled so it is not colour-only;
   a tooltip says *Reachable* / *Not answering*.
7. **Back to list**: once a device is open, the toolbar shows its name and a **Devices** button that
   returns to the list. **The device dropdown is removed everywhere** (Android TV apps, Samsung apps and
   info, Android Phone apps, LG apps and info).
8. **No default device in any platform.**

## Non-goals

- VIDAA: no saved devices (a code per session), so it keeps **Connect to a TV** and is untouched.
- Manage Devices pages (cards, add, edit, delete, scan): unchanged.
- No new connection logic: a clicked device connects exactly as a selected one does today.

## Anti-goals

- Anything that connects, probes with credentials or changes a TV before QA clicks it. The status dot
  only opens a TCP port and closes it.
- A second look for the same list (rows on one page, cards on another).

## Constraints

- **Selection lives in memory for the session**, per platform. Apps to Info keeps the device; closing
  the app forgets it. `freetv-android-tv-selected-device`, `smart-tv-qa-tizen-selected-device` and
  `smart-tv-qa-phone-selected` stop being read at start. Keep the *saved device lists* (name, IP) and
  their keys exactly as they are (see "Legacy Names That Hold User Data" in AGENTS.md).
- `AdbStateService.connection$` runs `ensureConnected` on a selection change, startup restore
  included. With no restore it runs only after a click.
- **LG's "default" is its selection.** `setDefault(name)` is what the LG dropdown and the Files page
  call to select a device, it is persisted by Rust (`device_manager/manager.rs`) in
  `novacom-devices.json`, and `DeviceManagerService` (`device-manager.service.ts:212`) and
  `LgComponent` (`lg.component.ts:32`) derive the selection from it. That has to become an in-memory
  selection, and the default badge on the LG Devices page (`devices.component.html:66`) and the
  `markDefault` flow in `lg.component.ts` go away. The `default` field in the JSON file and the
  `set_default` command may stay (old files stay readable); nothing may read or write them.
- A new Tauri command goes in all three places (`generate_handler!`, `build.rs`, the permission
  `default.toml`) and `acl_tests` must pass.
- Lite build: Android Phone is hidden there, as today.

## Approaches considered

| Look | Fit | Result |
|---|---|---|
| **A. Rows** | Matches every app list in the tool; room for name, address, model; scans well; differs from the Manage page's cards | **Picked (my recommendation; confirm)** |
| B. Small tiles | Matches the Home page, but cramped past a handful of devices and little room for detail | Rejected |
| C. Wide cards, two columns | Good for telling similar TVs apart, but heavy and the same look as Manage Devices | Rejected |

Status check, how "connected" is decided:

| Option | Trade-off | Result |
|---|---|---|
| Run the existing `ensureConnected` for every device | Truthful, but 5–10 s per TV and it touches every TV | Rejected |
| **TCP probe of the platform's port, all at once, about 1 s** | Says "answers", not "will authorise"; touches nothing | **Picked** |
| No status | Simplest, but QA picks a sleeping TV and waits | Rejected |

Ports: Android TV 5555, Samsung 26101, LG 9922. Android Phone needs no probe: `adb devices` already
reports `device` / `unauthorized` and `PhoneStateService` polls it every 2 s.

## Decisions

- **Platform rail**: clicking a platform inside the app goes to its Apps page, which shows the list
  unless that platform already has a device picked this session (then it opens that one). Home's
  **Choose a device** always shows the list, clearing the platform's selection. *(my call)*
- **Pages that need a device** (Apps, Info, Logs): with no selection, Apps and Info show the picker;
  Logs keeps its message. Install, Collect logs and the other device actions are hidden in the picker.
- **Error and approval cards** (cannot connect, Allow on the TV) keep their buttons and gain the
  **Devices** back button, so a dead TV never traps QA.
- **Click on a device that does not answer** is allowed: it opens the Apps page with the usual error
  card. *(my call; blocking it would hide TVs that wake on connect)*
- **Android Phone** stops auto-picking the current phone; always a list, even with one phone.
- **Home's Saved devices**: the same rows, clickable. Status dots there too, since it is the same
  component. Android TV and Samsung only (LG and Phone have no list the Home page reads cheaply;
  LG's list is read from `DeviceManagerService`, so it can join if cheap — builder's call).
- **Search** filters as QA types, exactly like the app lists (`<app-list-filter>`); **Enter does
  nothing**. A device opens only by a click.
- **Order**: as saved. *(my call)*
- **Empty list**: the existing `<app-empty-state>`.
- AGENTS.md gets the new behaviour (picker, no restore, no default); nothing else documents it.

## Left to the builder

- The component's inputs (platform, devices, statuses, the click output) and where it lives
  (`shared/components/device-picker/`, with `SharedModule` / standalone like `app-empty-state`).
- The probe command's name and whether it takes a list of `host:port` or `{platform, ip}` pairs.
- How Home passes a clicked device to the platform shell (query parameter, state service, or route
  parameter such as `/android-tv/apps?device=<ip>:<port>`) without persisting it.
- Specs: the search `matches()` cases (name, IP, partial), probe result mapping, and the LG
  selection no longer reading `default`.

## Not verified

Nothing here is built or run. The dropdown locations and the LG default behaviour were read from
the code on 2026-11-26; the status check timings are estimates.
