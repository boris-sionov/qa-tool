import {missingIcons} from './webos-icon-repair';

describe('missingIcons', () => {
    // The Cellcom TV 1.0.1 IPK, as it unpacks.
    const cellcom = ['appinfo.json', 'default.png', 'icon.png', 'index.html', 'largeicon.png', 'loading.png'];

    it('finds a declared icon that only exists in another case', () => {
        expect(missingIcons(['icon.png', 'largeIcon.png'], cellcom))
            .toEqual([{name: 'largeIcon.png', caseMatch: 'largeicon.png'}]);
    });

    it('reports a declared icon with no twin at all', () => {
        expect(missingIcons(['icon.png', 'big.png'], cellcom)).toEqual([{name: 'big.png', caseMatch: null}]);
    });

    it('is empty when every declared icon is there', () => {
        expect(missingIcons(['icon.png', './largeicon.png'], cellcom)).toEqual([]);
    });

    it('leaves absolute paths, URLs and subfolders alone', () => {
        expect(missingIcons([
            '/usr/palm/applications/x/icon.png',
            'https://localhost:3001/icon.png',
            'images/icon.png',
            undefined,
        ], cellcom)).toEqual([]);
    });

    it('lists a name declared twice once', () => {
        expect(missingIcons(['largeIcon.png', 'largeIcon.png'], cellcom)).toHaveSize(1);
    });
});
