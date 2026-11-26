import {Component, EventEmitter, Input, Output} from '@angular/core';
import {DeviceStatus} from '../device-list/device-list.component';
import {StatusDotComponent} from '../status-dot/status-dot.component';

/** Start of a page's toolbar once a device is open: the way back to the list, and which device it is. */
@Component({
    selector: 'app-device-chip',
    standalone: true,
    imports: [StatusDotComponent],
    template: `
      <button type="button" class="back" (click)="back.emit()"><i class="bi bi-chevron-left"></i>Devices</button>
      <span class="name">{{ name }}</span>
      @if (status) { <app-status-dot [status]="status"></app-status-dot> }`,
    styleUrls: ['./device-chip.component.scss'],
})
export class DeviceChipComponent {
    @Input() name = '';
    @Input() status?: DeviceStatus;
    @Output() back = new EventEmitter<void>();
}
