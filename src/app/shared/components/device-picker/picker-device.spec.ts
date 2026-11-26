import {filterDevices, PickerDevice} from './picker-device';

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
