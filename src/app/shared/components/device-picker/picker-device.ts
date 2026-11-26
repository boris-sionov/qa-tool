import {matches} from '../list-filter/list-filter.component';

export interface PickerDevice {
    /** What `pick` emits: the serial, the name — whatever the page finds its device by. */
    key: string;
    name: string;
    /** IP or serial, shown under the name and searched. */
    address: string;
    /** When set (and no `statuses` are given) the picker asks whether this port answers. */
    port?: number;
    /** When it was last seen connected (ms since epoch); newer ones are listed first. */
    lastConnected?: number;
}

/** The devices whose name or address contains the search, ignoring case. */
export function filterDevices(devices: PickerDevice[], search: string): PickerDevice[] {
    return devices.filter(d => matches(search, d.name, d.address));
}

/**
 * Connected devices first, then the one connected most recently, then the rest in their saved
 * order. Returns a new array; never moves two devices that tie.
 */
export function orderDevices<T>(devices: T[], connected: (d: T) => boolean, lastConnected: (d: T) => number | undefined): T[] {
    return [...devices].sort((a, b) =>
        Number(connected(b)) - Number(connected(a)) || (lastConnected(b) ?? 0) - (lastConnected(a) ?? 0));
}
