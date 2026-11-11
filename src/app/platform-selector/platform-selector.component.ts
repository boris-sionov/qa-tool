import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {APP_VERSION} from '../core/build-info';
import {Release, UpdateService} from '../core/services/update.service';
import {SemVer} from 'semver';

@Component({
    selector: 'app-platform-selector',
    templateUrl: './platform-selector.component.html',
    styleUrls: ['./platform-selector.component.scss']
})
export class PlatformSelectorComponent implements OnInit {
    readonly appVersion = APP_VERSION;
    update: { release: Release, version: SemVer } | null = null;

    constructor(private router: Router, private updates: UpdateService) {}

    ngOnInit(): void {
        this.updates.availableUpdate().then(u => this.update = u);
    }

    dismissUpdate(): void {
        if (this.update) this.updates.ignoreUntil = this.update.version;
        this.update = null;
    }

    openLg(): void {
        this.router.navigate(['/lg']);
    }

    openAndroid(): void {
        this.router.navigate(['/android-tv']);
    }

    openTizen(): void {
        this.router.navigate(['/tizen']);
    }

    openVidaa(): void {
        this.router.navigate(['/vidaa']);
    }

    openPhone(): void {
        this.router.navigate(['/android-phone']);
    }

}
