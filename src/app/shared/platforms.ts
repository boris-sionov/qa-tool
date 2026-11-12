import {AppConfig} from '../../environments/environment';

export type PlatformId = 'android-tv' | 'lg' | 'tizen' | 'vidaa' | 'android-phone';

/** What the home page and the platform rail know about each platform. */
export interface PlatformInfo {
    id: PlatformId;
    name: string;
    /** File in `assets/platform-logos/`. */
    logo: string;
    route: string;
}

export const PLATFORMS: PlatformInfo[] = [
    {id: 'android-tv', name: 'Android TV', logo: 'android-tv.webp', route: '/android-tv'},
    {id: 'lg', name: 'LG webOS', logo: 'lg-webos.webp', route: '/lg'},
    {id: 'tizen', name: 'Samsung Tizen', logo: 'tizen.webp', route: '/tizen'},
    {id: 'vidaa', name: 'VIDAA', logo: 'vidaa.webp', route: '/vidaa'},
    {id: 'android-phone', name: 'Android Phone', logo: 'android-phone.webp', route: '/android-phone'},
];

/** The platforms this build offers: QA Tool Lite leaves Android Phone out. */
export const AVAILABLE_PLATFORMS = PLATFORMS.filter(p => !(AppConfig.minimal && p.id === 'android-phone'));
