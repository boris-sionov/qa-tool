/**
 * An icon an app's `appinfo.json` names but its folder does not hold.
 *
 * webOS file names are case-sensitive and the IPK tooling does not check them, so a package can
 * ship `largeicon.png` while its appinfo asks for `largeIcon.png`. The launcher then finds no icon
 * and draws a tile in the app's `iconColor` with no logo — Cellcom TV 1.0.0 and 1.0.1 both do.
 */
export interface MissingIcon {
    /** The name appinfo declares, relative to the app folder — the file to create. */
    name: string;
    /** The file in the folder that differs from `name` only in case, if there is one. */
    caseMatch: string | null;
}

/**
 * Which declared icons are missing from the folder listing, each with its case-mismatched twin.
 *
 * Only relative names are considered: an absolute path or a URL points outside the app folder,
 * which is not ours to write.
 */
export function missingIcons(declared: ReadonlyArray<string | null | undefined>, present: Iterable<string>): MissingIcon[] {
    const files = [...present];
    const names = new Set(declared
        .filter((name): name is string => !!name && !name.startsWith('/') && !/^https?:\/\//i.test(name))
        .map(name => name.replace(/^\.\//, ''))
        // A name in a subfolder would need the listing of that folder, which we do not have.
        .filter(name => !name.includes('/')));
    return [...names]
        .filter(name => !files.includes(name))
        .map(name => ({name, caseMatch: files.find(file => file.toLowerCase() === name.toLowerCase()) ?? null}));
}
