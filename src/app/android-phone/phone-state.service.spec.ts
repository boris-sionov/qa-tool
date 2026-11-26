// backend-client.ts and remote-command.service.ts import each other; the app loads the second first,
// and so must a spec that reaches BackendClient through a service.
import '../core/services/remote-command.service';
import {PhoneStateService, phoneStatus} from './phone-state.service';
import {PhoneService, UsbPhone} from './phone.service';

describe('PhoneStateService selection', () => {
    const KEY = 'smart-tv-qa-phone-selected';
    const ready: UsbPhone = {serial: 'a', state: 'device', model: 'Pixel 8'};
    const waiting: UsbPhone = {serial: 'b', state: 'unauthorized', model: 'Galaxy'};

    const create = (): PhoneStateService => {
        const state = new PhoneStateService({} as PhoneService);
        state.phones = [ready, waiting];
        return state;
    };

    afterEach(() => localStorage.removeItem(KEY));

    it('opens no phone until one is picked, even a single ready one', () => {
        const state = create();
        expect(state.current).toBeNull();
        expect(state.ready).toBeFalse();
    });

    it('forgets a pick an older version saved', () => {
        localStorage.setItem(KEY, 'a');
        const state = create();
        expect(state.current).toBeNull();
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('opens the picked phone, and does not remember it', () => {
        const state = create();
        state.select('a');
        expect(state.current).toBe(ready);
        expect(state.ready).toBeTrue();
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('picks a phone that is still waiting for Allow, but is not ready', () => {
        const state = create();
        state.select('b');
        expect(state.current).toBe(waiting);
        expect(state.ready).toBeFalse();
    });

    it('goes back to the list when the picked phone is unplugged', () => {
        const state = create();
        state.select('a');
        state.phones = [waiting];
        expect(state.current).toBeNull();
    });

    it('does not reopen an unplugged phone when it is plugged back in', async () => {
        let listed: UsbPhone[] = [ready, waiting];
        const state = new PhoneStateService({listPhones: () => Promise.resolve(listed)} as unknown as PhoneService);
        await state.refresh();
        state.select('a');
        expect(state.current).toBe(ready);

        listed = [waiting];
        await state.refresh();
        expect(state.current).toBeNull();

        listed = [ready, waiting];
        await state.refresh();
        expect(state.current).toBeNull();
    });

    it('goes back to the list on select(null)', () => {
        const state = create();
        state.select('a');
        state.select(null);
        expect(state.current).toBeNull();
    });
});

describe('phoneStatus', () => {
    it('maps adb states to the dot', () => {
        expect(phoneStatus('device')).toBe('connected');
        expect(phoneStatus('unauthorized')).toBe('unauthorized');
        expect(phoneStatus('offline')).toBe('checking');
        expect(phoneStatus('authorizing')).toBe('checking');
    });
});
