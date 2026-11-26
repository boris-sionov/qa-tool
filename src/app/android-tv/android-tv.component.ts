import {Component, OnInit} from '@angular/core';
import {AdbStateService} from './adb-state.service';

@Component({
    selector: 'app-android-tv',
    templateUrl: './android-tv.component.html',
    styleUrls: ['./android-tv.component.scss']
})
export class AndroidTvComponent implements OnInit {

    constructor(private state: AdbStateService) {}

    /** Opening the section checks every saved TV and opens on the only connected one, if any. */
    ngOnInit(): void {
        void this.state.scan();
    }
}
