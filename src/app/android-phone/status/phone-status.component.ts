import {Component, OnDestroy, OnInit} from '@angular/core';
import {Subscription} from 'rxjs';
import {PhoneStateService, phoneName, phoneStatus} from '../phone-state.service';
import {PickerDevice} from '../../shared/components/device-picker/picker-device';
import {DeviceStatus} from '../../shared/components/device-list/device-list.component';

/**
 * What the Apps and Info pages show until a phone is open: adb broken, still looking, no phone
 * plugged in, the list of plugged-in phones to pick from, or a picked phone waiting for
 * "Allow USB debugging?" or still connecting. The pages switch to their content by themselves once
 * the picked phone is ready.
 */
@Component({
    selector: 'app-phone-status',
    templateUrl: './phone-status.component.html',
    styleUrls: ['../../android-tv/devices/android-tv-devices.component.scss', './phone-status.component.scss'],
})
export class PhoneStatusComponent implements OnInit, OnDestroy {
    readonly name = phoneName;
    /** The plugged-in phones as picker rows and their dots; rebuilt after every poll, not on every change detection. */
    pickerDevices: PickerDevice[] = [];
    statuses: Record<string, DeviceStatus> = {};
    private sub?: Subscription;

    constructor(public state: PhoneStateService) {}

    ngOnInit(): void {
        this.sub = this.state.changed$.subscribe(() => this.refresh());
        this.refresh();
    }

    ngOnDestroy(): void {
        this.sub?.unsubscribe();
    }

    private refresh(): void {
        const phones = this.state.phones ?? [];
        this.pickerDevices = phones.map(p => ({key: p.serial, name: phoneName(p), address: p.serial}));
        this.statuses = Object.fromEntries(phones.map(p => [p.serial, phoneStatus(p.state)]));
    }
}
