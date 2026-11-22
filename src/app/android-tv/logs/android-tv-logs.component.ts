import {ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {AdbService} from '../../core/services/adb.service';
import {AdbStateService, deviceSerial} from '../adb-state.service';
import {extractMessage} from '../../core/utils/error.utils';
import {isSecretHeader, LogLine, maskLine, NetworkCall, NetworkTracker, parseLine} from './logcat';
import {
    contentType, defaultView, hexDump, highlightJson, JsonNode, parseJson, queryParams, rawText, Side, Token, toCurl, View, VIEW_LABEL, viewsFor,
} from './viewers';

const KEEP = 20000;
const KEEP_CALLS = 2000;
const MAX_PENDING = 50000;
const SHOWN = 1000;
const LEVELS = 'VDIWEF';

interface Parsed { len: number; root: JsonNode | null; text: string; tokens?: Token[] }

/** Live log of one Android TV app: the requests its debug build makes, and the raw log behind them. */
@Component({
    selector: 'app-android-tv-logs',
    templateUrl: './android-tv-logs.component.html',
    styleUrls: ['./android-tv-logs.component.scss'],
})
export class AndroidTvLogsComponent implements OnInit, OnDestroy {
    @ViewChild('scroller') scroller?: ElementRef<HTMLElement>;

    readonly levels = ['V', 'D', 'I', 'W', 'E'];
    pkg = '';
    name = '';
    tab: 'network' | 'log' = 'network';
    level = 'V';
    search = '';
    paused = false;
    showSecrets = false;
    status: 'connecting' | 'live' | 'ended' | 'error' = 'connecting';
    error = '';

    lines: LogLine[] = [];
    calls: NetworkCall[] = [];
    selected: NetworkCall | null = null;
    /** Charles' two tabs under the filter: the summary of a call, and its request and response. */
    detail: 'overview' | 'contents' = 'contents';
    chosen: Record<Side, View | null> = {req: null, res: null};
    copied = '';
    /** Height of the request list, and of the request pane inside the details, in percent. */
    listPct = 32;
    reqPct = 35;
    readonly label = VIEW_LABEL;
    private trees = new Map<string, Parsed>();
    visibleLines: LogLine[] = [];
    visibleCalls: NetworkCall[] = [];
    hasCurlLines = false;

    private tracker = new NetworkTracker();
    private pending: string[] = [];
    private timer?: ReturnType<typeof setInterval>;

    constructor(private route: ActivatedRoute, private adb: AdbService, private state: AdbStateService,
                private cdr: ChangeDetectorRef) {}

    async ngOnInit(): Promise<void> {
        const q = this.route.snapshot.queryParamMap;
        this.pkg = q.get('pkg') ?? '';
        this.name = q.get('name') ?? this.pkg;
        const dev = this.state.selected$.value;
        if (!dev || !this.pkg) {
            this.fail('No device or app selected — open this from the Apps list.');
            return;
        }
        this.timer = setInterval(() => this.flush(), 250);
        try {
            await this.adb.logcatStart(deviceSerial(dev), this.pkg, l => l === null ? this.ended() : this.push(l));
            this.status = 'live';
        } catch (e) {
            this.fail(extractMessage(e, 'Could not start logcat'));
        }
        this.cdr.detectChanges();
    }

    ngOnDestroy(): void {
        clearInterval(this.timer);
        this.adb.logcatStop().catch(() => {});
    }

    private push(line: string): void {
        this.pending.push(line);
        // Paused, the lines wait here; past the cap the oldest go, so a long pause cannot fill memory.
        if (this.pending.length > MAX_PENDING) this.pending.splice(0, MAX_PENDING / 5);
    }

    private ended(): void {
        if (this.status !== 'error') this.status = 'ended';
    }

    private fail(message: string): void {
        this.status = 'error';
        this.error = message;
    }

    private flush(): void {
        if (this.paused || !this.pending.length) return;
        const batch = this.pending.splice(0);
        for (const raw of batch) {
            const line = parseLine(raw);
            if (!line) continue;
            this.lines.push(line);
            if (line.tag === 'HttpCurlLoggingInterceptor') this.hasCurlLines = true;
            const call = this.tracker.feed(line);
            if (call && !this.calls.includes(call)) this.calls.push(call);
        }
        if (this.lines.length > KEEP) this.lines.splice(0, this.lines.length - KEEP);
        this.dropOldCalls();
        // Follow the newest line only when the reader is already at the bottom; otherwise leave the view alone.
        const el = this.scroller?.nativeElement;
        const atBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        this.refresh();
        this.cdr.detectChanges();
        const now = this.scroller?.nativeElement;
        if (now && atBottom) now.scrollTop = now.scrollHeight;
    }

    /** Keeps the newest KEEP_CALLS requests, and forgets what was parsed for the ones that go. */
    private dropOldCalls(): void {
        if (this.calls.length <= KEEP_CALLS) return;
        for (const c of this.calls.splice(0, this.calls.length - KEEP_CALLS)) {
            this.trees.delete(`${c.id}req`);
            this.trees.delete(`${c.id}res`);
            if (this.selected === c) this.selected = null;
        }
    }

    /** Re-applies the level and search filters. */
    refresh(): void {
        const q = this.search.trim().toLowerCase();
        const min = LEVELS.indexOf(this.level);
        this.visibleLines = this.lines
            .filter(l => LEVELS.indexOf(l.level) >= min && (!q || l.raw.toLowerCase().includes(q)))
            .slice(-SHOWN);
        this.visibleCalls = this.calls
            .filter(c => !q || `${c.method} ${c.url} ${c.status}`.toLowerCase().includes(q));
    }

    views(c: NetworkCall, side: Side): View[] { return viewsFor(c, side); }

    /** The viewer on show: the one picked, if this message has it, otherwise the default. */
    view(c: NetworkCall, side: Side): View {
        const pick = this.chosen[side];
        return pick && viewsFor(c, side).includes(pick) ? pick : defaultView(c, side);
    }

    body(c: NetworkCall, side: Side): string { return side === 'req' ? c.reqBody : c.resBody; }
    headers(c: NetworkCall, side: Side): [string, string][] { return side === 'req' ? c.reqHeaders : c.resHeaders; }
    query(c: NetworkCall) { return queryParams(c.url); }
    type(c: NetworkCall, side: Side) { return contentType(c, side); }
    hex(c: NetworkCall, side: Side) { return hexDump(this.body(c, side)); }
    raw(c: NetworkCall, side: Side) { return this.showSecrets ? rawText(c, side) : maskLine(rawText(c, side)); }

    /** The JSON of a body, parsed once per length (a response body is still growing while it streams in). */
    json(c: NetworkCall, side: Side): Parsed {
        const body = this.body(c, side);
        const key = `${c.id}${side}`;
        let t = this.trees.get(key);
        if (!t || t.len !== body.length) {
            const r = parseJson(body);
            t = {len: body.length, root: r.ok ? new JsonNode('', r.value, '$') : null, text: r.ok ? JSON.stringify(r.value, null, 2) : body};
            this.trees.set(key, t);
        }
        return t;
    }

    /** The coloured pieces of the formatted JSON, made the first time the JSON Text tab is shown. */
    tokens(c: NetworkCall, side: Side): Token[] {
        const t = this.json(c, side);
        return t.tokens ??= highlightJson(t.text);
    }

    async copy(text: string, what = 'Copied'): Promise<void> {
        try {
            await navigator.clipboard.writeText(text);
            this.copied = what;
            setTimeout(() => { this.copied = ''; this.cdr.detectChanges(); }, 1200);
        } catch {
            this.copied = 'Copy failed';
        }
        this.cdr.detectChanges();
    }

    copyCurl(c: NetworkCall): void { this.copy(toCurl(c), 'cURL copied'); }

    /** The text of whatever viewer is open, for the Copy button beside its tabs. */
    viewText(c: NetworkCall, side: Side): string {
        switch (this.view(c, side)) {
            case 'headers': return this.headers(c, side).map(h => `${h[0]}: ${h[1]}`).join('\n');
            case 'query': return this.query(c).map(q => `${q[0]}=${q[1]}`).join('\n');
            case 'json': case 'jsontext': return this.json(c, side).text;
            case 'hex': return this.hex(c, side);
            case 'raw': return rawText(c, side);
            default: return this.body(c, side);
        }
    }

    clear(): void {
        this.trees.clear();
        this.lines = [];
        this.calls = [];
        this.selected = null;
        this.tracker = new NetworkTracker();
        this.refresh();
    }

    text(line: LogLine): string {
        return this.showSecrets ? line.raw : maskLine(line.raw);
    }

    header(name: string, value: string): string {
        return !this.showSecrets && isSecretHeader(name) ? '••••' : value;
    }

    private url(c: NetworkCall): URL | null {
        try { return new URL(c.url); } catch { return null; }
    }

    host(c: NetworkCall): string { return this.url(c)?.host ?? ''; }

    path(c: NetworkCall): string {
        const u = this.url(c);
        return u ? u.pathname + u.search : c.url;
    }

    /** `HH:MM:SS` of the call, from logcat's `MM-DD HH:MM:SS.mmm`. */
    start(c: NetworkCall): string { return c.time.split(' ')[1]?.split('.')[0] ?? c.time; }

    size(c: NetworkCall): string {
        const n = c.resBody.length;
        return !c.status ? '' : n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
    }

    /** Drags a splitter: the pointer's height inside `box` becomes that pane's share, kept between 15 and 80 percent. */
    drag(event: PointerEvent, which: 'listPct' | 'reqPct', box: HTMLElement): void {
        event.preventDefault();
        const rect = box.getBoundingClientRect();
        const move = (e: PointerEvent) => {
            this[which] = Math.min(80, Math.max(15, ((e.clientY - rect.top) / rect.height) * 100));
            this.cdr.detectChanges();
        };
        const up = () => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
    }
}
