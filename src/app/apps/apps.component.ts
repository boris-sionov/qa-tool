import {AppConfig} from '../../environments/environment';
import {Component, Injector, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {noop, Observable, Subscription} from 'rxjs';
import {Device, PackageInfo, RawPackageInfo} from '../types';
import {AppManagerService, DeviceManagerService, RepositoryItem} from '../core/services';
import {IconStampResult} from '../core/services/app-manager.service';
import {fetch as tauriFetch} from '@tauri-apps/plugin-http';
import {RemoteFileService} from '../core/services/remote-file.service';
import {MessageDialogComponent} from '../shared/components/message-dialog/message-dialog.component';
import {ProgressDialogComponent} from '../shared/components/progress-dialog/progress-dialog.component';
import {keyBy} from 'lodash';
import {open as showOpenDialog} from '@tauri-apps/plugin-dialog';
import {open as openUrl} from '@tauri-apps/plugin-shell';
import {basename, downloadDir} from "@tauri-apps/api/path";
import {APP_ID_HBCHANNEL} from "../shared/constants";
import {RELEASE_PAGES} from '../core/services/confluence.service';
import {BuildTab, ConfluenceBuildsDialogComponent} from '../shared/components/confluence-builds/confluence-builds-dialog.component';

/** The LG builds on "Releases Smart TV", told apart by file name. UHD only — QA's sets are UHD. */
const LG_TABS: BuildTab[] = [
    {label: 'PREPROD', kinds: [{label: 'PREPROD', match: /lg-webos-uhd-preprod-.*\.ipk$/i}]},
    {label: 'UAT', kinds: [{label: 'UAT', match: /lg-webos-uhd-uat-.*\.ipk$/i}]},
];
import {HbchannelRemoveComponent} from "./hbchannel-remove/hbchannel-remove.component";
import {DetailsComponent} from "./details/details.component";
import {InstalledComponent} from "./installed/installed.component";

@Component({
    selector: 'app-apps',
    templateUrl: './apps.component.html',
    styleUrls: ['./apps.component.scss']
})
export class AppsComponent implements OnInit, OnDestroy {
    readonly minimal = AppConfig.minimal;

    packages$?: Observable<PackageInfo[] | null>;
    device: Device | null = null;
    devices$?: Observable<Device[]|null>;

    @ViewChild('installedComponent') installedComponent?: InstalledComponent;

    private deviceSubscription?: Subscription;
    private packagesSubscription?: Subscription;

    constructor(
        public deviceManager: DeviceManagerService,
        private modalService: NgbModal,
        private appManager: AppManagerService,
        private fileService: RemoteFileService,
    ) {
    }

    ngOnInit(): void {
        this.devices$ = this.deviceManager.devices$;
        this.deviceSubscription = this.deviceManager.selected$.subscribe((device) => {
            this.device = device;
            if (device) {
                this.loadPackages();
            } else {
                this.packages$ = undefined;
                this.packagesSubscription?.unsubscribe();
                this.packagesSubscription = undefined;
            }
        });
    }

    ngOnDestroy(): void {
        this.deviceSubscription?.unsubscribe();
        this.packagesSubscription?.unsubscribe();
        this.packagesSubscription = undefined;
    }

    loadPackages(): void {
        const device = this.device;
        if (!device) return;
        this.packagesSubscription?.unsubscribe();
        this.packages$ = this.appManager.packages$(device);
        this.packagesSubscription = this.packages$.subscribe({
            next: noop, error: noop
        });
        // Developer apps only: the full TV list needs the remote-control pairing, which makes the
        // TV ask for confirmation.
        this.appManager.load(device).catch(noop);
    }

    async openInstallChooser(): Promise<void> {
        if (!this.device) return;
        const path = await showOpenDialog({
            filters: [{name: 'IPK package', extensions: ['ipk']}],
            multiple: false,
            defaultPath: await downloadDir(),
        }).then(result => result);
        if (!path) {
            return;
        }
        await this.installIpk(path);
    }

    /** The newest UAT / PREPROD build from Confluence, through the same install. */
    async installFromConfluence(): Promise<void> {
        if (!this.device) return;
        const build = await ConfluenceBuildsDialogComponent.pick(
            this.modalService, 'Install from Confluence — LG', RELEASE_PAGES.smartTv, LG_TABS);
        if (build) await this.installIpk(build.path);
    }

    private async installIpk(path: string): Promise<void> {
        if (!this.device) return;
        const progress = ProgressDialogComponent.open(this.modalService);
        const component = progress.componentInstance as ProgressDialogComponent;
        let icons: IconStampResult | undefined;
        try {
            icons = await this.appManager.installByPath(this.device, path,
                (progress, statusText) => component.update(statusText, progress));
        } catch (e) {
            console.warn(e);
            this.handleInstallationError(await basename(path), e as Error);
        } finally {
            progress.close(true);
        }
        // The install itself worked; say so when the environment icon didn't follow, instead of
        // leaving a generic tile and no explanation.
        if (icons?.problems.length) {
            MessageDialogComponent.open(this.modalService, {
                title: 'App icon not updated',
                message: `${icons.stamped.length ? `Stamped ${icons.stamped.join(', ')}. ` : ''}`
                    + `The app is installed, but its icon was left as the IPK shipped it:\n\n`
                    + icons.problems.join('\n'),
                positive: 'Close',
            });
        }
    }

    launchApp(id: string): void {
        if (!this.device) return;
        this.appManager.launch(this.device, id).then(noop);
    }

    killApp(id: string): void {
        if (!this.device) return;
        this.appManager.close(this.device, id).then(noop);
    }

    inspectApp(): void {
        if (!this.device) return;
        openUrl(`http://${this.device.host}:9998`).then(noop);
    }

    async changeAppIcon(pkg: RawPackageInfo): Promise<void> {
        if (!this.device) return;
        const path = await showOpenDialog({
            filters: [{name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp']}],
            multiple: false,
            defaultPath: '/Users/borissionov/Privet/FreeTV/LG icons',
        });
        if (!path) return;
        const iconPath = `${pkg.folderPath}/${pkg.icon}`;
        const progress = ProgressDialogComponent.open(this.modalService);
        try {
            const component = progress.componentInstance as ProgressDialogComponent;
            component.update('Removing old icon...', 0);
            await this.fileService.rm(this.device, iconPath, false);

            component.update('Uploading new icon...', 50);
            await this.fileService.put(this.device, iconPath, path);

            component.update('Reloading apps...', 90);
            await this.appManager.refresh(this.device);
            this.installedComponent?.forceReloadIcon(pkg.id);
        } catch (e) {
            MessageDialogComponent.open(this.modalService, {
                title: 'Failed to change icon',
                message: (e as Error).message,
                error: e as Error,
                positive: 'Close',
            });
        } finally {
            progress.close(true);
        }
    }

    async removePackage(pkg: RawPackageInfo): Promise<boolean> {
        if (!this.device) return false;
        const confirm = MessageDialogComponent.open(this.modalService, {
            title: 'Uninstall App',
            message: `Uninstall app \"${pkg.title}\"?`,
            positive: 'Uninstall',
            positiveStyle: 'danger',
            negative: 'Cancel',
            autofocus: 'negative',
        });
        if (!await confirm.result.catch(() => false)) return false;
        if (pkg.id === APP_ID_HBCHANNEL) {
            const doubleConfirm = MessageDialogComponent.open(this.modalService, {
                message: HbchannelRemoveComponent,
                positive: 'Yes, uninstall Homebrew Channel',
                positiveStyle: 'danger',
                negative: 'Cancel',
                autofocus: 'negative',
            });
            if (!await doubleConfirm.result.catch(() => false)) return false;
        }
        const progress = ProgressDialogComponent.open(this.modalService);
        try {
            await this.appManager.remove(this.device, pkg.id);
            return true;
        } catch (e) {
            MessageDialogComponent.open(this.modalService, {
                message: `Failed to uninstall ${pkg.title}`,
                error: e as Error,
                positive: 'Close'
            });
            return false;
        } finally {
            progress.close(true);
        }
    }

    async installPackage(item: RepositoryItem, channel: 'stable' | 'beta' = 'stable'): Promise<boolean> {
        const device = this.device;
        if (!device) return false;
        const progress = ProgressDialogComponent.open(this.modalService);
        try {
            const installLocation = await this.appManager.findInstallLocation(device, item.id).catch(() => null);
            if (installLocation && installLocation !== 'developer') {
                MessageDialogComponent.open(this.modalService, {
                    title: `Cannot install ${item.title}`,
                    message: `Another app with the same ID is already installed. If it was install by LG Content Store, you need to uninstall it first.`,
                    positive: 'Close',
                });
                return false;
            }
            const incompatible = await this.appManager.checkIncompatibility(device, item);
            if (incompatible) {
                const incompatibleConfirm = MessageDialogComponent.open(this.modalService, {
                    title: 'Incompatible App',
                    message: `App ${item.title} is marked not compatible with ${device.name}. It may not work properly or not at all.`,
                    positive: 'Install Anyway',
                    positiveStyle: 'danger',
                    negative: 'Cancel',
                    autofocus: 'negative',
                });
                if (!await incompatibleConfirm.result.catch(() => false)) {
                    return false;
                }
            }
            const manifest = channel === 'stable' ? item.manifest : item.manifestBeta;
            if (!manifest) {
                MessageDialogComponent.open(this.modalService, {
                    title: `Failed to install ${item.title}`,
                    message: `No manifest found for ${item.title} in channel ${channel}`,
                    positive: 'Close',
                });
                return false;
            }
            const component = progress.componentInstance as ProgressDialogComponent;
            await this.appManager.installByManifest(device, manifest,
                (progress, statusText) => component.update(statusText, progress));
            return true;
        } catch (e: any) {
            this.handleInstallationError(item.title, e as Error);
            return false;
        } finally {
            progress.close(true);
        }
    }

    openDetails(item: RepositoryItem): void {
        const modalRef = this.modalService.open(DetailsComponent, {
            size: 'lg',
            scrollable: true,
            injector: Injector.create({
                providers: [
                    {provide: RepositoryItem, useValue: item},
                    {provide: 'device', useValue: this.device},
                ],
            }),
        });
        const component = modalRef.componentInstance as DetailsComponent;
        component.parent = this;
    }

    private handleInstallationError(name: string, e: Error) {
        MessageDialogComponent.open(this.modalService, {
            title: `Failed to install ${name}`,
            message: e.message,
            error: e,
            positive: 'Close',
        });
    }
}
