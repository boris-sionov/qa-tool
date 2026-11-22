import {JsonNode, hexDump, toCurl, viewsFor, defaultView, rawText, highlightJson} from './viewers';
import {NetworkCall} from './logcat';

const call = (over: Partial<NetworkCall> = {}): NetworkCall => ({
    id: 1, time: 't', method: 'GET', url: 'https://a.tv/x?a=1&b=2', reqHeaders: [['Cookie', 'k=v; s=1']], reqBody: '',
    status: 200, ms: 5, resHeaders: [['content-type', 'application/json']], resBody: '{"a":[1,2]}', ...over,
});

describe('viewers', () => {
    it('always offers the same response tabs, and body tabs on a request only when it has a body', () => {
        expect(viewsFor(call(), 'res')).toEqual(['headers', 'text', 'hex', 'javascript', 'json', 'jsontext', 'raw']);
        expect(viewsFor(call(), 'req')).toEqual(['headers', 'query', 'raw']);
        expect(viewsFor(call({reqBody: '{"a":1}', reqHeaders: [['content-type', 'application/json']]}), 'req'))
            .toEqual(['headers', 'query', 'json', 'jsontext', 'text', 'raw']);
        expect(defaultView(call(), 'res')).toBe('jsontext');
        expect(defaultView(call({resBody: 'plain', resHeaders: []}), 'res')).toBe('text');
    });
    it('colours JSON keys apart from string values', () => {
        const t = highlightJson('{\n  "a": "x",\n  "n": 1.5,\n  "b": true\n}');
        expect(t.filter(x => x.c).map(x => `${x.c}:${x.t}`)).toEqual(['key:"a"', 'string:"x"', 'key:"n"', 'number:1.5', 'key:"b"', 'bool:true']);
        expect(t.map(x => x.t).join('')).toBe('{\n  "a": "x",\n  "n": 1.5,\n  "b": true\n}');
    });
    it('Expand all stops at its budget', () => {
        const root = new JsonNode('', {a: {b: {c: {d: 1}}}}, '$');
        root.setAll(true, {left: 2});
        expect(root.children[0].open).toBeTrue();
        expect(root.children[0].children[0].open).toBeTrue();
        expect(root.children[0].children[0].children[0].open).toBeFalse();
    });
    it('builds a tree with paths and opens only the root', () => {
        const root = new JsonNode('', {a: [1, {b: 2}]}, '$');
        expect(root.open).toBeTrue();
        const a = root.children[0];
        expect([a.path, a.open, a.preview]).toEqual(['$.a', false, '[ ] 2 items']);
        expect(a.children[1].children[0].path).toBe('$.a[1].b');
    });
    it('dumps hex and raw', () => {
        expect(hexDump('Hi')).toBe('00000000  48 69' + ' '.repeat(47 - 5) + '  Hi');
        expect(rawText(call(), 'res').startsWith('HTTP/1.1 200\ncontent-type: application/json\n\n{')).toBeTrue();
    });
    it('quotes cURL', () => {
        expect(toCurl(call({reqBody: "it's"}))).toContain(`--data-raw 'it'\\''s'`);
    });
});
