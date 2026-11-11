import {AppConfig} from '../../environments/environment';
import {Component} from '@angular/core';
import {Router} from '@angular/router';

@Component({
    selector: 'app-vidaa',
    templateUrl: './vidaa.component.html',
    // Same shell as Tizen — navbar, platform chips, nav pills.
    styleUrls: ['../tizen/tizen.component.scss', './vidaa.component.scss'],
})
export class VidaaComponent {
    readonly minimal = AppConfig.minimal;
    constructor(private router: Router) {}

    goBack(): void {
        this.router.navigate(['/']);
    }

    open(platform: 'lg' | 'android-tv' | 'tizen' | 'vidaa' | 'android-phone'): void {
        this.router.navigate(['/' + platform]);
    }
}
