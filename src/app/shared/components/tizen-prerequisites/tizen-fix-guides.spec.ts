import {TizenPrereqCheck, TizenPrerequisites} from '../../../core/services/sdb.service';
import {fixGuidesFor, osLabel} from './tizen-fix-guides';

function check(id: string, status: TizenPrereqCheck['status'] = 'fail'): TizenPrereqCheck {
    return {id, label: id, status, detail: '', hint: status === 'ok' ? null : 'fix'};
}

function result(checks: TizenPrereqCheck[], extra: Partial<TizenPrerequisites> = {}): TizenPrerequisites {
    return {checks, studioPath: null, os: 'macos', arch: 'aarch64', ...extra};
}

describe('fixGuidesFor', () => {
    it('shows nothing when every check passed', () => {
        expect(fixGuidesFor(result([check('studio', 'ok'), check('java', 'ok')], {studioPath: '/s'}))).toEqual([]);
    });

    it('shows one SDK guide when Tizen Studio is missing, not a Java one', () => {
        const guides = fixGuidesFor(result([check('studio'), check('tizen-cli'), check('studio-sdb'), check('java')]));
        expect(guides.map(g => g.key)).toEqual(['sdk']);
    });

    it('asks Apple Silicon Macs for Rosetta and links the CLI installer first', () => {
        const [sdk] = fixGuidesFor(result([check('studio')]));
        expect(sdk.steps[0]).toContain('softwareupdate --install-rosetta');
        expect(sdk.links.map(l => l.url)).toEqual([
            'https://download.tizen.org/sdk/Installer/tizen-studio_6.1/web-cli_Tizen_Studio_6.1_macos-64.bin',
            'https://download.tizen.org/sdk/Installer/tizen-studio_6.1/web-ide_Tizen_Studio_6.1_macos-64.dmg',
            'https://download.tizen.org/sdk/Installer/',
            'https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html',
            'https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html',
            'https://support.apple.com/en-us/102527',
        ]);
    });

    it('gives Windows its own installer and paths, without Rosetta', () => {
        const [sdk] = fixGuidesFor(result([check('studio')], {os: 'windows', arch: 'x86_64'}));
        expect(sdk.links[0].url).toContain('web-cli_Tizen_Studio_6.1_windows-64.exe');
        expect(sdk.links[1].url).toContain('web-ide_Tizen_Studio_6.1_windows-64.exe');
        expect(sdk.steps.join(' ')).toContain('C:\\tizen-studio\\package-manager\\package-manager-cli.exe');
        expect(sdk.steps.join(' ')).toContain('C:\\tizen-studio');
        expect(sdk.steps.join(' ')).not.toContain('Rosetta');
    });

    it('installs the CLI from the command line and keeps Certificate Manager as the last, optional step', () => {
        const steps = fixGuidesFor(result([check('studio')], {arch: 'x86_64'}))[0].steps;
        expect(steps.join(' ')).toContain('web-cli_Tizen_Studio_6.1_macos-64.bin --accept-license ~/tizen-studio');
        expect(steps.join(' ')).not.toContain('Rosetta');
        const last = steps[steps.length - 1];
        expect(last).toMatch(/^Optional/);
        expect(last).toContain('package-manager-cli.bin install --accept-license Certificate-Manager,cert-add-on');
        expect(steps.slice(0, -1).join(' ')).not.toContain('Certificate-Manager');
    });

    it('says that --accept-license accepts the Samsung licence, and how to read it first', () => {
        const steps = fixGuidesFor(result([check('studio')]))[0].steps.join(' ');
        expect(steps).toContain('--accept-license accepts');
        expect(steps).toContain('--show-license');
    });

    it('does not offer an install when Studio was found but is not the saved one', () => {
        expect(fixGuidesFor(result([check('studio')], {studioPath: '/s'}))).toEqual([]);
    });

    it('shows the Java guide only when Studio is there', () => {
        expect(fixGuidesFor(result([check('studio', 'ok'), check('java')], {studioPath: '/s'})).map(g => g.key))
            .toEqual(['java']);
    });

    it('covers the bundled sdb, with a link to the latest release', () => {
        const guides = fixGuidesFor(result([check('sdb')], {studioPath: '/s'}));
        expect(guides.map(g => g.key)).toEqual(['bundled-sdb']);
        expect(guides[0].links.map(l => l.url)).toEqual(['https://github.com/boris-sionov/qa-tool/releases/latest']);
    });

    it('gives every guide at least one link to what it asks for', () => {
        for (const c of ['studio', 'sdb']) {
            for (const g of fixGuidesFor(result([check(c)]))) expect(g.links.length).toBeGreaterThan(0);
        }
        for (const g of fixGuidesFor(result([check('java')], {studioPath: '/s'}))) expect(g.links.length).toBeGreaterThan(0);
    });
});

describe('osLabel', () => {
    it('names the Mac architecture', () => {
        expect(osLabel('macos', 'aarch64')).toBe('macOS (Apple Silicon)');
        expect(osLabel('macos', 'x86_64')).toBe('macOS (Intel)');
        expect(osLabel('windows', 'x86_64')).toBe('Windows');
    });
});
