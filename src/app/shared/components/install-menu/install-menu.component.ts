import {NgClass, NgTemplateOutlet} from '@angular/common';
import {Component, EventEmitter, Input, Output} from '@angular/core';
import {NgbDropdownModule} from '@ng-bootstrap/ng-bootstrap';
import {SpinnerComponent} from '../spinner/spinner.component';

export interface InstallSource {
    id: string;
    label: string;
    icon: string;
    hint?: string;
}

/**
 * The one Install button of every platform's apps page. With several sources (a file, the APK
 * library, Confluence) it opens a menu of them; with one it installs from it directly.
 */
@Component({
    selector: 'app-install-menu',
    standalone: true,
    imports: [NgClass, NgTemplateOutlet, NgbDropdownModule, SpinnerComponent],
    templateUrl: './install-menu.component.html',
    styleUrls: ['./install-menu.component.scss'],
})
export class InstallMenuComponent {
    @Input({required: true}) sources: InstallSource[] = [];
    @Input() disabled = false;
    /** An install is running: the button shows a spinner and "Installing…". */
    @Input() busy = false;
    @Output() choose = new EventEmitter<string>();
}
