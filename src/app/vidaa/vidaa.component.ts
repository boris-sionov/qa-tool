import {platformById} from '../shared/platforms';
import {Component} from '@angular/core';

@Component({
    selector: 'app-vidaa',
    templateUrl: './vidaa.component.html',
    // Same shell styles as Tizen.
    styleUrls: ['../tizen/tizen.component.scss'],
})
export class VidaaComponent {
    readonly brand = platformById('vidaa').brand;
}
