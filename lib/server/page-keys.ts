import {getAllEntries} from "./entries";
import {pageKeyFromPath} from "../shared/utils";

const STATIC_PAGE_KEYS = new Set(["home", "maimai-kop8th", "dev-canvas-mod"]);
const CANONICAL_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Only known page routes and published entries may allocate canvas or chat state. */
export function isRealPageKey(pageKey: string): boolean {
    if (!CANONICAL_KEY.test(pageKey) || pageKey.length > 100) return false;
    if (STATIC_PAGE_KEYS.has(pageKey)) return true;
    return getAllEntries("blog").some(({ slug }) => pageKeyFromPath(`/${slug}`) === pageKey)}

export function parseRealPageKey(raw: string | null | undefined): string | null {
    // An omitted page has historically meant the home page.
    const pageKey = raw == null || raw === "/" ? "home" : raw;
    return isRealPageKey(pageKey) ? pageKey : null;
}
