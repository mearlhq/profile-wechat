import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createServer, type Server, type RequestListener } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { NetworkTransfers } from '../../wechat-miniprogram/scripts/runtime/network.js';
import { NETWORK_CHUNK_BYTES, NETWORK_RESPONSE_CHUNK_BYTES, type NetworkRpc } from '../../wechat-miniprogram/scripts/runtime/networkProtocol.js';
import { fetchNetwork, fetchNetworkRequest } from '../../wechat-miniprogram/scripts/runtime/browserNetwork.js';

let transfers: NetworkTransfers;
let directory: string;
let server: Server | undefined;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'wechat-network-')); transfers = new NetworkTransfers(directory); });
afterEach(async () => {
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; }
  await rm(directory, { recursive: true, force: true });
});
async function listen(handler: RequestListener) {
  server = createServer(handler);
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as any).port}`;
}
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const input = (url: string, body?: Uint8Array, signal?: AbortSignal) => ({ url, method: body ? 'POST' : 'GET', headers: { 'x-test': 'forwarded' }, body: body ? new Response(body as BodyInit).body : null, signal });
function bridge() {
  const calls: string[] = [];
  const rpc: NetworkRpc = async value => {
    calls.push(value.stage);
    expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThan(256 * 1024);
    const result = await transfers.run(value);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(512 * 1024);
    return result;
  };
  return { calls, rpc };
}

it('rejects non-network URLs, invalid IDs and oversized individual chunks before fetching', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await expect(transfers.run({ stage: 'fetch', transferId: randomUUID(), url: 'file:///etc/passwd' })).rejects.toThrow('HTTP(S)');
  await expect(transfers.run({ stage: 'release', transferId: '../../wechat-miniprogram/scripts/runtime/outside' })).rejects.toThrow('ID');
  await expect(transfers.run({ stage: 'release', transferId: 'ABCDEFAB-ABCD-4ABC-8ABC-ABCDEFABCDEF' })).rejects.toThrow('ID');
  await expect(transfers.run({ stage: 'fetch', transferId: randomUUID(), url: 'https://example.com', body: Buffer.alloc(NETWORK_CHUNK_BYTES + 1).toString('base64') })).rejects.toThrow('chunk');
  expect(fetch).not.toHaveBeenCalled();
  expect(await readdir(directory)).toEqual([]);
});

it('keeps small uploads/responses in one bridge call and preserves headers, cookies and gzip decoding', async () => {
  const url = await listen((request, response) => {
    expect(request.headers['x-test']).toBe('forwarded');
    let text = ''; request.on('data', part => { text += part; });
    request.on('end', () => { response.writeHead(201, { 'content-type': 'application/json', 'content-encoding': 'gzip', 'set-cookie': ['one=1', 'two=2'] }); response.end(gzipSync(JSON.stringify({ text }))); });
  });
  const { rpc, calls } = bridge();
  const response = await fetchNetworkRequest(new Request(url, { method: 'POST', headers: { 'x-test': 'forwarded' }, body: 'hello' }), rpc);
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ text: 'hello' });
  expect(JSON.parse(decodeURIComponent(response.headers.get('x-wxa-set-cookie')!))).toEqual(['one=1', 'two=2']);
  expect(calls).toEqual(['fetch']);
  expect(await readdir(directory)).toEqual([]);
});

it('uploads and downloads multi-MiB binary bodies with bounded messages and exact integrity', async () => {
  const upload = Uint8Array.from({ length: 4 * 1024 * 1024 + 37 }, (_, index) => index % 251);
  const download = Uint8Array.from({ length: 8 * 1024 * 1024 + 91 }, (_, index) => (index * 7) % 253);
  const url = await listen((request, response) => {
    const received = createHash('sha256'); let size = 0;
    request.on('data', part => { size += part.length; received.update(part); });
    request.on('end', () => {
      response.writeHead(200, { 'x-upload-hash': received.digest('hex'), 'x-upload-bytes': String(size) });
      response.end(download);
    });
  });
  const { rpc, calls } = bridge();
  const response = await fetchNetwork(input(url, upload), rpc);
  const headers = JSON.parse(decodeURIComponent(response.headers.get('x-wxa-headers')!));
  expect(headers['x-upload-hash']).toBe(hash(upload));
  expect(Number(headers['x-upload-bytes'])).toBe(upload.length);
  expect(hash(new Uint8Array(await response.arrayBuffer()))).toBe(hash(download));
  expect(calls).toContain('begin'); expect(calls).toContain('send'); expect(calls).toContain('read');
  await expect.poll(async () => readdir(directory)).toEqual([]);
});

it('preserves generated multipart boundaries when forwarding runner proxy requests', async () => {
  const url = await listen((request, response) => {
    let body = '';
    request.on('data', part => { body += part; });
    request.on('end', () => response.end(JSON.stringify({ body, type: request.headers['content-type'], custom: request.headers['x-test'] })));
  });
  const form = new FormData(); form.set('field', 'multipart-value');
  const request = new Request('https://mearl-wxa.invalid/__wxa__/proxy/http/example.com', {
    method: 'POST', headers: { 'x-wxa-headers': '{"x-test":"forwarded"}' }, body: form,
  });
  const response = await fetchNetworkRequest(request, bridge().rpc, url);
  const result = await response.json();
  expect(result.type).toMatch(/^multipart\/form-data; boundary=/);
  expect(result.body).toContain(result.type.split('boundary=')[1]);
  expect(result.body).toContain('multipart-value');
  expect(result.custom).toBe('forwarded');
});

it('enforces the configurable limit for uploads and responses without Content-Length', async () => {
  vi.stubEnv('MEARL_WECHAT_NETWORK_MAX_BYTES', String(NETWORK_RESPONSE_CHUNK_BYTES));
  const url = await listen((request, response) => { request.resume(); response.write(Buffer.alloc(NETWORK_RESPONSE_CHUNK_BYTES)); response.end(Buffer.alloc(1)); });
  await expect(fetchNetwork(input(url), bridge().rpc)).rejects.toThrow('Response body exceeds');
  await expect(fetchNetwork(input(url, new Uint8Array(NETWORK_RESPONSE_CHUNK_BYTES + 1)), bridge().rpc)).rejects.toThrow('Request body exceeds');
  expect(await readdir(directory)).toEqual([]);
});

it('accepts an exact upload retry but rejects conflicting and out-of-order chunks', async () => {
  const transferId = randomUUID();
  await transfers.run({ stage: 'begin', transferId, url: 'https://example.com' });
  const chunk = { stage: 'write' as const, transferId, offset: 0, body: 'aGVsbG8=' };
  expect(await transfers.run(chunk)).toMatchObject({ offset: 5 });
  expect(await transfers.run(chunk)).toMatchObject({ offset: 5 });
  await expect(transfers.run({ ...chunk, body: 'd29ybGQ=' })).rejects.toThrow('differs');
  await expect(transfers.run({ ...chunk, offset: 10 })).rejects.toThrow('offset');
  await transfers.release(transferId);
  expect(await readdir(directory)).toEqual([]);
});

it('cancels a live native download and removes its staging files', async () => {
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const url = await listen((_request, response) => { response.write(Buffer.alloc(1024)); started(); });
  const transferId = randomUUID();
  const sending = transfers.run({ stage: 'fetch', transferId, url });
  const rejected = expect(sending).rejects.toThrow('cancelled');
  await ready;
  await transfers.release(transferId);
  await rejected;
  expect(await readdir(directory)).toEqual([]);
});

it('releases a partially consumed response and a response aborted by its caller', async () => {
  const url = await listen((_request, response) => response.end(Buffer.alloc(NETWORK_CHUNK_BYTES * 3)));
  const response = await fetchNetwork(input(url), bridge().rpc);
  const reader = response.body!.getReader();
  expect((await reader.read()).value!.length).toBe(NETWORK_RESPONSE_CHUNK_BYTES);
  await reader.cancel();
  await expect.poll(async () => readdir(directory)).toEqual([]);
  const abort = new AbortController();
  const aborted = await fetchNetworkRequest(new Request(url, { signal: abort.signal }), bridge().rpc);
  abort.abort(new DOMException('Aborted', 'AbortError'));
  await expect(aborted.arrayBuffer()).rejects.toThrow('Aborted');
  await expect.poll(async () => readdir(directory)).toEqual([]);
});

it('times out stalled forwarding and reclaims expired data including crashed worker locks', async () => {
  const transferId = randomUUID();
  await transfers.run({ stage: 'begin', transferId, url: 'https://example.com' });
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }); started();
  })));
  vi.useFakeTimers();
  const sending = transfers.run({ stage: 'send', transferId });
  const rejected = expect(sending).rejects.toThrow('120 seconds');
  await ready;
  await vi.advanceTimersByTimeAsync(120_000);
  await rejected;
  vi.useRealTimers();
  const abandoned = randomUUID();
  await transfers.run({ stage: 'begin', transferId: abandoned, url: 'https://example.com' });
  await writeFile(join(directory, abandoned, 'busy'), 'crashed');
  const past = new Date(Date.now() - 6 * 60_000);
  await utimes(join(directory, abandoned, 'meta.json'), past, past);
  await transfers.cleanupExpired();
  expect(await readdir(directory)).toEqual([]);
});
