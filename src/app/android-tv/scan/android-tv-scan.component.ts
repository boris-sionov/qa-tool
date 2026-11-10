import {Component, OnInit} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {AdbService, LanDevice} from '../../core/services/adb.service';
import {AdbStateService} from '../adb-state.service';
import {extractMessage} from '../../core/utils/error.utils';

/** Scans the network; closes with the IP QA picked, which the caller hands to the add wizard. */
@Component({
    selector: 'app-android-tv-scan',
    templateUrl: './android-tv-scan.component.html',
    styleUrls: ['./android-tv-scan.component.scss'],
})
export class AndroidTvScanComponent implements OnInit {
    devices: LanDevice[] = [];
    scanning = false;
    error: string | null = null;
    androidOnly = false;
    private saved = new Set<string>();

    constructor(public modal: NgbActiveModal, private adb: AdbService, state: AdbStateService) {
        this.saved = new Set(state.getSavedDevices().map(d => d.ip));
    }

    ngOnInit(): void {
        this.scan();
    }

    async scan(): Promise<void> {
        this.scanning = true;
        this.error = null;
        try {
            this.devices = await this.adb.lanScan();
        } catch (e) {
            this.error = extractMessage(e);
        } finally {
            this.scanning = false;
        }
    }

    get shown(): LanDevice[] {
        return this.androidOnly ? this.devices.filter(d => this.isAndroidTv(d)) : this.devices;
    }

    get androidCount(): number {
        return this.devices.filter(d => this.isAndroidTv(d)).length;
    }

    isAndroidTv(d: LanDevice): boolean {
        return d.openPorts.includes(5555);
    }

    /** Google Cast answers but ADB does not: LG/Samsung, Chromecast, or an Android TV with ADB off. */
    isCastOnly(d: LanDevice): boolean {
        return !this.isAndroidTv(d) && (d.openPorts.includes(8008) || d.openPorts.includes(8009));
    }

    isSaved(d: LanDevice): boolean {
        return this.saved.has(d.ip);
    }
}
