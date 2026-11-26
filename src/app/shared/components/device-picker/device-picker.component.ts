import {Component, EventEmitter, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import {ReachabilityService} from '../../../core/services/reachability.service';
import {DeviceStatus} from '../device-list/device-list.component';
import {filterDevices, orderDevices, PickerDevice} from './picker-device';

/**
 * What every Apps / Info page shows while no device is open: the saved devices as rows — name,
 * address, a status dot — with a live search. Nothing is opened until a row is clicked. With no
 * devices at all it is the shared empty state.
 */
@Component({
    selector: 'app-device-picker',
    templateUrl: './device-picker.component.html',
    styleUrls: ['./device-picker.component.scss'],
})
export class DevicePickerComponent implements OnChanges {
    @Input() kicker = '';
    @Input() devices: PickerDevice[] = [];
    /** Status by `key`. Without it the picker probes the devices that have a `port` itself. */
    @Input() statuses?: Record<string, DeviceStatus>;
    @Input() icon = 'bi-tv';
    /** The Manage page: where "Add new device" goes. `null` hides that row (phones are plugged in, not added). */
    @Input() emptyLink: unknown[] | null = ['../devices'];
    /** The page is still finding out which devices are connected: show a spinner instead of a list that would reorder. */
    @Input() loading = false;
    @Output() pick = new EventEmitter<string>();

    search = '';
    private probed: Record<string, DeviceStatus> = {};
    private signature = '';
    private seq = 0;
    private probing = false;

    constructor(private reach: ReachabilityService) {}

    get shown(): PickerDevice[] {
        return orderDevices(filterDevices(this.devices, this.search),
            d => this.statusOf(d) === 'connected', d => d.lastConnected);
    }

    get waiting(): boolean {
        return this.loading || this.probing;
    }

    statusOf(device: PickerDevice): DeviceStatus | undefined {
        return (this.statuses ?? this.probed)[device.key];
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (!changes['devices'] || this.statuses) return;
        // A page may pass a fresh array every cycle; only a changed set of devices is probed again.
        const signature = this.devices.map(d => `${d.key}|${d.address}|${d.port}`).join(',');
        if (signature === this.signature) return;
        this.signature = signature;
        void this.probe();
    }

    private async probe(): Promise<void> {
        const seq = ++this.seq;
        this.probed = {};
        this.probing = true;
        const targets = this.devices.filter(d => d.port).map(d => ({key: d.key, host: d.address, port: d.port!}));
        const result = await this.reach.statuses(targets);
        // The list changed while the probe ran: its answer is for devices that are no longer shown.
        if (seq !== this.seq) return;
        this.probed = result;
        this.probing = false;
    }
}
