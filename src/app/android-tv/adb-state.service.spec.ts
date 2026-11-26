// backend-client.ts and remote-command.service.ts import each other; the app loads the second first,
// and so must a spec that reaches BackendClient through a service.
import '../core/services/remote-command.service';
import {mergeStatus} from './adb-state.service';

describe('mergeStatus', () => {
    it('is connected when adb holds the TV, whatever the port says', () => {
        expect(mergeStatus('device', false)).toBe('connected');
    });

    it('is unauthorized when the TV waits for Allow, even though its port answers', () => {
        expect(mergeStatus('unauthorized', true)).toBe('unauthorized');
    });

    it('is connected (reachable) when adb does not hold the TV but its port answers', () => {
        expect(mergeStatus(null, true)).toBe('connected');
    });

    it('is failed when nothing answers', () => {
        expect(mergeStatus(null, false)).toBe('failed');
    });
});
