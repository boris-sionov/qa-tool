import {AppConfig} from '../../environments/environment';
import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {APP_VERSION} from '../core/build-info';
import {Release, UpdateService} from '../core/services/update.service';
import {SemVer} from 'semver';
import {AdbStateService} from '../android-tv/adb-state.service';
import {TizenStateService} from '../tizen/tizen-state.service';
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
const open = {label: 'Open apps', icon: 'apps' as Icon};

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
export class PlatformSelectorComponent implements OnInit {
    readonly appName = AppConfig.appName;
    readonly appVersion = APP_VERSION;
    /** Android Phone is left out of QA Tool Lite. */
    /** The platform shown on the stage; none means the overview. */
    current: PlatformInfo | null = null;
    readonly platforms = AVAILABLE_PLATFORMS;
    update: { release: Release, version: SemVer } | null = null;

    constructor(private router: Router, private updates: UpdateService,
                private adb: AdbStateService, private tizen: TizenStateService) {
    }

    ngOnInit(): void {
        this.updates.availableUpdate().then(u => this.update = u);
    }

    get stage(): Stage {
        return STAGES[this.current!.id];
    }

    select(p: PlatformInfo | null): void {
        this.current = p;
        this.loadDevices();
    }

    /** Saved devices of the current platform. Only Android TV and Samsung keep a list the home page can read. */
    devices: {name: string; ip: string}[] | null = null;

    private loadDevices(): void {
        switch (this.current?.id) {
            case 'android-tv': this.devices = this.adb.getSavedDevices(); break;
            case 'tizen': this.devices = this.tizen.getSavedDevices(); break;
            default: this.devices = null;
        }
    }

    open(path: string): void {
        this.router.navigate([this.current!.route, path]);
    }

    dismissUpdate(): void {
        if (this.update) this.updates.ignoreUntil = this.update.version;
        this.update = null;
    }
}
