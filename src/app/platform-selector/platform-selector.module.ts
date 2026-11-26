import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {RouterModule, Routes} from '@angular/router';
import {PlatformSelectorComponent} from './platform-selector.component';
import {ExternalLinkDirective} from '../shared/directives';
import {StatusDotComponent} from '../shared/components/status-dot/status-dot.component';
import {PlatformRailComponent} from '../shared/components/platform-rail/platform-rail.component';

const routes: Routes = [{path: '', component: PlatformSelectorComponent}];

@NgModule({
    declarations: [PlatformSelectorComponent],
    imports: [CommonModule, RouterModule.forChild(routes), ExternalLinkDirective, PlatformRailComponent, StatusDotComponent],
})
export class PlatformSelectorModule {}
