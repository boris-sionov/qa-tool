# Device Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No device is opened until QA clicks one: every platform's Apps/Info pages start from a searchable row list with status dots, a Back-to-list button replaces the device dropdown, and Home's saved devices open on click.

**Architecture:** One shared `<app-device-picker>` (rows, search, status dots, Add row, empty state), a shared `<app-device-chip>` (Back button + name) and a Rust `port_probe` command that fills the dots by TCP-probing each device's port. Each platform's state service stops restoring or auto-picking a selection (selection lives in memory for the session); LG's "default device" is removed and becomes the same in-memory selection.

**Tech Stack:** Angular 18.2 (NgModules + standalone, `@if/@for`), Tauri 2 / Rust, Karma + Jasmine (`TauriDesktop`), `cargo test -p qa-tool`.

**Spec:** `docs/superpowers/specs/2026-11-26-device-picker-design.md`

## Global Constraints

- **Builds on uncommitted work** of another session on branch `feat/atv-open-and-device-list` (the `scan()` / `statuses$` / `choose()` in `adb-state.service.ts`, `shared/components/device-list/` (cards, used by Android TV Manage — leave it alone), `android-tv/device-picker/` (to be replaced)). Do not revert their changes; confirm with `git status` before starting that they are still there.
- **No commits, no pushes** (project owner's rule). Steps end with a green test run, not a commit.
- VIDAA is untouched (keeps **Connect to a TV**). Manage Devices pages are unchanged.
- Never connect, or probe with credentials, before QA clicks: the dot only opens and closes a TCP port (1 s timeout, all at once).
- Dots, no text: filled green = answers; hollow grey = not answering; pulsing grey = checking; amber (phones) = waiting for Allow; tooltip *Reachable* / *Not answering*. Hollow vs filled so it is not colour-only.
- Search filters live by name and IP through `<app-list-filter>` + `matches()`; **Enter does nothing**.
- Saved-device lists and their `localStorage` keys stay exactly as they are (AGENTS.md "Legacy Names That Hold User Data"); only the *selected-device* keys stop being read.
- A new Tauri command goes in all three places (`generate_handler!`, `build.rs`, permission `default.toml`); `acl_tests` must pass.
- Standalone components must import `SpinnerComponent` etc. themselves; new buttons use the `_btn.scss` mixins (`@use '…/styles/btn' as *;`), colours from the design system (`#5B9FF5`, `#0F172B`).
- Karma: `npm run ng -- test --browsers=TauriDesktop --watch=false --include='**/<name>.spec.ts'`. Dev run: `npm run start` after freeing port 4281 (`lsof -i :4281`).

## Review Focus

1. A platform with **no saved devices** must show the empty state, never an empty list (picker renders `<app-empty-state>` itself).
2. **Search matches nothing** → "No device matches", not a blank area; search is case-insensitive and also matches a partial IP (`50.2`).
3. A **device that does not answer** (probe times out) must not block the list: rows render at once as *checking*, late results are dropped if the list changed.
4. The **selected device is removed** (Manage page) or a **phone is unplugged** → selection clears and the picker returns, never a stale page.
5. LG `novacom-devices.json` still has `"default": true` on a device → it must **not** be selected at start.

---

### Task 1: `port_probe` Rust command

**Files:**
- Modify: `src-tauri/src/plugins/net_scan.rs` (add command + helper + test), `src-tauri/src/plugins/samsung_tizen.rs` (register next to `super::net_scan::lan_scan,` ~line 1581), `src-tauri/build.rs` (add `"port_probe"` after `"lan_scan"` ~line 93), `src-tauri/permissions/adb-manager/default.toml` (add `"allow-port-probe"` after `"allow-lan-scan"`).

**Interfaces:**
- Produces: `invoke('plugin:adb-manager|port_probe', {targets: string[]}) → boolean[]` — `targets` are `"ip:port"`, result is in the same order; unparsable target → `false`.

- [ ] **Step 1: Write the failing test** `probe_reports_open_and_closed_ports_in_order` in `net_scan.rs` tests: bind a `TcpListener` on `127.0.0.1:0` (open), take another listener's address then drop it (closed), plus `"not an address"`; assert `probe(&[open, closed, bad], Duration::from_millis(300)) == vec![true, false, false]`.
- [ ] **Step 2: Run** `cargo test -p qa-tool probe_reports` → FAIL (`probe` not defined).
- [ ] **Step 3: Implement** `fn probe(targets: &[String], timeout: Duration) -> Vec<bool>` (parse with `SocketAddr::from_str`, `TcpStream::connect_timeout`, `std::thread::scope` so all run at once, order preserved) and `#[tauri::command] pub(crate) async fn port_probe(targets: Vec<String>) -> Result<Vec<bool>, Error>` running it in `tauri::async_runtime::spawn_blocking` with a 1000 ms timeout.
- [ ] **Step 4: Register** in the three places above.
- [ ] **Step 5: Run** `cargo test -p qa-tool probe_reports` and `cargo test -p qa-tool acl_tests` → PASS.

### Task 2: Shared UI — dot, chip, picker, reachability

**Files:**
- Create: `src/app/core/services/reachability.service.ts`, `src/app/shared/components/status-dot/status-dot.component.ts`, `src/app/shared/components/device-chip/device-chip.component.ts`, `src/app/shared/components/device-picker/device-picker.component.{ts,html,scss}`, specs `status-dot.component.spec.ts`, `device-picker.component.spec.ts`.
- Modify: `src/app/shared/components/list-filter/list-filter.component.ts` (add `@Input() placeholder = 'Filter by name or ID'` used by the input), `src/app/shared/shared.module.ts` (declare + export `DevicePickerComponent`).

**Interfaces:**
- Consumes: `DeviceStatus` (`'checking'|'connected'|'unauthorized'|'failed'`) from `shared/components/device-list/device-list.component.ts`; `matches()` from `list-filter.component.ts`; `BackendClient` (`core/services/backend-client.ts`).
- Produces:
  - `interface ProbeTarget {key: string; host: string; port: number}`; `ReachabilityService.statuses(targets: ProbeTarget[]): Promise<Record<string, DeviceStatus>>` — `connected` when the port answers, else `failed`; on error all `failed`.
  - `StatusDotComponent` (standalone, `<app-status-dot [status]>`) plus pure `dotClass(status?: DeviceStatus): 'on'|'off'|'checking'|'warn'` (undefined → `checking`) and `dotTitle(status?): string`.
  - `DeviceChipComponent` (standalone, `<app-device-chip [name] [status]? (back)>`): a secondary small **Devices** button (`bi-chevron-left`), the name, the dot only when `status` is given.
  - `interface PickerDevice {key: string; name: string; address: string; port?: number}`; `filterDevices(devices, search): PickerDevice[]` (name or address, via `matches`).
  - `<app-device-picker kicker devices statuses? emptyLink (pick)>`: `@Input() kicker = ''`, `devices: PickerDevice[]`, `statuses?: Record<string, DeviceStatus>`, `emptyLink: any[] = ['../devices']`, `@Output() pick = new EventEmitter<string>()` (the clicked `key`).

- [ ] **Step 1: Write failing specs.** `status-dot`: `dotClass('connected') === 'on'`, `'failed' → 'off'`, `'checking' → 'checking'`, `'unauthorized' → 'warn'`, `undefined → 'checking'`; `dotTitle('connected') === 'Reachable'`, `dotTitle('failed') === 'Not answering'`. `device-picker`: with `[{key:'a',name:'Living room',address:'192.168.50.180'},{key:'b',name:'Bedroom',address:'192.168.50.211'}]`: `filterDevices(d,'50.2')` → only Bedroom; `'living'` → Living room; `'LIVING'` → Living room; `'zzz'` → `[]`; `''` → both.
- [ ] **Step 2: Run** both specs → FAIL.
- [ ] **Step 3: Implement** `dotClass`, `dotTitle`, `StatusDotComponent` (filled disc for on/warn, ring for off, pulse animation for checking; `title` from `dotTitle`) and `filterDevices`.
- [ ] **Step 4: Implement `ReachabilityService`** (`extends BackendClient`, `super(zone, 'adb-manager')`, invoke `port_probe`).
- [ ] **Step 5: Implement `DevicePickerComponent`.** Template: kicker + `Choose a device`; `<app-list-filter placeholder="Search name or IP">` bound to a `search` field; one `<button>` row per `filterDevices(...)` result (icon tile, name, mono address, `<app-status-dot>`, chevron) emitting `pick`; last row `+ Add new device` as `routerLink` to `emptyLink`; when `devices` is empty render only `<app-empty-state [link]="emptyLink">`; when the filter hides everything show "No device matches". When `statuses` is undefined, `ngOnChanges` probes devices that carry `port` through `ReachabilityService` (key `host=address`), dropping results if `devices` changed meanwhile; rows without a result are `checking`. No Enter handling.
- [ ] **Step 6: Run** both specs → PASS; `npm run ng -- build` compiles.

### Task 3: Android TV

**Files:**
- Modify: `src/app/android-tv/adb-state.service.ts`, `adb-state.service.spec.ts`, `android-tv.module.ts`, `apps/android-tv-apps.component.{html,ts}`, `info/android-tv-info.component.{html,ts}`.
- Delete: `src/app/android-tv/device-picker/`.

**Interfaces:**
- Consumes: Task 2 components, `ReachabilityService`.
- Produces: `mergeStatus(live: 'device'|'unauthorized'|null, reachable: boolean): DeviceStatus` exported from `adb-state.service.ts`.

- [ ] **Step 1: Replace the `soleConnected` spec** with `mergeStatus` cases: `('device', false) → 'connected'`, `('unauthorized', true) → 'unauthorized'`, `(null, true) → 'connected'`, `(null, false) → 'failed'`. Run it → FAIL.
- [ ] **Step 2: Implement** in `adb-state.service.ts`: delete `soleConnected`; in `scan()` stop calling `this.select(null)` and delete the "select the only connected TV" lines (selection is cleared by Home's **Choose a device** and by Back, not by section entry); after `liveStates`, probe `{key: serial, host: ip, port}` for every saved TV with `ReachabilityService` and set `statuses$` from `mergeStatus`. Port 5555 answering with adb not holding the TV shows as reachable (green).
- [ ] **Step 3: Apps and Info templates.** Remove the `ngbDropdown` block and the `selectDevice` / `devices` members it used. With no `serial`/selected device show only `<app-device-picker kicker="Android TV" [devices]="pickerDevices" [statuses]="(state.statuses$ | async) ?? {}" (pick)="pick($event)">` (no toolbar at all). With a selection the toolbar starts with `<app-device-chip [name]="selected.name" [status]="…" (back)="state.select(null)">`, then Collect logs / Install. The failed / unauthorized cards keep their buttons and the chip stays above them. `pickerDevices` maps saved devices to `{key: deviceSerial(d), name: d.name, address: d.ip}`; `pick(key)` calls `state.choose(device)`. Info page: chip above the content, picker when `!device`.
- [ ] **Step 4: Remove** `DevicePickerComponent` from `android-tv.module.ts`; delete its folder.
- [ ] **Step 5: Run** `adb-state.service.spec.ts` → PASS; `npm run ng -- build` compiles.

### Task 4: Samsung Tizen

**Files:**
- Modify: `src/app/tizen/tizen-state.service.ts`, `tizen.component.{ts,html}`, `apps/tizen-apps.component.{html,ts}`, `info/tizen-info.component.{html,ts}`; Create: `tizen-state.service.spec.ts`.

**Interfaces:** Consumes Task 2 components. Produces: `TizenStateService.selected$` starts `null`; `select(device: TizenDevice | null)` no longer writes storage.

- [ ] **Step 1: Write failing spec** (`localStorage` seeded with two devices and the old `smart-tv-qa-tizen-selected-device`): new service has `selected$.value === null`; after `select(a)` the selected key is still not written; `removeDevice(a)` while selected → `selected$.value === null` (not the next device); the saved list key is untouched. Run → FAIL.
- [ ] **Step 2: Implement:** `selected$ = new BehaviorSubject<TizenDevice | null>(null)`; delete `getLastSelectedDevice`; `select` only `next`s; the constructor removes the old `SELECTED_STORAGE_KEY`; `removeDevice` selects `null`.
- [ ] **Step 3: Shell:** `TizenComponent.ngOnInit` keeps only `void this.requirements.autoCheck()`; drop `devices`, `selected`, `onDevicesChanged` and the `(activate)` binding.
- [ ] **Step 4: Apps and Info templates:** same pattern as Task 3 (picker with `kicker="Samsung"` and `port` set so dots self-probe; chip + `(back)="state.select(null)"`; Remote and Install only with a selection; remove `ngbDropdown`, `selectDevice`).
- [ ] **Step 5: Run** the spec → PASS; build compiles.

### Task 5: LG webOS — no default device

**Files:**
- Modify: `src/app/core/services/device-manager.service.ts`, `lg/lg.component.ts`, `apps/apps.component.{html,ts}`, `info/info.component.html`, `files/files.component.{html,ts}`, `terminal/terminal.component.{html,ts}`, `debug/debug.component.{html,ts}`, `devices/devices.component.html` (line ~66 `device.default`); Create: `core/services/device-manager.service.spec.ts`.

**Interfaces:**
- Produces: `keepSelection(devices: Device[], current: Device | null): Device | null` (exported; the device with `current.name` from the new list, else `null`; **never** reads `default`); `DeviceManagerService.select(name: string | null): void`; `selectedSubject` becomes a `BehaviorSubject<Device | null>`. `setDefault` is deleted from the TS service; the Rust `set_default` and the `default` field stay.

- [ ] **Step 1: Write failing spec** for `keepSelection`: a list with `{name:'A', default:true}` and `{name:'B'}` and `current = null` → `null`; `current = B` and list still has B → B (the new object); `current = B` and B gone → `null`; empty list → `null`. Run → FAIL.
- [ ] **Step 2: Implement** `keepSelection`, `select`, and `onDevicesUpdated` (`devicesSubject.next(devices); selectedSubject.next(keepSelection(devices, selectedSubject.value))`); delete `setDefault`.
- [ ] **Step 3: Remove default usage:** `lg.component.ts` (`selectedDevice`, its subscription, `markDefault`; after the add-device wizard just reload, selecting nothing); `devices.component.html` shows the **Disconnect SSH session** button for the selected device (`deviceManager.selected$`) instead of `device.default`.
- [ ] **Step 4: Pages.** `apps` and `info`: remove the dropdown; no selection → `<app-device-picker kicker="LG" [devices]="pickerDevices" (pick)="deviceManager.select($event)">` (`{key: d.name, name: d.name, address: d.host, port: d.port}` — check `src/app/types/device.ts` for the field names); selection → chip (`(back)="deviceManager.select(null)"`) above the content, Install only with a selection. `files`: replace the `<select>` breadcrumb item by the chip and the `app-empty-state` at line ~96 by the picker. `terminal` and `debug`: replace their empty states by the picker; make sure `terminal.newTab()`'s `firstValueFrom(selected$.pipe(filter(isNonNull)))` is only reachable with a selection.
- [ ] **Step 5: Run** the spec → PASS; build compiles.

### Task 6: Android Phone

**Files:**
- Modify: `src/app/android-phone/phone-state.service.ts`, `status/phone-status.component.html`, `apps/phone-apps.component.{html,ts}`, `info/phone-info.component.html`; Create: `phone-state.service.spec.ts`.

**Interfaces:** Produces: `phoneStatus(state: string): DeviceStatus` (exported: `device → connected`, `unauthorized → unauthorized`, anything else → `checking`); `PhoneStateService.select(serial: string | null)`; `current` is `null` until a phone is picked.

- [ ] **Step 1: Write failing spec** (`new PhoneStateService({} as PhoneService)`, set `phones = [{serial:'a',state:'device',…},{serial:'b',state:'unauthorized',…}]`): `current === null` and `ready === false` before any pick; `select('a')` → `current.serial === 'a'`, `ready === true`; set `phones` without `a` → `current === null`; `localStorage` has no `smart-tv-qa-phone-selected` afterwards; `phoneStatus('offline') === 'checking'`. Run → FAIL.
- [ ] **Step 2: Implement:** drop `SELECTED_KEY` storage (remove the old key in the constructor); `current` is only the picked phone while still listed; `select(serial)` accepts `null`.
- [ ] **Step 3: Status page:** the `!state.current` branch splits — no phones → the existing "No devices connected" steps; phones listed → `<app-device-picker kicker="Android Phone" [devices]="…" [statuses]="…" (pick)="state.select($event)">` (`key = serial`, `name = name(phone)`, `address = serial`, statuses from `phoneStatus`). The unauthorized card gets a **Devices** back button (`state.select(null)`).
- [ ] **Step 4: Apps/Info:** replace the dropdown with the chip (`(back)="state.select(null)"`, `[status]="'connected'"`); remove `switchTo`.
- [ ] **Step 5: Run** the spec → PASS; build compiles.

### Task 7: Home stage

**Files:**
- Modify: `src/app/platform-selector/platform-selector.component.{ts,html,scss}` and its module (import `StatusDotComponent`).

**Interfaces:** Consumes `AdbStateService.select`, `TizenStateService.select`, `DeviceManagerService.select`, `PhoneStateService.select`, `ReachabilityService`.

- [ ] **Step 1: Label and behaviour.** `open.label = 'Choose a device'`. The primary button calls `chooseDevice()` for every platform except VIDAA (which keeps `open('apps')`): clear that platform's selection (`select(null)` on its state service), then navigate to `apps`.
- [ ] **Step 2: Saved devices clickable.** `devices` becomes `{key, name, address, port}[]`; Android TV and Samsung from their state services, **LG** from `deviceManager.devices$` (subscribe while LG is shown, unsubscribe on destroy). Each row is a `<button class="dev">` with name, address and `<app-status-dot>`; `openDevice(key)` selects it in that platform's state service and navigates to `[route, 'apps']`. Statuses come from `ReachabilityService` when the stage loads.
- [ ] **Step 3: Styles:** `.dev` keeps the current look and gains hover / focus ring.
- [ ] **Step 4: Run** `npm run ng -- build`.

### Task 8: Docs, ignore rule, full verification

**Files:**
- Modify: `AGENTS.md`, `.gitignore`.

- [ ] **Step 1: AGENTS.md.** Update "Device State Persistence": selections are in-memory per platform, no restore; rewrite the other session's `scan()`/`soleConnected` paragraph (no auto-open; dots mean "answers"); add a **Device Picker** section (`<app-device-picker>`, `<app-device-chip>`, `<app-status-dot>`, `port_probe`, search, Back button, no dropdown); state that LG has no default device (the `default` field in `novacom-devices.json` and Rust `set_default` are unused); Home label and clickable saved devices.
- [ ] **Step 2: `.gitignore`:** add `.superpowers/`.
- [ ] **Step 3: Run everything:** `cargo test -p qa-tool` (the SSH `conn_pool` tests need Docker; note them if they fail for that reason) and `npm run ng -- test --browsers=TauriDesktop --watch=false` → PASS.
- [ ] **Step 4: Check in the app** (`npm run start`, never a built app): for Android TV, Samsung, LG and Android Phone — Home → **Choose a device** shows the list and opens nothing; clicking a saved device on Home opens it; Back returns to the list; search by name and by `50.2`; Info shows the same list; no dropdown anywhere; zero saved devices shows the empty state; Manage pages look as before; an LG device with `"default": true` is not preselected. Report what was checked and what was not.
