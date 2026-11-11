import {Component, EventEmitter, Input, Output} from '@angular/core';

/** The "Filter by name" box of an app list. The caller does the filtering with `matches`. */
@Component({
    selector: 'app-list-filter',
    template: `
      <label class="list-filter">
        <i class="bi bi-search"></i>
        <input type="search" placeholder="Filter by name or ID" aria-label="Filter apps"
               [ngModel]="value" (ngModelChange)="valueChange.emit($event)">
      </label>`,
    styleUrls: ['./list-filter.component.scss'],
})
export class ListFilterComponent {
    @Input() value = '';
    @Output() valueChange = new EventEmitter<string>();
}

/** Whether any of the texts contains the search, ignoring case. An empty search matches all. */
export function matches(search: string, ...texts: (string | null | undefined)[]): boolean {
    const needle = search.trim().toLowerCase();
    return !needle || texts.some(t => (t ?? '').toLowerCase().includes(needle));
}
