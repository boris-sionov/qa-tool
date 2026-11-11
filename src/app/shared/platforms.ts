import {AppConfig} from '../../environments/environment';

export type PlatformId = 'android-tv' | 'lg' | 'tizen' | 'vidaa' | 'android-phone';

/** What the home page and the platform rail know about each platform. */
export interface PlatformInfo {
    id: PlatformId;
    name: string;
    /** File in `assets/platform-logos/`. */
    logo: string;
    /** Brand colour behind the logo, on the active marker and on the active tab. */
    brand: string;
    glow: string;
    route: string;
}

export const PLATFORMS: PlatformInfo[] = [
    {id: 'android-tv', name: 'Android TV', logo: 'android-tv.webp', brand: '#34A8FF', glow: 'rgba(52,168,255,.38)', route: '/android-tv'},
    {id: 'lg', name: 'LG webOS', logo: 'lg-webos.webp', brand: '#FF2F6D', glow: 'rgba(255,47,109,.34)', route: '/lg'},
    {id: 'tizen', name: 'Samsung Tizen', logo: 'tizen.webp', brand: '#1CA7FF', glow: 'rgba(28,167,255,.38)', route: '/tizen'},
    {id: 'vidaa', name: 'VIDAA', logo: 'vidaa.webp', brand: '#C04CFF', glow: 'rgba(192,76,255,.40)', route: '/vidaa'},
    {id: 'android-phone', name: 'Android Phone', logo: 'android-phone.webp', brand: '#3FA535', glow: 'rgba(139,240,76,.30)', route: '/android-phone'},
];

/** The platforms this build offers: QA Tool Lite leaves Android Phone out. */
export const AVAILABLE_PLATFORMS = PLATFORMS.filter(p => !(AppConfig.minimal && p.id === 'android-phone'));

export const platformById = (id: PlatformId): PlatformInfo => PLATFORMS.find(p => p.id === id)!;
