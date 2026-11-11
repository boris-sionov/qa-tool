import {Component, EventEmitter, Input, Output} from '@angular/core';

/**
 * The header every app list shares: platform kicker, "Installed Apps", filter, app count and
 * reload. Anything projected into it (LG's scope switch) sits before the filter.
 */
@Component({
    selector: 'app-list-header',
    templateUrl: './app-list-header.component.html',
    styleUrls: ['./app-list-header.component.scss'],
})
export class AppListHeaderComponent {
    @Input() kicker = '';
    /** Apps on screen after the filter, and apps the device reports. */
    @Input() shown = 0;
    @Input() total = 0;
    @Input() refreshing = false;
    @Input() search = '';
    @Output() searchChange = new EventEmitter<string>();
    @Output() refresh = new EventEmitter<void>();
}
