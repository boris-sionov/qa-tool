import {Component, EventEmitter, Input, Output} from '@angular/core';
import {RouterLink} from '@angular/router';

/**
 * What every page shows when there is no device: the same tile, the same "No device detected" and
 * the same "Add new device" button wherever it appears. The button either goes to a route (`link`,
 * relative to the page — the Manage page) or tells the page to open its own add flow (`add`).
 */
@Component({
    selector: 'app-empty-state',
    standalone: true,
    imports: [RouterLink],
    templateUrl: './empty-state.component.html',
    styleUrls: ['./empty-state.component.scss'],
})
export class EmptyStateComponent {
    @Input() link: string | unknown[] | null = null;
    @Output() add = new EventEmitter<void>();
}
