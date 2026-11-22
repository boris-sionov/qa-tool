import {NetworkCall} from './logcat';

/** The viewers under a pane, named as Charles names them. */
export type View = 'headers' | 'query' | 'json' | 'jsontext' | 'text' | 'javascript' | 'hex' | 'raw';
export type Side = 'req' | 'res';

export const VIEW_LABEL: Record<View, string> = {
    headers: 'Headers', query: 'Query String', json: 'JSON', jsontext: 'JSON Text',
    text: 'Text', javascript: 'JavaScript', hex: 'Hex', raw: 'Raw',
};

const headersOf = (c: NetworkCall, side: Side) => side === 'req' ? c.reqHeaders : c.resHeaders;
const bodyOf = (c: NetworkCall, side: Side) => side === 'req' ? c.reqBody : c.resBody;

export function header(c: NetworkCall, side: Side, name: string): string {
    return headersOf(c, side).find(h => h[0].toLowerCase() === name)?.[1] ?? '';
}

export function contentType(c: NetworkCall, side: Side): string {
    return header(c, side, 'content-type').split(';')[0].trim().toLowerCase();
}

/** `a=1&b=2` as decoded pairs (a form body is the same shape). */
export function parseForm(s: string): [string, string][] {
    const dec = (x: string) => { try { return decodeURIComponent(x.replace(/\+/g, ' ')); } catch { return x; } };
    return s.split('&').filter(Boolean).map(p => { const i = p.indexOf('='); return i < 0 ? [dec(p), ''] : [dec(p.slice(0, i)), dec(p.slice(i + 1))]; });
}

export function queryParams(url: string): [string, string][] {
    return parseForm(url.split('#')[0].split('?')[1] ?? '');
}

export function parseJson(body: string): {ok: true; value: unknown} | {ok: false} {
    try { return {ok: true, value: JSON.parse(body)}; } catch { return {ok: false}; }
}

const looksJson = (c: NetworkCall, side: Side) =>
    /json/.test(contentType(c, side)) || /^\s*[{[]/.test(bodyOf(c, side));

/**
 * The tabs under a pane, in Charles' order. A response always offers all of them, so the bar does
 * not change from call to call; one with nothing to show says so. A request adds its body viewers
 * only when it has a body.
 */
export function viewsFor(c: NetworkCall, side: Side): View[] {
    if (side === 'res') return ['headers', 'text', 'hex', 'javascript', 'json', 'jsontext', 'raw'];
    const v: View[] = ['headers', 'query'];
    if (bodyOf(c, 'req')) v.push(...(looksJson(c, 'req') ? ['json', 'jsontext'] as View[] : []), 'text');
    v.push('raw');
    return v;
}

/** What opens first: a JSON response as formatted JSON text, as in Charles; a request starts on its headers. */
export function defaultView(c: NetworkCall, side: Side): View {
    if (side === 'req') return 'headers';
    return !bodyOf(c, 'res') ? 'headers' : looksJson(c, 'res') ? 'jsontext' : 'text';
}

export interface Token { t: string; c: string }

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
const TOKEN_LIMIT = 300_000;

/** Splits formatted JSON into coloured pieces: keys, strings, numbers, true/false/null. A huge body is left plain. */
export function highlightJson(text: string): Token[] {
    if (text.length > TOKEN_LIMIT) return [{t: text, c: ''}];
    const out: Token[] = [];
    let last = 0;
    for (const m of text.matchAll(JSON_TOKEN)) {
        const at = m.index ?? 0;
        if (at > last) out.push({t: text.slice(last, at), c: ''});
        if (m[1] !== undefined) {
            out.push({t: m[1], c: m[2] ? 'key' : 'string'});
            if (m[2]) out.push({t: m[2], c: ''});
        } else {
            out.push({t: m[0], c: m[3] ? 'bool' : 'number'});
        }
        last = at + m[0].length;
    }
    if (last < text.length) out.push({t: text.slice(last), c: ''});
    return out;
}

/** `offset  hex bytes  ascii`, 16 bytes a line, like Charles' Hex view. */
export function hexDump(body: string, limit = 65536): string {
    const bytes = new TextEncoder().encode(body).slice(0, limit);
    const lines: string[] = [];
    for (let i = 0; i < bytes.length; i += 16) {
        const row = [...bytes.slice(i, i + 16)];
        const hex = row.map(b => b.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ');
        const ascii = row.map(b => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
        lines.push(`${i.toString(16).padStart(8, '0')}  ${hex}  ${ascii}`);
    }
    return lines.join('\n');
}

/** The message as it went over the wire: start line, headers, blank line, body. */
export function rawText(c: NetworkCall, side: Side): string {
    let u: URL | null = null;
    try { u = new URL(c.url); } catch { /* a relative or broken URL: show it as logged */ }
    const start = side === 'req' ? `${c.method} ${u ? u.pathname + u.search : c.url} HTTP/1.1` : `HTTP/1.1 ${c.status ?? ''}`;
    const hs = headersOf(c, side).map(h => `${h[0]}: ${h[1]}`);
    if (side === 'req' && u && !header(c, 'req', 'host')) hs.unshift(`Host: ${u.host}`);
    return [start, ...hs, '', bodyOf(c, side)].join('\n');
}

export function toCurl(c: NetworkCall): string {
    const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
    const parts = [`curl -X ${c.method} ${q(c.url)}`, ...c.reqHeaders.map(h => `-H ${q(`${h[0]}: ${h[1]}`)}`)];
    if (c.reqBody) parts.push(`--data-raw ${q(c.reqBody)}`);
    return parts.join(' \\\n  ');
}

const PAGE = 200;

/** A JSON value in the tree; its children are made when it is first opened, so a big body stays quick. */
export class JsonNode {
    open = false;
    shown = PAGE;
    private made?: JsonNode[];

    constructor(readonly key: string, readonly value: unknown, readonly path: string, depth = 0) {
        this.open = depth === 0;
        this.depth = depth;
    }
    readonly depth: number;

    get expandable(): boolean { return typeof this.value === 'object' && this.value !== null && Object.keys(this.value).length > 0; }

    get kind(): string { return this.value === null ? 'null' : Array.isArray(this.value) ? 'array' : typeof this.value; }

    get preview(): string {
        const v = this.value;
        if (Array.isArray(v)) return `[ ] ${v.length} item${v.length === 1 ? '' : 's'}`;
        if (v && typeof v === 'object') return `{ } ${Object.keys(v).length} key${Object.keys(v).length === 1 ? '' : 's'}`;
        return typeof v === 'string' ? JSON.stringify(v) : String(v);
    }

    get children(): JsonNode[] {
        if (!this.made) {
            const v = this.value as Record<string, unknown>;
            const arr = Array.isArray(v);
            this.made = Object.keys(v ?? {}).map(k => new JsonNode(k, v[k], arr ? `${this.path}[${k}]` : `${this.path}.${k}`, this.depth + 1));
        }
        return this.made;
    }

    get visibleChildren(): JsonNode[] { return this.children.slice(0, this.shown); }
    get hidden(): number { return Math.max(0, this.children.length - this.shown); }
    more(): void { this.shown += PAGE; }

    /** What Copy puts on the clipboard: strings as they are, containers as indented JSON. */
    get copyText(): string {
        return typeof this.value === 'string' ? this.value : JSON.stringify(this.value, null, 2);
    }

    /**
     * Opens or closes this node and what is below it. Only the children on show are walked, and at
     * most `budget` nodes in all, so Expand all on a huge body cannot freeze the window.
     */
    setAll(open: boolean, budget = {left: 3000}): void {
        this.open = open;
        if (!this.expandable || (!open && !this.made)) return;
        for (const c of this.visibleChildren) {
            if (budget.left-- <= 0) return;
            c.setAll(open, budget);
        }
    }
}
