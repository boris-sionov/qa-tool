import {Component, OnInit} from '@angular/core';
import {AdbService} from '../../../core/services/adb.service';

/** This computer's address in the platform bar, so QA can see which network the TVs must be on. */
@Component({
    selector: 'app-host-ip',
    standalone: true,
    template: `<span class="host-ip" title="This computer's address"><i class="bi bi-pc-display"></i>{{ ip ?? 'Offline' }}</span>`,
    styles: [`
      .host-ip { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #A8B8CC; white-space: nowrap; }
    `],
})
export class HostIpComponent implements OnInit {
    ip: string | null = null;

    constructor(private adb: AdbService) {}

    async ngOnInit(): Promise<void> {
        this.ip = await this.adb.localIp().catch(() => null);
    }
}
