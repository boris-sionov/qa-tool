import {filterDevices, orderDevices, PickerDevice} from './picker-device';

describe('filterDevices', () => {
    const living: PickerDevice = {key: 'a', name: 'Living room', address: '192.168.50.180'};
    const bedroom: PickerDevice = {key: 'b', name: 'Bedroom', address: '192.168.50.211'};
    const all = [living, bedroom];

    it('keeps every device for an empty search', () => {
        expect(filterDevices(all, '')).toEqual(all);
        expect(filterDevices(all, '   ')).toEqual(all);
    });

    it('matches part of the name, ignoring case', () => {
        expect(filterDevices(all, 'living')).toEqual([living]);
        expect(filterDevices(all, 'LIVING')).toEqual([living]);
    });

    it('matches part of the IP', () => {
        expect(filterDevices(all, '50.2')).toEqual([bedroom]);
    });

    it('returns nothing when nothing matches', () => {
        expect(filterDevices(all, 'zzz')).toEqual([]);
        expect(filterDevices([], 'a')).toEqual([]);
    });
});

describe('orderDevices', () => {
    const dev = (key: string, lastConnected?: number): PickerDevice => ({key, name: key, address: key, lastConnected});
    const keys = (list: PickerDevice[]) => list.map(d => d.key);
    const connected = (...on: string[]) => (d: PickerDevice) => on.includes(d.key);
    const last = (d: PickerDevice) => d.lastConnected;

    it('puts connected devices first, whatever they were last connected', () => {
        const list = [dev('old', 1), dev('new', 9), dev('now', 2)];
        expect(keys(orderDevices(list, connected('now'), last))).toEqual(['now', 'new', 'old']);
    });

    it('orders the rest by the most recent connection, never-connected last in saved order', () => {
        const list = [dev('a'), dev('b', 5), dev('c'), dev('d', 8)];
        expect(keys(orderDevices(list, connected(), last))).toEqual(['d', 'b', 'a', 'c']);
    });

    it('orders several connected devices by recency', () => {
        const list = [dev('a', 1), dev('b', 3), dev('c', 2)];
        expect(keys(orderDevices(list, connected('a', 'b', 'c'), last))).toEqual(['b', 'c', 'a']);
    });

    it('does not change the list it is given', () => {
        const list = [dev('a', 1), dev('b', 2)];
        orderDevices(list, connected(), last);
        expect(keys(list)).toEqual(['a', 'b']);
    });
});
