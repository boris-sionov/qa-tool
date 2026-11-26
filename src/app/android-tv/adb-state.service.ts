import {Injectable} from '@angular/core';
import {BehaviorSubject, distinctUntilChanged} from 'rxjs';
import {AdbPackageInfo, AdbService} from '../core/services/adb.service';
import {extractMessage} from '../core/utils/error.utils';
import {DeviceStatus} from '../shared/components/device-list/device-list.component';
import {ReachabilityService} from '../core/services/reachability.service';

export interface SavedDevice {
    name: string;
    ip: string;
    port: number;
    /** When this TV was last seen connected (ms since epoch); orders the lists. */
    lastConnected?: number;
}

export function deviceSerial(d: SavedDevice): string {
    return `${d.ip}:${d.port}`;
}

/**
 * Whether ADB really holds the selected TV. `unauthorized`: the TV is reachable but is showing its
 * "Allow USB debugging?" prompt for this computer.
 */
export type AdbConnection =
    | {device: null, status: 'none'}
    | {device: SavedDevice, status: 'checking' | 'connected' | 'unauthorized'}
    | {device: SavedDevice, status: 'failed', error: string};

const STORAGE_KEY = 'freetv-android-tv-devices';
/** Written by older versions, which reopened on the last pick; now only cleaned up. */
const SELECTED_STORAGE_KEY = 'freetv-android-tv-selected-device';
const LIBRARY_STORAGE_KEY = 'freetv-android-tv-apk-library';
/** The team's library on freetv-server, reached over Tailscale. */
export const DEFAULT_APK_LIBRARY = 'http://freetv-server:8090/';

/**
 * What the dot of a saved TV says. adb holding the TV (`device`) or waiting for Allow
 * (`unauthorized`) is authoritative; otherwise the TV counts as reachable when its port answers,
 * since adb has simply not been asked to connect it yet.
 */
export function mergeStatus(live: 'device' | 'unauthorized' | null, reachable: boolean): DeviceStatus {
    if (live === 'device') return 'connected';
    if (live === 'unauthorized') return 'unauthorized';
    return reachable ? 'connected' : 'failed';
}

@Injectable({providedIn: 'root'})
export class AdbStateService {

    /** Nothing is selected until QA picks a TV: not restored, not guessed. */
    selected$ = new BehaviorSubject<SavedDevice | null>(null);
    /** Connection status of every saved TV by serial, filled in by `scan()` and `checkConnection()`. */
    statuses$ = new BehaviorSubject<Record<string, DeviceStatus>>({});
    /** Pages load from the TV once this says `connected`, not as soon as a device is selected. */
    connection$ = new BehaviorSubject<AdbConnection>({device: null, status: 'none'});
    /** True while `scan()` is finding out which saved TVs are connected. */
    scanning$ = new BehaviorSubject(false);
    private checkSeq = 0;
    private scanSeq = 0;
    private packagesCache = new Map<string, AdbPackageInfo[]>();

    getCachedPackages(serial: string): AdbPackageInfo[] | null {
        return this.packagesCache.get(serial) ?? null;
    }

    setCachedPackages(serial: string, packages: AdbPackageInfo[]): void {
        this.packagesCache.set(serial, packages);
    }

    invalidatePackages(serial: string): void {
        this.packagesCache.delete(serial);
    }

    constructor(private adb: AdbService, private reach: ReachabilityService) {
        const isInitialized = localStorage.getItem('adb-state-initialized');
        if (!isInitialized) {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.setItem('adb-state-initialized', 'true');
        }
        localStorage.removeItem(SELECTED_STORAGE_KEY);
        // A selection is not a connection: the TV may have gone to sleep or left the network since.
        // Check it whenever the selection changes.
        this.selected$
            .pipe(distinctUntilChanged((a, b) => (a && deviceSerial(a)) === (b && deviceSerial(b))))
            .subscribe(() => this.checkConnection());
    }

    /**
     * Run when the Android TV section opens: fills `statuses$` for every saved TV (the dots) and
     * selects nothing. Asks adb which TVs it holds and, in parallel, which ports answer.
     *
     * Only looks — it never tries to connect a TV. Connecting happens for the one the user picks.
     */
    async scan(): Promise<void> {
        const seq = ++this.scanSeq;
        const devices = this.getSavedDevices();
        this.scanning$.next(true);
        this.statuses$.next(Object.fromEntries(devices.map(d => [deviceSerial(d), 'checking'])));
        const [live, open] = await Promise.all([
            this.adb.liveStates(devices.map(deviceSerial)).catch(() => ({} as Awaited<ReturnType<AdbService['liveStates']>>)),
            this.reach.statuses(devices.map(d => ({key: deviceSerial(d), host: d.ip, port: d.port}))),
        ]);
        if (seq !== this.scanSeq) return;
        this.stampConnected(devices.map(deviceSerial).filter(key => live[key] === 'device'));
        const picked = this.selected$.value && deviceSerial(this.selected$.value);
        this.statuses$.next(Object.fromEntries(devices.map(d => {
            const key = deviceSerial(d);
            // The TV QA picked meanwhile has its own, fresher check.
            if (key === picked && this.statuses$.value[key] !== 'checking') return [key, this.statuses$.value[key]];
            return [key, mergeStatus(live[key] ?? null, open[key] === 'connected')];
        })));
        this.scanning$.next(false);
    }

    /** Remembers that these TVs are connected now, for the "most recently connected first" order. */
    private stampConnected(serials: string[]): void {
        if (serials.length === 0) return;
        const now = Date.now();
        const list = this.getSavedDevices().map(d => serials.includes(deviceSerial(d)) ? {...d, lastConnected: now} : d);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }

    /** A click on a TV in the list: pick it, or check it again when it is already the picked one. */
    choose(device: SavedDevice): void {
        if (this.selected$.value && deviceSerial(this.selected$.value) === deviceSerial(device)) {
            void this.checkConnection();
        } else {
            this.select(device);
        }
    }

    /** Verifies the selected TV's connection and reconnects it if needed. */
    async checkConnection(): Promise<void> {
        const device = this.selected$.value;
        const seq = ++this.checkSeq;
        if (!device) {
            this.connection$.next({device: null, status: 'none'});
            return;
        }
        this.setStatus(device, 'checking');
        this.connection$.next({device, status: 'checking'});
        const next = await this.probe(device);
        this.setStatus(device, next.status);
        if (next.status === 'connected') this.stampConnected([deviceSerial(device)]);
        // A newer check (another device picked meanwhile) wins.
        if (seq === this.checkSeq) this.connection$.next(next);
    }

    private async probe(device: SavedDevice): Promise<Extract<AdbConnection, {device: SavedDevice}>> {
        try {
            const state = await this.adb.ensureConnected(deviceSerial(device));
            return {device, status: state === 'device' ? 'connected' : 'unauthorized'};
        } catch (e) {
            return {device, status: 'failed', error: extractMessage(e, `Cannot connect to ${device.ip}`)};
        }
    }

    private setStatus(device: SavedDevice, status: DeviceStatus): void {
        this.statuses$.next({...this.statuses$.value, [deviceSerial(device)]: status});
    }

    /** Where the APK library lives: a folder path or a server URL. */
    get apkLibrary(): string {
        return localStorage.getItem(LIBRARY_STORAGE_KEY) || DEFAULT_APK_LIBRARY;
    }

    set apkLibrary(source: string) {
        localStorage.setItem(LIBRARY_STORAGE_KEY, source.trim());
    }

    getSavedDevices(): SavedDevice[] {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
        } catch {
            return [];
        }
    }

    saveDevice(device: SavedDevice): void {
        const list = this.getSavedDevices();
        const idx = list.findIndex(d => d.ip === device.ip && d.port === device.port);
        if (idx >= 0) {
            list[idx] = {...list[idx], ...device};
        } else {
            list.push(device);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }

    removeDevice(device: SavedDevice): void {
        const list = this.getSavedDevices().filter(
            d => !(d.ip === device.ip && d.port === device.port)
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        if (this.selected$.value?.ip === device.ip && this.selected$.value?.port === device.port) {
            this.select(null);
        }
    }

    select(device: SavedDevice | null): void {
        this.selected$.next(device);
    }
}
