import {fetch} from '@tauri-apps/plugin-http';
import {Injectable} from '@angular/core';
import {SemVer} from 'semver';
import {BUILD_INFO, BuildInfo} from '../build-info';

@Injectable({
    providedIn: 'root'
})
export class UpdateService {
    private check?: Promise<{ release: Release, version: SemVer } | null>;

    async getRecentRelease(): Promise<Release> {
        const res = await fetch('https://api.github.com/repos/boris-sionov/qa-tool/releases/latest', {
            headers: {'accept': 'application/vnd.github.v3+json'},
        });
        if (!res.ok) throw new Error(`GitHub releases: HTTP ${res.status}`);
        return new ReleaseImpl(await res.json());
    }

    /**
     * The latest release when it is newer than this build and not dismissed; null otherwise, errors included.
     * GitHub is asked once per app start (60 unauthenticated requests an hour); the dismissal is read each time.
     */
    async availableUpdate(): Promise<{ release: Release, version: SemVer } | null> {
        if (!isReleaseBuild(BUILD_INFO)) return null;
        this.check ??= this.getRecentRelease().then(release => {
            const version = updateToOffer(release.tag_name, BUILD_INFO.version, null);
            return version ? {release, version} : null;
        }).catch(() => null); // offline or rate-limited: say nothing
        const found = await this.check;
        return found && updateToOffer(found.release.tag_name, BUILD_INFO.version, this.ignoreUntil) ? found : null;
    }

    get ignoreUntil(): SemVer | null {
        try {
            const value = localStorage.getItem('smartTvQaTool:ignoreVersionUntil');
            if (!value) return null;
            return new SemVer(value, true);
        } catch (e) {
            return null;
        }
    }

    set ignoreUntil(value: SemVer | null) {
        if (value?.version) {
            localStorage.setItem('smartTvQaTool:ignoreVersionUntil', value?.version);
        } else {
            localStorage.removeItem('smartTvQaTool:ignoreVersionUntil');
        }
    }
}

/** A branch or modified build carries the last merge's number, so comparing it with a release says nothing. */
export function isReleaseBuild(info: BuildInfo): boolean {
    return !info.dirty && (!info.branch || info.branch === 'main' || info.branch === 'HEAD');
}

/** The release version (`v1.37.0`) to offer, or null when it is not newer than `current` or was dismissed. */
export function updateToOffer(tag: string, current: string, ignoreUntil: SemVer | null): SemVer | null {
    let latest: SemVer;
    try {
        latest = new SemVer(tag, true); // loose: accepts the leading `v`
    } catch {
        return null;
    }
    if (latest.compare(current) <= 0) return null;
    if (ignoreUntil && latest.compare(ignoreUntil) <= 0) return null;
    return latest;
}

export interface Release {
    readonly html_url: string;
    readonly tag_name: string;
    readonly body: string;
}

class ReleaseImpl implements Release {
    html_url: string = '';
    tag_name: string = '';
    body: string = '';

    constructor(data: Partial<ReleaseImpl>) {
        Object.assign(this, data);
    }

}
