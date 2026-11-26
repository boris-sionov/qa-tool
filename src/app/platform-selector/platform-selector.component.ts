import {AppConfig} from '../../environments/environment';
import {Component, OnDestroy, OnInit} from '@angular/core';
import {Subscription} from 'rxjs';
import {Router} from '@angular/router';
import {APP_VERSION} from '../core/build-info';
import {Release, UpdateService} from '../core/services/update.service';
import {SemVer} from 'semver';
import {AdbStateService, deviceSerial} from '../android-tv/adb-state.service';
import {TizenStateService, tizenSerial} from '../tizen/tizen-state.service';
import {PhoneStateService} from '../android-phone/phone-state.service';
import {DeviceManagerService} from '../core/services/device-manager.service';
import {ReachabilityService} from '../core/services/reachability.service';
import {PickerDevice} from '../shared/components/device-picker/picker-device';
import {DeviceStatus} from '../shared/components/device-list/device-list.component';
import {AVAILABLE_PLATFORMS, PlatformId, PlatformInfo} from '../shared/platforms';

type Icon = 'apps' | 'info' | 'tv' | 'plug' | 'usb';

interface Action {
    label: string;
    hint: string;
    icon: Icon;
    path: string;
}

/** What the stage offers for a platform; its name, logo and colours come from `PLATFORMS`. */
interface Stage {
    /** The big button: opens the apps page. */
    primary: {label: string; icon: Icon};
    actions: Action[];
    /** Shown instead of a saved-device list. */
    note?: string;
}

const manage: Action = {label: 'Manage devices', hint: 'Scan, add or remove a TV', icon: 'tv', path: 'devices'};
const open = {label: 'Choose a device', icon: 'apps' as Icon};

const STAGES: Record<PlatformId, Stage> = {
    'android-tv': {primary: open, actions: [manage, {label: 'Device info', hint: 'Model, build, storage', icon: 'info', path: 'info'}]},
    lg: {primary: open, actions: [manage, {label: 'Device info', hint: 'webOS, model, year', icon: 'info', path: 'info'}]},
    tizen: {primary: open, actions: [manage, {label: 'Device info', hint: 'Tizen, model, year', icon: 'info', path: 'info'}]},
    vidaa: {
        primary: {label: 'Connect to a TV', icon: 'plug'},
        actions: [{label: 'Device info', hint: 'TV info and DevKit log', icon: 'info', path: 'info'}],
        note: 'VIDAA connects per session with the 6-character code DevKit shows, so there is no saved device list.',
    },
    'android-phone': {
        primary: open,
        actions: [
            {label: 'Phones', hint: 'Phones connected by USB', icon: 'usb', path: 'devices'},
            {label: 'Phone info', hint: 'Model, Android, battery', icon: 'info', path: 'info'},
        ],
    },
};

@Component({
    selector: 'app-platform-selector',
    templateUrl: './platform-selector.component.html',
    styleUrls: ['./platform-selector.component.scss']
})
export class PlatformSelectorComponent implements OnInit, OnDestroy {
    readonly appName = AppConfig.appName;
    readonly appVersion = APP_VERSION;
    /** Android Phone is left out of QA Tool Lite. */
    /** The platform shown on the stage; none means the overview. */
    current: PlatformInfo | null = null;
    readonly platforms = AVAILABLE_PLATFORMS;
    update: { release: Release, version: SemVer } | null = null;

    constructor(private router: Router, private updates: UpdateService,
                private adb: AdbStateService, private tizen: TizenStateService,
                private phones: PhoneStateService, private lg: DeviceManagerService,
                private reach: ReachabilityService) {
    }

    ngOnInit(): void {
        this.updates.availableUpdate().then(u => this.update = u);
    }

    ngOnDestroy(): void {
        this.lgSub?.unsubscribe();
    }

    get stage(): Stage {
        return STAGES[this.current!.id];
    }

    select(p: PlatformInfo | null): void {
        this.current = p;
        this.loadDevices();
    }

    /** Saved devices of the current platform. Android TV, Samsung and LG keep a list the home page can read; phones are plugged in, not saved. */
    devices: PickerDevice[] | null = null;
    /** The dot of each saved device: whether its port answers. */
    statuses: Record<string, DeviceStatus> = {};
    private lgSub?: Subscription;
    private probeSeq = 0;

    private loadDevices(): void {
        this.lgSub?.unsubscribe();
        this.lgSub = undefined;
        switch (this.current?.id) {
            case 'android-tv':
                this.show(this.adb.getSavedDevices().map(d => ({key: deviceSerial(d), name: d.name, address: d.ip, port: d.port})));
                break;
            case 'tizen':
                this.show(this.tizen.getSavedDevices().map(d => ({key: tizenSerial(d), name: d.name, address: d.ip, port: d.port})));
                break;
            case 'lg':
                this.lgSub = this.lg.pickerDevices$.subscribe(list => this.show(list));
                break;
            default: this.devices = null;
        }
    }

    private show(list: PickerDevice[]): void {
        this.devices = list;
        this.statuses = {};
        const seq = ++this.probeSeq;
        const targets = list.filter(d => d.port).map(d => ({key: d.key, host: d.address, port: d.port!}));
        // The platform changed while the probe ran: its answer is for devices no longer shown.
        void this.reach.statuses(targets).then(result => { if (seq === this.probeSeq) this.statuses = result; });
    }

    /** The big button: open the platform's apps page with no device picked, so QA chooses from the list. */
    chooseDevice(): void {
        switch (this.current!.id) {
            case 'android-tv': this.adb.select(null); break;
            case 'tizen': this.tizen.select(null); break;
            case 'lg': this.lg.select(null); break;
            case 'android-phone': this.phones.select(null); break;
        }
        this.open('apps');
    }

    /** A saved device on the stage: pick it and open its apps. */
    openDevice(key: string): void {
        switch (this.current!.id) {
            case 'android-tv': this.adb.select(this.adb.getSavedDevices().find(d => deviceSerial(d) === key) ?? null); break;
            case 'tizen': this.tizen.select(this.tizen.getSavedDevices().find(d => tizenSerial(d) === key) ?? null); break;
            case 'lg': this.lg.select(key); break;
        }
        this.open('apps');
    }

    open(path: string): void {
        this.router.navigate([this.current!.route, path]);
    }

    dismissUpdate(): void {
        if (this.update) this.updates.ignoreUntil = this.update.version;
        this.update = null;
    }
}
