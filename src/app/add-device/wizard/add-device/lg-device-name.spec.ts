import {lgDeviceName} from './add-device.component';

describe('lgDeviceName', () => {
    it('keeps the model from the Cast name', () => {
        expect(lgDeviceName('[LG] webOS TV QNED86T6A')).toBe('QNED86T6A');
        expect(lgDeviceName('[LG] webOS TV OLED65C56LA')).toBe('OLED65C56LA');
    });
    it('makes any other name valid for the device editor', () => {
        expect(lgDeviceName('Living room TV')).toBe('Living_room_TV');
        expect(lgDeviceName('55" UHD')).toBe('tv_55_UHD');
        expect(lgDeviceName(null)).toBe('tv');
        expect(lgDeviceName('')).toBe('tv');
    });
});
