import {BuildInfo, versionLabel} from './build-info';

describe('versionLabel', () => {
    const base: BuildInfo = {version: '1.15.0', build: 15, commit: 'abc1234', branch: 'main', builtAt: ''};

    it('shows just the version for main', () => {
        expect(versionLabel(base)).toBe('1.15');
    });

    it('treats a detached checkout as main', () => {
        expect(versionLabel({...base, branch: 'HEAD'})).toBe('1.15');
    });

    it('marks a branch build', () => {
        expect(versionLabel({...base, branch: 'feat/foo'})).toBe('1.15+ · feat/foo abc1234');
    });

    it('marks uncommitted changes', () => {
        expect(versionLabel({...base, dirty: true})).toBe('1.15+ · abc1234, modified');
        expect(versionLabel({...base, branch: 'feat/foo', dirty: true}))
            .toBe('1.15+ · feat/foo abc1234, modified');
    });

    it('shows the rollover version', () => {
        expect(versionLabel({...base, version: '2.0.0', build: 256})).toBe('2.0');
    });

    it('shows build 0 without a plus', () => {
        expect(versionLabel({...base, version: '1.0.0', build: 0})).toBe('1.0');
    });
});
