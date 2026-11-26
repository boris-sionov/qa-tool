// backend-client.ts and remote-command.service.ts import each other; the app loads the second first,
// and so must a spec that reaches BackendClient through a service.
import './remote-command.service';
import {keepSelection} from './device-manager.service';
import {Device} from '../../types';

describe('keepSelection', () => {
    const tv = (name: string, extra: Partial<Device> = {}): Device =>
        ({name, host: '10.0.0.1', port: 9922, username: 'prisoner', profile: 'ose', ...extra});

    it('selects nothing at start, even though a device is marked default in the saved file', () => {
        expect(keepSelection([tv('A', {default: true}), tv('B')], null)).toBeNull();
    });

    it('keeps the picked device, as the refreshed object from the new list', () => {
        const fresh = tv('B', {description: 'updated'});
        expect(keepSelection([tv('A'), fresh], tv('B'))).toBe(fresh);
    });

    it('selects nothing once the picked device is gone from the list', () => {
        expect(keepSelection([tv('A', {default: true})], tv('B'))).toBeNull();
    });

    it('selects nothing for an empty list', () => {
        expect(keepSelection([], tv('B'))).toBeNull();
    });
});
