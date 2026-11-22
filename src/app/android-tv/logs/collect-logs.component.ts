import {ChangeDetectorRef, Component, ElementRef, OnDestroy, ViewChild} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {save as showSaveDialog} from '@tauri-apps/plugin-dialog';
import {writeTextFile} from '@tauri-apps/plugin-fs';
import {AdbService} from '../../core/services/adb.service';
import {extractMessage} from '../../core/utils/error.utils';
import {parseLine} from './logcat';

const SHOWN = 500;

/** Collects the whole TV's log for one bug: clear it, let QA reproduce, then save everything that came in. */
@Component({
    selector: 'app-collect-logs',
    templateUrl: './collect-logs.component.html',
    styleUrls: ['./collect-logs.component.scss'],
})
export class CollectLogsComponent implements OnDestroy {
    @ViewChild('scroller') scroller?: ElementRef<HTMLElement>;

    serial = '';
    deviceName = '';
    phase: 'ask' | 'live' = 'ask';
    error = '';
    saving = false;
    count = 0;
    shown: {raw: string; level: string}[] = [];

    // shortcut: every line is kept in memory so the saved file is complete — fine for a bug session of minutes, not hours.
    private all: string[] = [];
    private dirty = false;
    private timer?: ReturnType<typeof setInterval>;

    constructor(public modal: NgbActiveModal, private adb: AdbService, private cdr: ChangeDetectorRef) {}

    ngOnDestroy(): void {
        clearInterval(this.timer);
        this.adb.logcatStop().catch(() => {});
    }

    async start(): Promise<void> {
        this.error = '';
        this.phase = 'live';
        this.timer = setInterval(() => this.flush(), 250);
        try {
            await this.adb.logcatStart(this.serial, '', l => {
                if (l === null) this.error ||= 'The log stream ended — the TV may have gone offline.';
                else { this.all.push(l); this.dirty = true; }
            }, true);
        } catch (e) {
            clearInterval(this.timer);
            this.error = extractMessage(e, 'Could not start logcat');
            this.phase = 'ask';
        }
        this.cdr.detectChanges();
    }

    private flush(): void {
        if (!this.dirty) return;
        this.dirty = false;
        const el = this.scroller?.nativeElement;
        const atBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        this.count = this.all.length;
        this.shown = this.all.slice(-SHOWN).map(raw => ({raw, level: parseLine(raw)?.level ?? ''}));
        this.cdr.detectChanges();
        const now = this.scroller?.nativeElement;
        if (now && atBottom) now.scrollTop = now.scrollHeight;
    }

    /** Ends the collection and asks where to save it; cancelling the save keeps the collection running. */
    async finish(): Promise<void> {
        this.error = '';
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const path = await showSaveDialog({defaultPath: `${this.deviceName || 'android-tv'}_logcat_${stamp}.txt`});
        if (!path) return;
        this.saving = true;
        try {
            await writeTextFile(path, this.all.join('\n') + '\n');
            this.modal.close(path);
        } catch (e) {
            this.error = extractMessage(e, 'Could not save the log');
            this.saving = false;
        }
    }
}
