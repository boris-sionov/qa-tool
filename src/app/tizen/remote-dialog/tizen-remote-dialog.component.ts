import {Component, Input} from '@angular/core';
import {NgbActiveModal, NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {TizenRemoteService} from '../../core/services/tizen-remote.service';
import {TizenDevice} from '../tizen-state.service';

@Component({
    selector: 'app-tizen-remote-dialog',
    templateUrl: './tizen-remote-dialog.component.html',
    styleUrls: ['./tizen-remote-dialog.component.scss'],
})
export class TizenRemoteDialogComponent {
    @Input() device!: TizenDevice;
    @Input() serial = '';

    pressing: string | null = null;
    error: string | null = null;

    constructor(
        public modal: NgbActiveModal,
        private modalService: NgbModal,
        private tizenRemote: TizenRemoteService,
    ) {}

    async press(key: string): Promise<void> {
        if (this.pressing) return;
        this.pressing = key;
        this.error = null;
        try {
            await this.tizenRemote.pressKey(this.device, key);
        } catch (e) {
            this.error = (e as Error).message ?? String(e);
        } finally {
            this.pressing = null;
        }
    }
}
