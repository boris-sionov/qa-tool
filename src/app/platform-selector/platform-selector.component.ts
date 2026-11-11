import {AppConfig} from '../../environments/environment';
import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {APP_VERSION} from '../core/build-info';
import {Release, UpdateService} from '../core/services/update.service';
import {SemVer} from 'semver';
import {AdbStateService} from '../android-tv/adb-state.service';
import {TizenStateService} from '../tizen/tizen-state.service';

type Icon = 'apps' | 'info' | 'tv' | 'plug' | 'usb';

interface Action {
    label: string;
    hint: string;
    icon: Icon;
    path: string;
}

interface Platform {
    id: string;
    name: string;
    logo: string;
    /** Brand colour behind the logo and on the active marker. */
    brand: string;
    glow: string;
    /** Text on the brand-coloured button; dark where the brand is light. */
    ink?: string;
    route: string;
    /** The big button: opens the apps page. */
    primary: {label: string; icon: Icon};
    actions: Action[];
    /** Shown instead of a saved-device list. */
    note?: string;
}

const PLATFORMS: Platform[] = [
    {
        id: 'android-tv', name: 'Android TV', logo: 'android-tv.webp', brand: '#34A8FF', glow: 'rgba(52,168,255,.38)',
        route: '/android-tv', primary: {label: 'Open apps', icon: 'apps'},
        actions: [
            {label: 'Manage devices', hint: 'Scan, add or remove a TV', icon: 'tv', path: 'devices'},
            {label: 'Device info', hint: 'Model, build, storage', icon: 'info', path: 'info'},
        ],
    },
    {
        id: 'lg', name: 'LG webOS', logo: 'lg-webos.webp', brand: '#FF2F6D', glow: 'rgba(255,47,109,.34)',
        route: '/lg', primary: {label: 'Open apps', icon: 'apps'},
        actions: [
            {label: 'Manage devices', hint: 'Scan, add or remove a TV', icon: 'tv', path: 'devices'},
            {label: 'Device info', hint: 'webOS, model, year', icon: 'info', path: 'info'},
        ],
    },
    {
        id: 'tizen', name: 'Samsung Tizen', logo: 'tizen.webp', brand: '#1CA7FF', glow: 'rgba(28,167,255,.38)',
        route: '/tizen', primary: {label: 'Open apps', icon: 'apps'},
        actions: [
            {label: 'Manage devices', hint: 'Scan, add or remove a TV', icon: 'tv', path: 'devices'},
            {label: 'Device info', hint: 'Tizen, model, year', icon: 'info', path: 'info'},
        ],
    },
    {
        id: 'vidaa', name: 'VIDAA', logo: 'vidaa.webp', brand: '#C04CFF', glow: 'rgba(192,76,255,.40)',
        route: '/vidaa', primary: {label: 'Connect to a TV', icon: 'plug'},
        actions: [{label: 'Device info', hint: 'TV info and DevKit log', icon: 'info', path: 'info'}],
        note: 'VIDAA connects per session with the 6-character code DevKit shows, so there is no saved device list.',
    },
    {
        id: 'android-phone', name: 'Android Phone', logo: 'android-phone.webp', brand: '#8BF04C', glow: 'rgba(139,240,76,.30)', ink: '#0B1120',
        route: '/android-phone', primary: {label: 'Open apps', icon: 'apps'},
        actions: [
            {label: 'Phones', hint: 'Phones connected by USB', icon: 'usb', path: 'devices'},
            {label: 'Phone info', hint: 'Model, Android, battery', icon: 'info', path: 'info'},
        ],
    },
];

const SELECTED_KEY = 'qa-tool-home-platform';

@Component({
    selector: 'app-platform-selector',
    templateUrl: './platform-selector.component.html',
    styleUrls: ['./platform-selector.component.scss']
})
export class PlatformSelectorComponent implements OnInit {
    readonly appName = AppConfig.appName;
    readonly appVersion = APP_VERSION;
    /** Android Phone is left out of QA Tool Lite. */
    readonly platforms = PLATFORMS.filter(p => !(AppConfig.minimal && p.id === 'android-phone'));
    current: Platform = this.platforms[0];
    update: { release: Release, version: SemVer } | null = null;

    constructor(private router: Router, private updates: UpdateService,
                private adb: AdbStateService, private tizen: TizenStateService) {
        const saved = this.readSelected();
        this.current = this.platforms.find(p => p.id === saved) ?? this.platforms[0];
        this.loadDevices();
    }

    ngOnInit(): void {
        this.updates.availableUpdate().then(u => this.update = u);
    }

    select(p: Platform): void {
        this.current = p;
        this.loadDevices();
        try { localStorage.setItem(SELECTED_KEY, p.id); } catch { /* the choice is only a convenience */ }
    }

    /** Saved devices of the current platform. Only Android TV and Samsung keep a list the home page can read. */
    devices: {name: string; ip: string}[] | null = null;

    private loadDevices(): void {
        switch (this.current.id) {
            case 'android-tv': this.devices = this.adb.getSavedDevices(); break;
            case 'tizen': this.devices = this.tizen.getSavedDevices(); break;
            default: this.devices = null;
        }
    }

    open(path = ''): void {
        this.router.navigate([this.current.route, ...(path ? [path] : [])]);
    }

    dismissUpdate(): void {
        if (this.update) this.updates.ignoreUntil = this.update.version;
        this.update = null;
    }

    private readSelected(): string | null {
        try { return localStorage.getItem(SELECTED_KEY); } catch { return null; }
    }
}
