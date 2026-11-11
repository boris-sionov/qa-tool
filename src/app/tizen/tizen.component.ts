import {platformById} from '../shared/platforms';
import {Component, OnInit} from '@angular/core';
import {SdbService} from '../core/services/sdb.service';
import {tizenSerial, TizenDevice, TizenStateService} from './tizen-state.service';
import {TizenRequirementsService} from './tizen-requirements.service';

@Component({
    selector: 'app-tizen',
    templateUrl: './tizen.component.html',
    styleUrls: ['./tizen.component.scss'],
})
export class TizenComponent implements OnInit {
    readonly brand = platformById('tizen').brand;
    devices: TizenDevice[] = [];
    selected: TizenDevice | null = null;

    constructor(
        public state: TizenStateService,
        private sdb: SdbService,
        private requirements: TizenRequirementsService,
    ) {}

    ngOnInit(): void {
        this.devices = this.state.getSavedDevices();
        this.selected = this.state.selected$.value ?? this.devices[0] ?? null;
        if (this.selected) this.state.select(this.selected);
        void this.requirements.autoCheck();
    }

    onDevicesChanged(): void {
        this.devices = this.state.getSavedDevices();
        if (!this.selected || !this.devices.find(d => tizenSerial(d) === tizenSerial(this.selected!))) {
            this.selected = this.devices[0] ?? null;
            this.state.select(this.selected);
        }
    }

}
