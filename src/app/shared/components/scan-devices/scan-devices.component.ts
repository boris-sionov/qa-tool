import {Component, Input, OnInit} from '@angular/core';
import {NgbActiveModal, NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {AdbService, LanDevice} from '../../../core/services/adb.service';
import {Platform} from '../../../core/models/device-provider.interface';
import {extractMessage} from '../../../core/utils/error.utils';
import {SpinnerComponent} from '../spinner/spinner.component';

/** What the user picked: the caller opens its own add flow with these filled in. */
export interface ScannedTv {
    ip: string;
    name: string | null;
    /** Its connection port answers, so the enable-developer-mode guide can be skipped. */
    ready: boolean;
}

const LABELS: Record<Platform, {title: string; ready: string; notReady: string; hint: string}> = {
    'android-tv': {
        title: 'Android TVs', ready: 'ADB on', notReady: 'ADB off',
        hint: 'turn on Developer options → Network debugging (or USB debugging) on the TV',
    },
    tizen: {
        title: 'Samsung TVs', ready: 'Developer mode on', notReady: 'Developer mode off',
        hint: 'turn on Developer mode in Apps → 12345 with this computer\'s IP, then restart the TV',
    },
    webos: {
        title: 'LG TVs', ready: 'Dev mode on', notReady: 'Dev mode off',
        hint: 'open the Developer Mode app on the TV and turn Dev Mode Status on',
    },
};

const ipKey = (ip: string): number => ip.split('.').reduce((n, part) => n * 256 + Number(part), 0);

/** Scans the network and lists the TVs of one platform; closes with the one picked. */
@Component({
    selector: 'app-scan-devices',
    standalone: true,
    imports: [SpinnerComponent],
    templateUrl: './scan-devices.component.html',
    styleUrls: ['./scan-devices.component.scss'],
})
export class ScanDevicesComponent implements OnInit {
    @Input({required: true}) platform!: Platform;
    /** IPs already saved on this page, tagged "Saved" instead of offering Add. */
    @Input() saved: string[] = [];

    devices: LanDevice[] = [];
    scanning = false;
    error: string | null = null;

    constructor(public modal: NgbActiveModal, private adb: AdbService) {}

    static open(modals: NgbModal, platform: Platform, saved: string[]): Promise<ScannedTv> {
        const ref = modals.open(ScanDevicesComponent, {size: 'lg', centered: true, scrollable: true});
        Object.assign(ref.componentInstance as ScanDevicesComponent, {platform, saved});
        return ref.result;
    }

    get labels() {
        return LABELS[this.platform];
    }

    ngOnInit(): void {
        this.scan();
    }

    async scan(): Promise<void> {
        this.scanning = true;
        this.error = null;
        try {
            this.devices = (await this.adb.lanScan()).filter(d => d.platform === this.platform);
        } catch (e) {
            this.error = extractMessage(e);
        } finally {
            this.scanning = false;
        }
    }

    /** Developer mode on first, then the rest; each group in IP order. */
    get groups(): {title: string; devices: LanDevice[]}[] {
        const byIp = (a: LanDevice, b: LanDevice) => ipKey(a.ip) - ipKey(b.ip);
        return [
            {title: this.labels.ready, devices: this.devices.filter(d => d.ready).sort(byIp)},
            {title: this.labels.notReady, devices: this.devices.filter(d => !d.ready).sort(byIp)},
        ].filter(g => g.devices.length);
    }

    get allReady(): boolean {
        return this.devices.every(d => d.ready);
    }

    /** `2025 · webOS 25 · 65QNED86T6A` — what is known of the TV besides its name and address. */
    details(d: LanDevice): string {
        return [d.year, d.os, d.model].filter(Boolean).join(' · ');
    }

    isSaved(d: LanDevice): boolean {
        return this.saved.includes(d.ip);
    }

    pick(d: LanDevice): void {
        this.modal.close({ip: d.ip, name: d.name, ready: d.ready} satisfies ScannedTv);
    }
}
