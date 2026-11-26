import {Component, OnDestroy, OnInit} from '@angular/core';
import {Subscription} from 'rxjs';
import {AdbService} from '../../core/services/adb.service';
import {AdbStateService, deviceSerial, SavedDevice} from '../adb-state.service';
import {extractMessage} from '../../core/utils/error.utils';
import {PickerDevice} from '../../shared/components/device-picker/picker-device';
import {DeviceStatus} from '../../shared/components/device-list/device-list.component';

interface DeviceInfo {
    label: string;
    value: string;
    icon: string;
    highlight?: boolean;
}

@Component({
    selector: 'app-android-tv-info',
    templateUrl: './android-tv-info.component.html',
    styleUrls: ['./android-tv-info.component.scss'],
})
export class AndroidTvInfoComponent implements OnInit, OnDestroy {

    device: SavedDevice | null = null;
    private devices: SavedDevice[] = [];
    pickerDevices: PickerDevice[] = [];
    info: DeviceInfo[] = [];
    loading = false;
    error?: Error;
    unauthorized = false;
    copySuccess = false;
    private sub?: Subscription;

    constructor(private adb: AdbService, public state: AdbStateService) {}

    ngOnInit(): void {
        this.devices = this.state.getSavedDevices();
        this.pickerDevices = this.devices.map(d => ({key: deviceSerial(d), name: d.name, address: d.ip, lastConnected: d.lastConnected}));
        this.sub = this.state.connection$.subscribe(conn => {
            this.device = conn.device;
            this.info = [];
            this.unauthorized = conn.status === 'unauthorized';
            this.error = conn.status === 'failed' ? new Error(conn.error) : undefined;
            this.loading = conn.status === 'checking';
            if (conn.status === 'connected') this.loadInfo(conn.device);
        });
    }

    ngOnDestroy(): void { this.sub?.unsubscribe(); }

    /** A click on a row of the picker: open that TV. */
    pick(key: string): void {
        const device = this.devices.find(d => deviceSerial(d) === key);
        if (device) this.state.choose(device);
    }

    /** The dot beside the open TV's name. */
    get chipStatus(): DeviceStatus | undefined {
        const status = this.state.connection$.value.status;
        return status === 'none' ? undefined : status;
    }

    async copyDeviceInfo(): Promise<void> {
        const productName = this.info.find(i => i.label === 'Product Name')?.value || '';
        const androidVersion = this.info.find(i => i.label === 'Android Version')?.value || '';

        const textToCopy = `Product Name: ${productName}\nAndroid Version: ${androidVersion}`;

        try {
            await navigator.clipboard.writeText(textToCopy);
            this.copySuccess = true;
            setTimeout(() => {
                this.copySuccess = false;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }

    retry(): void {
        if (this.state.connection$.value.status === 'connected') this.loadInfo(this.device!);
        else this.state.checkConnection();
    }

    async loadInfo(dev: SavedDevice): Promise<void> {
        this.loading = true;
        this.error = undefined;
        const serial = deviceSerial(dev);
        try {
            const props = [
                'ro.product.model',
                'ro.product.manufacturer',
                'ro.build.version.release',
                'ro.build.version.sdk',
                'ro.product.name',
                'ro.build.display.id',
            ];
            const values = await Promise.all(
                props.map(p => this.adb.getProp(serial, p))
            );
            this.info = [
                {label: 'Device Name', value: dev.name, icon: 'bi-tv'},
                {label: 'Product Name', value: values[4], icon: 'bi-tag-fill', highlight: true},
                {label: 'Android Version', value: values[2], icon: 'bi-android2', highlight: true},
                {label: 'Model', value: values[0], icon: 'bi-cpu'},
                {label: 'Manufacturer', value: values[1], icon: 'bi-building'},
                {label: 'API Level', value: values[3], icon: 'bi-code-slash'},
                {label: 'Build', value: values[5], icon: 'bi-gear-fill'},
                {label: 'IP Address', value: dev.ip, icon: 'bi-router-fill'},
            ];
        } catch (e) {
            this.error = new Error(extractMessage(e, 'Failed to load device info'));
        } finally {
            this.loading = false;
        }
    }
}
