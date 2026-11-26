import {TizenDevice, TizenStateService} from './tizen-state.service';

describe('TizenStateService selection', () => {
    const a: TizenDevice = {name: 'Living room', ip: '10.0.0.1', port: 26101};
    const b: TizenDevice = {name: 'Bedroom', ip: '10.0.0.2', port: 26101};
    const LIST = 'smart-tv-qa-tizen-devices';
    const SELECTED = 'smart-tv-qa-tizen-selected-device';

    beforeEach(() => {
        localStorage.setItem(LIST, JSON.stringify([a, b]));
        // What an older version left behind: it reopened on the last pick.
        localStorage.setItem(SELECTED, '10.0.0.2:26101');
    });

    afterEach(() => {
        localStorage.removeItem(LIST);
        localStorage.removeItem(SELECTED);
    });

    it('starts with nothing selected, whatever an older version saved', () => {
        expect(new TizenStateService().selected$.value).toBeNull();
    });

    it('does not remember a pick', () => {
        const state = new TizenStateService();
        state.select(a);
        expect(state.selected$.value).toBe(a);
        expect(localStorage.getItem(SELECTED)).toBeNull();
    });

    it('selects nothing when the picked device is removed, not the next one', () => {
        const state = new TizenStateService();
        state.select(a);
        state.removeDevice(a);
        expect(state.selected$.value).toBeNull();
        expect(state.getSavedDevices()).toEqual([b]);
    });

    it('keeps the pick when another device is removed', () => {
        const state = new TizenStateService();
        state.select(a);
        state.removeDevice(b);
        expect(state.selected$.value).toBe(a);
    });
});
