import {NgClass} from '@angular/common';
import {Component, Input} from '@angular/core';
import {RouterLink} from '@angular/router';

/**
 * What a page shows when there is nothing to show yet — no device, not connected, no devices saved:
 * the icon tile, a title, one line of help and, if there is a next step, a button for it.
 */
@Component({
    selector: 'app-empty-state',
    standalone: true,
    imports: [NgClass, RouterLink],
    templateUrl: './empty-state.component.html',
    styleUrls: ['./empty-state.component.scss'],
})
export class EmptyStateComponent {
    @Input() icon = 'bi-hdd-network';
    @Input({required: true}) title = '';
    @Input() text = '';
    @Input() actionLabel = '';
    @Input() actionIcon = 'bi-plus-lg';
    /** Router link of the button, relative to the page showing this. */
    @Input() actionLink: string | unknown[] = [];
}
