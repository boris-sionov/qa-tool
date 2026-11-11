import {Component, EventEmitter, Input, Output} from '@angular/core';
import {Router} from '@angular/router';
import {AVAILABLE_PLATFORMS, PlatformInfo} from '../../platforms';

/**
 * The column of platform logos on the home page and beside every platform's pages. `navigate`
 * (the default) opens the platform's route; the home page turns it off and handles `picked` itself.
 */
@Component({
    selector: 'app-platform-rail',
    standalone: true,
    templateUrl: './platform-rail.component.html',
    styleUrls: ['./platform-rail.component.scss'],
})
export class PlatformRailComponent {
    readonly platforms = AVAILABLE_PLATFORMS;
    @Input() active = '';
    /** Smaller tiles and a button back to the home page, for the platform pages. */
    @Input() compact = false;
    @Input() navigate = true;
    @Output() picked = new EventEmitter<PlatformInfo>();

    constructor(private router: Router) {}

    pick(p: PlatformInfo): void {
        this.picked.emit(p);
        if (this.navigate) void this.router.navigate([p.route]);
    }

    home(): void {
        void this.router.navigate(['/']);
    }
}
