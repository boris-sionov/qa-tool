import {Injectable} from '@angular/core';
import {Subject} from 'rxjs';
import {PhoneService, UsbPhone} from './phone.service';
import {extractMessage} from '../core/utils/error.utils';
import {DeviceStatus} from '../shared/components/device-list/device-list.component';

/** Written by older versions, which reopened on the last pick; now only cleaned up. */
const SELECTED_KEY = 'smart-tv-qa-phone-selected';
/** How often adb is asked which phones are plugged in. */
const POLL_MS = 2000;

/**
 * The phones plugged in by USB, polled while the Phone section is open, and which one the Apps and
 * Info pages show: only the one QA picked, while it is still plugged in. Nothing is picked for QA.
 */
@Injectable({providedIn: 'root'})
export class PhoneStateService {
    /** `null` until adb has answered once. */
    phones: UsbPhone[] | null = null;
    /** adb itself did not run — the copy bundled with the tool is missing or broken. */
    adbError: string | null = null;
    /** Fires after every poll and every change of selection. */
    readonly changed$ = new Subject<void>();
    /** A phone whose "Allow USB debugging?" popup should open again (the Manage card's badge). */
    readonly askApproval$ = new Subject<string>();
    private selected: string | null = null;
    private timer?: ReturnType<typeof setInterval>;

    constructor(private service: PhoneService) {
        try {
            localStorage.removeItem(SELECTED_KEY);
        } catch {
            // No storage: nothing to clean up.
        }
    }

    start(): void {
        if (this.timer) return;
        void this.refresh();
        this.timer = setInterval(() => void this.refresh(), POLL_MS);
    }

    stop(): void {
        clearInterval(this.timer);
        this.timer = undefined;
    }

    async refresh(): Promise<void> {
        try {
            this.phones = await this.service.listPhones();
            this.adbError = null;
            // An unplugged phone is no longer picked: plugging it back in must not reopen it by itself.
            if (this.selected && !this.phones.some(p => p.serial === this.selected)) this.selected = null;
        } catch (e) {
            this.adbError = extractMessage(e, 'adb did not answer');
        }
        this.changed$.next();
    }

    get current(): UsbPhone | null {
        return (this.phones ?? []).find(p => p.serial === this.selected) ?? null;
    }

    /** Whether the current phone is usable — the Apps and Info pages show their content only then. */
    get ready(): boolean {
        return this.current?.state === 'device';
    }

    select(serial: string | null): void {
        this.selected = serial;
        this.changed$.next();
    }
}

/** What the dot of a phone says: adb's `device` is ready, `unauthorized` waits for Allow, anything else is coming up. */
export function phoneStatus(state: string): DeviceStatus {
    return state === 'device' ? 'connected' : state === 'unauthorized' ? 'unauthorized' : 'checking';
}

export function phoneName(phone: UsbPhone | null): string {
    return phone?.model ?? 'Android phone';
}
