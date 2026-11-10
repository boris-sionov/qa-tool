import {Injectable} from '@angular/core';
import {open as showOpenDialog} from '@tauri-apps/plugin-dialog';
import {invoke} from '@tauri-apps/api/core';
import {DeviceProvider, DeviceInfo, Platform, PlatformApp, PlatformDevice} from '../models/device-provider.interface';

export interface AdbDevice {
    serial: string;
    state: 'device' | 'offline' | 'unauthorized' | string;
}

/** An APK in the shared library — a folder on this Mac or a web server's file list. */
export interface LibraryApk {
    name: string;
    /** A path for a folder library, a URL for a server one. */
    location: string;
    size: number | null;
    /** A ms timestamp for a folder; the listing's own date text for a server. */
    modified: string | null;
}

export interface PlayListing {
    version: string | null;
    updated: number | null;
}

export interface AdbPackageInfo {
    id: string;
    name: string;
    versionName: string;
}

// Friendly names keyed by package ID
const APP_NAME_MAP: Record<string, string> = {
    'tv.freetv.androidtv': 'FreeTV',
    'tv.freetv.androidtv.uat': 'FreeTV UAT',
    'tv.freetv.portal.preprod': 'FreeTV UAT',
    'il.co.stingtv.atv': 'StingTV',
    'il.co.stingtv.staging': 'StingTV Staging',
    'com.stingtv.androidtv': 'StingTV',
    'com.stingtv.androidtv.staging': 'StingTV Staging',
    'il.co.yes.yesplus': 'Yes+',
    'com.yes.yestv': 'Yes+',
    'tv.yes.androidtv': 'Yes+',
    'il.co.partnertv.atv': 'PartnerTV',
    'il.co.partnertv.atv.staging': 'PartnerTV Staging',
    'tv.partner.androidtv': 'PartnerTV',
    'tv.partner.androidtv.staging': 'PartnerTV Staging',
    'com.cellcom.cellcom_tv': 'CellcomTV',
    'tv.cellcom.androidtv': 'CellcomTV',
    'tv.cellcom.androidtv.stg': 'CellcomTV STG',
    'com.hot.stb': 'Hot',
    'il.co.hotnet.stb': 'Hot',
    'com.hot.nexttv': 'NextTV',
    'il.co.hot.nexttv': 'NextTV',
    'com.disney.disneyplus': 'Disney+',
    'com.warnermedia.max': 'HBO',
    'com.hbo.hbomax': 'HBO',
    'com.netflix.mediaclient': 'Netflix',
    'com.amazon.venezia': 'Amazon',
    'com.apple.appletv': 'Apple TV+',
};

function friendlyName(packageId: string): string {
    return APP_NAME_MAP[packageId] ?? packageId;
}

const WHITELISTED_APPS = [
    'FreeTV', 'FreeTV UAT',
    'StingTV', 'StingTV Staging',
    'Yes+',
    'PartnerTV', 'PartnerTV Staging',
    'CellcomTV', 'CellcomTV STG',
    'Hot', 'NextTV',
    'Disney+', 'HBO', 'Netflix', 'Amazon', 'Apple TV+',
];

// Fallback Google Play Store icon URLs for apps that don't extract properly
const BRAND_ORDER = ['FreeTV', 'Yes', 'Sting', 'Partner', 'Cellcom', 'Hot', 'NextTV', 'Disney+', 'HBO', 'Netflix', 'Amazon', 'Apple TV+'];

function appSortKey(name: string): number {
    for (let i = 0; i < BRAND_ORDER.length; i++) {
        if (name.toLowerCase().includes(BRAND_ORDER[i].toLowerCase())) {
            const isVariant = name.includes('UAT') || name.includes('Staging') || name.includes('STG');
            return i * 10 + (isVariant ? 1 : 0);
        }
    }
    return 999;
}

@Injectable({providedIn: 'root'})
export class AdbService implements DeviceProvider {

    readonly platform: Platform = 'android-tv';

    async listConnectedDevices(): Promise<PlatformDevice[]> {
        return invoke<AdbDevice[]>('plugin:adb-manager|adb_list_devices');
    }

    async connect(host: string): Promise<string> {
        return invoke<string>('plugin:adb-manager|adb_connect', {host});
    }

    async disconnect(serial: string): Promise<void> {
        return invoke<void>('plugin:adb-manager|adb_disconnect', {serial});
    }

    /**
     * Makes sure ADB holds a working connection to `serial`, reconnecting when it does not.
     *
     * `adb devices` alone is not enough: the adb server outlives the app, and after the TV sleeps
     * or changes network it keeps listing the old transport as `device` until a command on it
     * fails. So a listed device must also answer a `getprop` within a few seconds; otherwise the
     * transport is dropped and connected afresh.
     *
     * Resolves `unauthorized` when the TV is reachable but has not allowed this computer yet —
     * it is showing the "Allow USB debugging?" prompt. Throws when the TV cannot be reached.
     */
    async ensureConnected(serial: string): Promise<'device' | 'unauthorized'> {
        const state = async () => (await this.listConnectedDevices())
            .find(d => d.serial === serial)?.state;
        if (await state() === 'device' && await this.responds(serial)) return 'device';

        await this.disconnect(serial).catch(() => undefined);
        // `adb connect` to an address nothing answers on waits out the OS TCP timeout — 75 s on
        // macOS. Give up well before that; a TV that answers at all connects in about a second.
        let connectError: unknown;
        await Promise.race([
            this.connect(serial),
            new Promise((_, reject) => setTimeout(
                () => reject(new Error(`No answer from ${serial} — is the TV on, and on this network?`)), 10000)),
        ]).catch(e => connectError = e);
        let s = await state();
        if (s === 'offline') {
            // The transport is still coming up; give it a moment before calling it failed.
            await new Promise(resolve => setTimeout(resolve, 1500));
            s = await state();
        }
        if (s === 'device' || s === 'unauthorized') return s;
        throw connectError ?? new Error(`${serial} is ${s ?? 'not connected'}`);
    }

    private responds(serial: string): Promise<boolean> {
        return Promise.race([
            this.getProp(serial, 'ro.serialno').then(() => true, () => false),
            new Promise<boolean>(resolve => setTimeout(() => resolve(false), 5000)),
        ]);
    }

    async listPackages(serial: string): Promise<AdbPackageInfo[]> {
        return invoke<AdbPackageInfo[]>('plugin:adb-manager|adb_list_packages', {serial});
    }

    // DeviceProvider bridge: listApps delegates to listPackages
    async listApps(serial: string): Promise<PlatformApp[]> {
        return this.listPackages(serial);
    }

    async getProp(serial: string, prop: string): Promise<string> {
        return invoke<string>('plugin:adb-manager|adb_get_prop', {serial, prop});
    }

    async launch(serial: string, packageId: string): Promise<void> {
        return invoke<void>('plugin:adb-manager|adb_launch', {serial, packageId});
    }

    async forceStop(serial: string, packageId: string): Promise<void> {
        return invoke<void>('plugin:adb-manager|adb_force_stop', {serial, packageId});
    }

    async uninstall(serial: string, packageId: string): Promise<void> {
        return invoke<void>('plugin:adb-manager|adb_uninstall', {serial, packageId});
    }

    /** `downgrade` adds `-d`, letting an older version replace a newer one where Android allows it. */
    async install(serial: string, apkPath: string, downgrade = false): Promise<void> {
        return invoke<void>('plugin:adb-manager|adb_install', {serial, apkPath, downgrade});
    }

    async listLibrary(source: string): Promise<LibraryApk[]> {
        return invoke<LibraryApk[]>('plugin:adb-manager|apk_library_list', {source});
    }

    /** Adds an APK on this Mac to the library as `name`; refused when the name exists, unless `overwrite`. */
    async uploadToLibrary(source: string, path: string, name: string, overwrite: boolean): Promise<void> {
        return invoke<void>('plugin:adb-manager|apk_library_upload', {source, path, name, overwrite});
    }

    /** What the public Play listing shows now: the version and its "Updated on" date. */
    async playListing(packageId: string): Promise<PlayListing> {
        return invoke<PlayListing>('plugin:adb-manager|play_store_listing', {packageId});
    }

    /** The local path of a library APK, downloaded first when it lives on a server. */
    async fetchFromLibrary(location: string): Promise<string> {
        return invoke<string>('plugin:adb-manager|apk_library_fetch', {location});
    }

    /** The package id and version name an APK on this Mac declares. */
    async apkManifest(path: string): Promise<{packageId: string; versionName: string | null}> {
        return invoke('plugin:adb-manager|apk_manifest', {path});
    }

    /** Whether Tailscale is up on this Mac: `running`, `stopped`, `needs-login` or `missing`. */
    async tailscaleState(): Promise<'running' | 'stopped' | 'needs-login' | 'missing'> {
        return invoke('plugin:adb-manager|tailscale_state');
    }

    /** Runs `tailscale up`. */
    async tailscaleUp(): Promise<void> {
        return invoke<void>('plugin:adb-manager|tailscale_up');
    }

    /** The Android TVs, LG and Samsung TVs on this computer's /24 network. */
    async lanScan(): Promise<LanDevice[]> {
        return invoke<LanDevice[]>('plugin:adb-manager|lan_scan');
    }

    async openLibraryFolderChooser(): Promise<string | null> {
        return showOpenDialog({title: 'APK library folder', directory: true, multiple: false});
    }

    // DeviceProvider bridge methods
    async launchApp(serial: string, appId: string): Promise<void> {
        return this.launch(serial, appId);
    }

    async killApp(serial: string, appId: string): Promise<void> {
        return this.forceStop(serial, appId);
    }

    async installApp(serial: string, filePath: string): Promise<void> {
        return this.install(serial, filePath);
    }

    async uninstallApp(serial: string, appId: string): Promise<void> {
        return this.uninstall(serial, appId);
    }

    async openPackageChooser(): Promise<string | null> {
        return this.openApkChooser();
    }

    async getDeviceInfo(serial: string): Promise<DeviceInfo> {
        const [model, manufacturer, osVersion] = await Promise.all([
            this.getProp(serial, 'ro.product.model').catch(() => ''),
            this.getProp(serial, 'ro.product.manufacturer').catch(() => ''),
            this.getProp(serial, 'ro.build.version.release').catch(() => ''),
        ]);
        return {model, manufacturer, osVersion};
    }

    async openApkChooser(): Promise<string | null> {
        return showOpenDialog({
            filters: [{name: 'APK package', extensions: ['apk']}],
            multiple: false,
        });
    }
}

/** A TV `lanScan` found. `ready`: the port the tool connects through answers (ADB, LG dev mode, SDB). */
export interface LanDevice {
    ip: string;
    mac: string | null;
    name: string | null;
    platform: Platform;
    ready: boolean;
    openPorts: number[];
}
