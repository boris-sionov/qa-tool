import {Component, Input} from '@angular/core';
import {DeviceStatus} from '../device-list/device-list.component';

export type DotClass = 'on' | 'off' | 'checking' | 'warn';

/** Filled = answers, hollow = does not, pulsing = still asking (or nothing known yet), amber = waiting for Allow. */
export function dotClass(status: DeviceStatus | undefined): DotClass {
    switch (status) {
        case 'connected': return 'on';
        case 'failed': return 'off';
        case 'unauthorized': return 'warn';
        default: return 'checking';
    }
}

export function dotTitle(status: DeviceStatus | undefined): string {
    switch (status) {
        case 'connected': return 'Reachable';
        case 'failed': return 'Not answering';
        case 'unauthorized': return 'Waiting for Allow on the device';
        default: return 'Checking';
    }
}

/** The small connection mark of a device: a dot, no text; the tooltip says what it means. */
@Component({
    selector: 'app-status-dot',
    standalone: true,
    template: `<span [class]="'dot ' + cls" [title]="title" role="img" [attr.aria-label]="title"></span>`,
    styles: [`
      :host { display: inline-flex; align-items: center; }
      .dot { width: 10px; height: 10px; border-radius: 50%; box-sizing: border-box; background: #64748B; }
      .on { background: #4ADE80; box-shadow: 0 0 8px rgba(74, 222, 128, 0.5); }
      .off { background: transparent; border: 2px solid #64748B; }
      .warn { background: #F59E0B; }
      .checking { animation: pulse 1.1s ease-in-out infinite; }
      @keyframes pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
      @media (prefers-reduced-motion: reduce) { .checking { animation: none; opacity: 0.6; } }
    `],
})
export class StatusDotComponent {
    @Input() status?: DeviceStatus;

    get cls(): DotClass { return dotClass(this.status); }
    get title(): string { return dotTitle(this.status); }
}
