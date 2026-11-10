import {Component, Inject, Optional} from '@angular/core';
import {DeviceManagerService} from "../core/services";
import {Observable} from "rxjs";
import {Device, NewDevice} from "../types";
import {AsyncPipe} from "@angular/common";
import {NgbCollapse, NgbModal, NgbTooltipModule} from "@ng-bootstrap/ng-bootstrap";
import {AddDeviceModule} from "../add-device/add-device.module";
import {InlineEditorComponent} from "./inline-editor/inline-editor.component";
import {LgComponent} from "../lg/lg.component";
import {RemoveConfirmation, RemoveDeviceComponent} from "../remove-device/remove-device.component";
import {SharedModule} from "../shared/shared.module";
import {ScanDevicesComponent} from "../shared/components/scan-devices/scan-devices.component";
import {noop} from "rxjs";

@Component({
    selector: 'app-devices',
    standalone: true,
    imports: [
        AsyncPipe,
        AddDeviceModule,
        NgbCollapse,
        NgbTooltipModule,
        InlineEditorComponent,
        SharedModule,
    ],
    templateUrl: './devices.component.html',
    styleUrl: './devices.component.scss'
})
export class DevicesComponent {
    public devices$: Observable<Device[] | null>;

    editingDevice: Device | undefined;

    constructor(
        @Optional() @Inject(LgComponent) public lg: LgComponent,
        public deviceManager: DeviceManagerService,
        private modals: NgbModal,
    ) {
        this.devices$ = deviceManager.devices$;
    }

    async deleteDevice(device: Device) {
        let answer: RemoveConfirmation;
        try {
            let a = await RemoveDeviceComponent.confirm(this.modals, device);
            if (!a) {
                return;
            }
            answer = a;
        } catch (e) {
            return;
        }
        await this.deviceManager.removeDevice(device.name, answer.deleteSshKey);
        this.editingDevice = undefined;
    }

    async saveDevice(device: NewDevice) {
        if (this.editingDevice && this.editingDevice.name !== device.name) {
            await this.deviceManager.removeDevice(this.editingDevice.name, false);
        }
        await this.deviceManager.addDevice(device);
        this.editingDevice = undefined;
    }

    addDevice() {
        this.lg?.openSetupDevice(true);
    }

    /** Scan the network; a picked TV opens the add wizard with its address filled in. */
    async scanDevices(saved: Device[] | null) {
        const scanned = await ScanDevicesComponent.open(this.modals, 'webos', (saved ?? []).map(d => d.host))
            .catch(noop);
        if (scanned) this.lg?.openSetupDevice(true, scanned);
    }
}
