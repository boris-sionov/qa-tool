import {matches} from '../list-filter/list-filter.component';

export interface PickerDevice {
    /** What `pick` emits: the serial, the name — whatever the page finds its device by. */
    key: string;
    name: string;
    /** IP or serial, shown under the name and searched. */
    address: string;
    /** When set (and no `statuses` are given) the picker asks whether this port answers. */
    port?: number;
}

/** The devices whose name or address contains the search, ignoring case. */
export function filterDevices(devices: PickerDevice[], search: string): PickerDevice[] {
    return devices.filter(d => matches(search, d.name, d.address));
}
