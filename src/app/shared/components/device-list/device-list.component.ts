import {NgTemplateOutlet} from '@angular/common';
import {Component, EventEmitter, Input, Output, TemplateRef} from '@angular/core';
import {SpinnerComponent} from '../spinner/spinner.component';

export interface ListedDevice {
    name: string;
    ip: string;
    port: number;
}

/** What the list says about a device's connection; no entry means "nothing known yet". */
export type DeviceStatus = 'checking' | 'connected' | 'unauthorized' | 'failed';

export const serialOf = (d: ListedDevice): string => `${d.ip}:${d.port}`;

/**
 * Every saved device as a card — name, address and live connection status — to pick one from.
 * Shared by the Android TV picker and Manage page; other platforms can reuse it as they get the
 * same treatment. A click anywhere on a card emits `pick`; `actions` is an optional template
 * rendered at the bottom of each card (Manage's Edit / Remove).
 */
@Component({
    selector: 'app-device-list',
    standalone: true,
    imports: [NgTemplateOutlet, SpinnerComponent],
    templateUrl: './device-list.component.html',
    styleUrls: ['./device-list.component.scss'],
})
export class DeviceListComponent {
    @Input() devices: ListedDevice[] = [];
    @Input() statuses: Record<string, DeviceStatus> = {};
    /** Serial (`ip:port`) of the picked device, if any. */
    @Input() selected: string | null = null;
    @Input() actions?: TemplateRef<{$implicit: ListedDevice}>;
    @Output() pick = new EventEmitter<ListedDevice>();

    readonly serialOf = serialOf;
}
