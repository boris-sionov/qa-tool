import {SemVer} from 'semver';
import {isReleaseBuild, updateToOffer} from './update.service';

describe('updateToOffer', () => {
    it('offers a newer release', () => {
        expect(updateToOffer('v1.37.0', '1.36.0', null)?.version).toBe('1.37.0');
    });

    it('ignores the same or an older release', () => {
        expect(updateToOffer('v1.36.0', '1.36.0', null)).toBeNull();
        expect(updateToOffer('v1.35.0', '1.36.0', null)).toBeNull();
    });

    it('compares as semver, not as text', () => {
        expect(updateToOffer('v1.100.0', '1.99.0', null)?.version).toBe('1.100.0');
    });

    it('stays quiet up to the dismissed version, and offers the next one', () => {
        const ignored = new SemVer('1.37.0');
        expect(updateToOffer('v1.37.0', '1.36.0', ignored)).toBeNull();
        expect(updateToOffer('v1.38.0', '1.36.0', ignored)?.version).toBe('1.38.0');
    });

    it('returns null for a tag that is not a version', () => {
        expect(updateToOffer('nightly', '1.36.0', null)).toBeNull();
        expect(updateToOffer('', '1.36.0', null)).toBeNull();
    });
});

describe('isReleaseBuild', () => {
    const base = {version: '1.36.0', build: 36, commit: 'abc1234', builtAt: ''};

    it('checks main and detached HEAD builds', () => {
        expect(isReleaseBuild({...base, branch: 'main', dirty: false})).toBeTrue();
        expect(isReleaseBuild({...base, branch: 'HEAD'})).toBeTrue();
    });

    it('skips branch and modified builds', () => {
        expect(isReleaseBuild({...base, branch: 'feat/foo'})).toBeFalse();
        expect(isReleaseBuild({...base, branch: 'main', dirty: true})).toBeFalse();
    });
});
