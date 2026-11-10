import {Component, EventEmitter, Inject, Input, OnInit, Optional, Output, ViewChild} from '@angular/core';
import {ScannedTv} from "../../../shared/components/scan-devices/scan-devices.component";
import {DeviceConnectionMode} from "../mode-select/mode-select.component";
import {Device, NewDeviceAuthentication} from "../../../types";
import {DeviceEditorComponent, SetupAuthInfoUnion} from "../../device-editor/device-editor.component";
import {ProgressDialogComponent} from "../../../shared/components/progress-dialog/progress-dialog.component";
import {NgbModal} from "@ng-bootstrap/ng-bootstrap";
import {DeviceManagerService} from "../../../core/services";

@Component({
    selector: 'app-wizard-add-device',
    templateUrl: './add-device.component.html',
    styleUrls: ['./add-device.component.scss']
})
export class AddDeviceComponent implements OnInit {
    @Input()
    mode!: DeviceConnectionMode;

    @ViewChild('deviceEditor')
    deviceEditor!: DeviceEditorComponent;

    username?: string;
    port?: number;
    auth?: SetupAuthInfoUnion;

    @Output()
    deviceAdded: EventEmitter<Device> = new EventEmitter();

    /** Filled from Scan Devices; otherwise the user types them. */
    host?: string;
    name = 'tv';

    constructor(private modals: NgbModal, private deviceManager: DeviceManagerService,
                @Optional() @Inject('scannedTv') scanned: ScannedTv | null) {
        if (scanned) {
            this.host = scanned.ip;
            this.name = lgDeviceName(scanned.name);
        }
    }

    ngOnInit(): void {
        switch (this.mode) {
            case DeviceConnectionMode.DevMode: {
                this.username = 'prisoner';
                this.port = 9922;
                this.auth = {type: NewDeviceAuthentication.DevKey, value: ''};
                break;
            }
            case DeviceConnectionMode.Rooted: {
                this.username = 'root';
                this.port = 22;
                break;
            }
        }
    }

    get valid(): boolean {
        return this.deviceEditor.valid;
    }

    async submit(): Promise<void> {
        const progress = ProgressDialogComponent.open(this.modals);
        try {
            const newDevice = await this.deviceEditor.submit();
            this.deviceAdded.emit(await this.deviceManager.addDevice(newDevice));
        } finally {
            progress.close();
        }
    }
}

/** A device name the editor accepts (`^[_a-zA-Z][a-zA-Z0-9#_-]*`): `[LG] webOS TV QNED86T6A` → `QNED86T6A`. */
export function lgDeviceName(castName: string | null): string {
    const name = (castName ?? '').replace(/^\[LG\]\s*(webOS TV\s*)?/i, '').trim().replace(/[^a-zA-Z0-9#_-]+/g, '_');
    if (!name) return 'tv';
    return /^[_a-zA-Z]/.test(name) ? name : `tv_${name}`;
}
