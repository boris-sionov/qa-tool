import {NetworkTracker, parseLine, maskLine} from './logcat';

const L = (tid: number, level: string, msg: string) =>
    parseLine(`11-17 13:47:08.000  4845  ${tid} ${level} HttpCurlLoggingInterceptor: ${msg}`)!;

describe('NetworkTracker', () => {
    it('joins interleaved request and response lines per thread', () => {
        const t = new NetworkTracker();
        const lines = [
            L(1, 'E', 'curl -X GET \\'), L(2, 'E', 'curl -X POST \\'),
            L(1, 'E', '  https://a.tv/api/info?x=1 \\'), L(2, 'E', '  https://b.tv/login \\'),
            L(1, 'E', "  -H 'User-Agent: Free TV/2.3' \\"),
            L(2, 'E', "  -d '{\"a\":1}'"),
            L(1, 'D', 'RESPONSE 200  (147ms)'),
            L(1, 'D', "  -H 'content-type: application/json'"),
            L(1, 'D', 'RESPONSE BODY'), L(1, 'D', '{'), L(1, 'D', '  "ok": true'), L(1, 'D', '}'),
            L(2, 'D', 'RESPONSE 401  (30ms)'),
        ];
        const calls = new Map<number, any>();
        lines.forEach(l => { const c = t.feed(l); if (c) calls.set(c.id, c); });
        const [a, b] = [...calls.values()];
        expect(a.url).toBe('https://a.tv/api/info?x=1');
        expect(a.reqHeaders).toEqual([['User-Agent', 'Free TV/2.3']]);
        expect([a.status, a.ms]).toEqual([200, 147]);
        expect(a.resBody).toBe('{\n  "ok": true\n}');
        expect([b.method, b.reqBody, b.status]).toEqual(['POST', '{"a":1}', 401]);
    });

    it('masks secret headers in raw lines', () => {
        expect(maskLine("  -H 'Authorization: Basic abc123' \\")).toBe("  -H 'Authorization: ••••' \\");
    });
});
