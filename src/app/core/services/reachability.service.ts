import {Injectable, NgZone} from '@angular/core';
import {BackendClient} from './backend-client';
import {DeviceStatus} from '../../shared/components/device-list/device-list.component';

export interface ProbeTarget {
    key: string;
    host: string;
    port: number;
}

/**
 * Which devices answer on their port right now — the status dots of the device lists. It only opens
 * a TCP connection and closes it (the Rust `port_probe`, about a second at most); it never connects
 * a device in the tool's sense.
 */
@Injectable({providedIn: 'root'})
export class ReachabilityService extends BackendClient {
    constructor(zone: NgZone) {
        super(zone, 'adb-manager');
    }

    /** `connected` when the port answers, else `failed`. A probe that cannot run marks every target `failed`. */
    async statuses(targets: ProbeTarget[]): Promise<Record<string, DeviceStatus>> {
        if (!targets.length) return {};
        try {
            const open = await this.invoke<boolean[]>('port_probe', {targets: targets.map(t => `${t.host}:${t.port}`)});
            return Object.fromEntries(targets.map((t, i) => [t.key, open[i] ? 'connected' : 'failed'] as const));
        } catch {
            return Object.fromEntries(targets.map(t => [t.key, 'failed'] as const));
        }
    }
}
