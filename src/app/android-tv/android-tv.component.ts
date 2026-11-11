import {platformById} from '../shared/platforms';
import {Component, OnInit} from '@angular/core';
import {AdbService} from '../core/services/adb.service';
import {AdbStateService, deviceSerial, SavedDevice} from './adb-state.service';

@Component({
    selector: 'app-android-tv',
    templateUrl: './android-tv.component.html',
    styleUrls: ['./android-tv.component.scss']
})
export class AndroidTvComponent implements OnInit {
    readonly brand = platformById('android-tv').brand;

    devices: SavedDevice[] = [];
    selected: SavedDevice | null = null;

    constructor(
        public state: AdbStateService,
        private adb: AdbService,
    ) {}

    ngOnInit(): void {
        this.devices = this.state.getSavedDevices();
        this.selected = this.state.selected$.value ?? this.devices[0] ?? null;
        if (this.selected) this.state.select(this.selected);
    }

    selectDevice(serial: string): void {
        const dev = this.devices.find(d => deviceSerial(d) === serial) ?? null;
        this.selected = dev;
        this.state.select(dev);
        if (dev) {
            this.adb.connect(deviceSerial(dev)).catch(() => {});
        }
    }

    onDevicesChanged(): void {
        this.devices = this.state.getSavedDevices();
        if (!this.devices.find(d => deviceSerial(d) === deviceSerial(this.selected!))) {
            this.selected = this.devices[0] ?? null;
            this.state.select(this.selected);
        }
    }

}
