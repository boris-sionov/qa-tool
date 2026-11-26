import {dotClass, dotTitle} from './status-dot.component';

describe('status dot', () => {
    it('is a filled green dot only when the device answers', () => {
        expect(dotClass('connected')).toBe('on');
    });

    it('is a hollow dot when the device does not answer', () => {
        expect(dotClass('failed')).toBe('off');
    });

    it('pulses while checking, and until anything is known', () => {
        expect(dotClass('checking')).toBe('checking');
        expect(dotClass(undefined)).toBe('checking');
    });

    it('is amber while a device waits for Allow', () => {
        expect(dotClass('unauthorized')).toBe('warn');
    });

    it('says it in a tooltip, not in text', () => {
        expect(dotTitle('connected')).toBe('Reachable');
        expect(dotTitle('failed')).toBe('Not answering');
    });
});
