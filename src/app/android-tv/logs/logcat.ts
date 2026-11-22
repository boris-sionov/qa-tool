/** One `adb logcat -v threadtime` line: `MM-DD HH:MM:SS.mmm  PID  TID L TAG: message`. */
export interface LogLine {
    raw: string;
    time: string;
    tid: string;
    level: string;
    tag: string;
    msg: string;
}

export interface NetworkCall {
    id: number;
    time: string;
    method: string;
    url: string;
    reqHeaders: [string, string][];
    reqBody: string;
    status: number | null;
    ms: number | null;
    resHeaders: [string, string][];
    resBody: string;
}

const LINE = /^(\S+ \S+)\s+\d+\s+(\d+) ([VDIWEF]) (.+?)\s*: ?(.*)$/;

export function parseLine(raw: string): LogLine | null {
    const m = LINE.exec(raw);
    return m ? {raw, time: m[1], tid: m[2], level: m[3], tag: m[4], msg: m[5]} : null;
}

/** The tag of the debug build's request logger: every request and response is written as `curl`-style lines. */
export const CURL_TAG = 'HttpCurlLoggingInterceptor';

const SECRET = /^(authorization|api-authentication|cookie|set-cookie)$/i;
export const isSecretHeader = (name: string) => SECRET.test(name);

/** Hides the value of secret headers inside a raw `-H 'Name: value'` log line. */
export function maskLine(raw: string): string {
    return raw.replace(/((?:authorization|api-authentication|set-cookie|cookie): ).*?(?=' ?\\?$|$)/i, '$1••••');
}

const MAX_BODY = 2_000_000;

type Section ='url' | 'reqHeaders' | 'resHeaders' | 'resBody';

/**
 * Builds the network list from the logger's lines. Calls are kept apart by thread id, because
 * OkHttp answers on its own threads and the lines of two calls interleave.
 */
export class NetworkTracker {
    private open = new Map<string, { call: NetworkCall; section: Section }>();
    private nextId = 1;

    /** Feeds one line; returns the call it belongs to when it started or changed one. */
    feed(line: LogLine): NetworkCall | null {
        if (line.tag !== CURL_TAG) return null;
        const t = line.msg.trim();
        const curl = /^curl -X (\S+)/.exec(t);
        if (curl) {
            const call: NetworkCall = {
                id: this.nextId++, time: line.time, method: curl[1], url: '', reqHeaders: [], reqBody: '',
                status: null, ms: null, resHeaders: [], resBody: '',
            };
            this.open.set(line.tid, {call, section: 'url'});
            return call;
        }
        const cur = this.open.get(line.tid);
        if (!cur) return null;
        const {call} = cur;
        const response = /^RESPONSE (\d+)\s+\((\d+)ms\)/.exec(t);
        if (response) {
            call.status = +response[1];
            call.ms = +response[2];
            cur.section = 'resHeaders';
        } else if (t.startsWith('RESPONSE BODY')) {
            cur.section = 'resBody';
        } else if (cur.section === 'resBody') {
            // shortcut: one body is kept up to MAX_BODY chars, the rest is dropped; raise it if bigger bodies matter.
            if (call.resBody.length < MAX_BODY) call.resBody += (call.resBody ? '\n' : '') + line.msg.replace(/\s+$/, '');
        } else if (cur.section === 'url' && t) {
            call.url = unquote(t.replace(/\s*\\$/, ''));
            cur.section = 'reqHeaders';
        } else if (t.startsWith('-H ')) {
            const h = /^-H '([^:]+): ?(.*?)'?\s*\\?$/.exec(t);
            if (h) (cur.section === 'reqHeaders' ? call.reqHeaders : call.resHeaders).push([h[1], h[2]]);
        } else if (t.startsWith('-d ')) {
            call.reqBody = unquote(t.slice(3).replace(/\s*\\$/, ''));
        } else {
            return null;
        }
        return call;
    }
}

function unquote(s: string): string {
    return s.length > 1 && s.startsWith("'") && s.endsWith("'") ? s.slice(1, -1) : s;
}
