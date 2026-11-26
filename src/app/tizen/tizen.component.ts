import {Component, OnInit} from '@angular/core';
import {TizenRequirementsService} from './tizen-requirements.service';

@Component({
    selector: 'app-tizen',
    templateUrl: './tizen.component.html',
    styleUrls: ['./tizen.component.scss'],
})
export class TizenComponent implements OnInit {

    constructor(private requirements: TizenRequirementsService) {}

    ngOnInit(): void {
        void this.requirements.autoCheck();
    }

}
