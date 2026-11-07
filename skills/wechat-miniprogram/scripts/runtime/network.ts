import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, rename, rm, stat, readdir, open, access } from 'node:fs/promises';
import { join } from 'node:path';
import { keyedDir } from '@mearl/daemon-core';
import { NETWORK_CHUNK_BYTES, NETWORK_RESPONSE_CHUNK_BYTES, type NetworkInput, type NetworkResponse } from './networkProtocol.js';

const TTL = 5 * 60_000;
const ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
interface Transfer {
  url: string; method: string; headers: Record<string, string>;
  phase: 'upload' | 'sending' | 'complete'; uploaded: number; expires: number; maxBytes: number;
}
function bodyLimit() {
  const value = Number(process.env.MEARL_WECHAT_NETWORK_MAX_BYTES ?? 128 * 1024 * 1024);
  if (!Number.isSafeInteger(value) || value < NETWORK_RESPONSE_CHUNK_BYTES || value > 2 * 1024 ** 3) throw new Error('MEARL_WECHAT_NETWORK_MAX_BYTES must be between 256 KiB and 2 GiB');
  return value;
}
async function exists(file: string) { try { await access(file); return true; } catch { return false; } }

/** Private, bounded disk staging shared by short-lived native command workers. */
export class NetworkTransfers {
  constructor(readonly directory = keyedDir('wechat-network')) {}
  private path(id: unknown) {
    if (typeof id !== 'string' || !ID.test(id)) throw new Error('Invalid network transfer ID');
    return join(this.directory, id);
  }
  private async save(path: string, value: Transfer) {
    const temporary = join(path, `meta.${process.pid}`);
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, join(path, 'meta.json'));
  }
  private async load(path: string): Promise<Transfer> {
    if (await exists(join(path, 'cancel'))) throw new Error('Network transfer was cancelled');
    const value = JSON.parse(await readFile(join(path, 'meta.json'), 'utf8')) as Transfer;
    if (value.expires < Date.now()) throw new Error('Network transfer expired');
    return value;
  }
  async cleanupExpired() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (const id of await readdir(this.directory)) {
      if (!ID.test(id)) continue;
      const path = this.path(id);
      // Directory activity is refreshed on every chunk; abandoned and crashed jobs are reclaimed.
      try { if ((await stat(join(path, 'meta.json'))).mtimeMs + TTL > Date.now()) continue; }
      catch { try { if ((await stat(path)).mtimeMs + TTL > Date.now()) continue; } catch { continue; } }
      await this.release(id);
      // No command can legitimately hold a lock for the five-minute idle lifetime.
      // Reclaim lock files left by a killed native worker as well.
      await rm(path, { recursive: true, force: true });
    }
  }
  async release(id: string) {
    const path = this.path(id);
    if (!await exists(path)) return { released: true };
    await writeFile(join(path, 'cancel'), '', { mode: 0o600 }).catch(() => {});
    if (!await exists(join(path, 'busy'))) await rm(path, { recursive: true, force: true });
    return { released: true };
  }
  async run(input: NetworkInput): Promise<any> {
    const path = this.path(input.transferId);
    if (input.stage === 'release') return this.release(input.transferId);
    if (input.stage === 'begin' || input.stage === 'fetch') {
      await this.cleanupExpired();
      const url = new URL(String(input.url));
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Expected an HTTP(S) request URL without credentials');
      if (Buffer.byteLength(JSON.stringify(input.headers || {})) > 64 * 1024 || url.href.length > 16 * 1024) throw new Error('Network request headers or URL are too large');
      await mkdir(path, { mode: 0o700 });
      try {
        const transfer: Transfer = { url: url.href, method: String(input.method || 'GET').toUpperCase(), headers: input.headers || {}, phase: 'upload', uploaded: 0, expires: Date.now() + TTL, maxBytes: bodyLimit() };
        await writeFile(join(path, 'upload'), '', { mode: 0o600 });
        await this.save(path, transfer);
        if (input.stage === 'begin') return { transferId: input.transferId, maxBytes: transfer.maxBytes, chunkBytes: NETWORK_CHUNK_BYTES };
        if (input.body) await this.run({ stage: 'write', transferId: input.transferId, offset: 0, body: input.body });
        return await this.send(input.transferId);
      } catch (error) { await this.release(input.transferId); throw error; }
    }
    if (input.stage === 'send') return this.send(input.transferId);
    // Only one worker may write/read/send a transfer at a time. Cancellation bypasses the lock.
    const lock = await open(join(path, 'busy'), 'wx', 0o600);
    try {
      const transfer = await this.load(path);
      const offset = input.offset;
      if (!Number.isSafeInteger(offset) || offset! < 0) throw new Error('Invalid network chunk offset');
      if (input.stage === 'write') {
        if (transfer.phase !== 'upload' || typeof input.body !== 'string' || input.body.length > Math.ceil(NETWORK_CHUNK_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.body)) throw new Error('Invalid upload chunk');
        const bytes = Buffer.from(input.body, 'base64');
        if (!bytes.length || bytes.length > NETWORK_CHUNK_BYTES || offset! > transfer.uploaded) throw new Error('Invalid upload chunk offset or size');
        if (offset! + bytes.length > transfer.maxBytes) throw new Error(`Request body exceeds the configured ${transfer.maxBytes} byte limit`);
        const file = await open(join(path, 'upload'), 'r+');
        try {
          if (offset! < transfer.uploaded) {
            const previous = Buffer.alloc(bytes.length);
            await file.read(previous, 0, previous.length, offset);
            if (offset! + bytes.length > transfer.uploaded || !previous.equals(bytes)) throw new Error('Upload retry differs from the accepted chunk');
          } else {
            let written = 0;
            while (written < bytes.length) written += (await file.write(bytes, written, bytes.length - written, offset! + written)).bytesWritten;
            transfer.uploaded += bytes.length;
          }
        } finally { await file.close(); }
        transfer.expires = Date.now() + TTL;
        await this.save(path, transfer);
        return { transferId: input.transferId, offset: offset! + bytes.length };
      }
      if (input.stage !== 'read' || transfer.phase !== 'complete') throw new Error('Network transfer is not ready to read');
      const file = await open(join(path, 'response'), 'r');
      try {
        const size = (await file.stat()).size;
        if (offset! >= size) throw new Error('Invalid response chunk offset');
        const bytes = Buffer.alloc(Math.min(NETWORK_RESPONSE_CHUNK_BYTES, size - offset!));
        const result = await file.read(bytes, 0, bytes.length, offset);
        transfer.expires = Date.now() + TTL;
        await this.save(path, transfer);
        return { transferId: input.transferId, offset, body: bytes.subarray(0, result.bytesRead).toString('base64') };
      } finally { await file.close(); }
    } finally {
      await lock.close();
      await rm(join(path, 'busy'), { force: true });
      if (await exists(join(path, 'cancel'))) await rm(path, { recursive: true, force: true });
    }
  }
  private async send(id: string): Promise<NetworkResponse> {
    const path = this.path(id);
    const lock = await open(join(path, 'busy'), 'wx', 0o600);
    const controller = new AbortController();
    const cancel = setInterval(() => { void exists(join(path, 'cancel')).then(found => { if (found) controller.abort(new Error('Network transfer was cancelled')); }); }, 100);
    const timeout = setTimeout(() => controller.abort(new Error('Network request timed out after 120 seconds')), 120_000);
    let keep = false;
    let upload: ReturnType<typeof createReadStream> | undefined;
    try {
      const transfer = await this.load(path);
      if (transfer.phase !== 'upload') throw new Error('Network transfer was already sent');
      transfer.phase = 'sending';
      transfer.expires = Date.now() + TTL;
      await this.save(path, transfer);
      if (transfer.uploaded && !['GET', 'HEAD'].includes(transfer.method)) upload = createReadStream(join(path, 'upload'));
      const response = await fetch(transfer.url, { method: transfer.method, headers: transfer.headers, body: upload as any, ...(upload ? { duplex: 'half' } : {}), signal: controller.signal });
      const headers = Object.fromEntries(response.headers);
      const cookies = response.headers.getSetCookie();
      if (Buffer.byteLength(JSON.stringify({ headers, cookies })) > 64 * 1024) throw new Error('Network response headers are too large');
      const file = await open(join(path, 'response'), 'w', 0o600);
      let bytes = 0;
      try {
        const reader = response.body?.getReader();
        for (;;) {
          const part = await reader?.read();
          if (!part || part.done) break;
          bytes += part.value.length;
          if (bytes > transfer.maxBytes) { await reader!.cancel(); throw new Error(`Response body exceeds the configured ${transfer.maxBytes} byte limit`); }
          let written = 0;
          while (written < part.value.length) written += (await file.write(part.value, written, part.value.length - written)).bytesWritten;
        }
      } finally { await file.close(); }
      const metadata = { transferId: id, status: response.status, headers, cookies, bytes };
      if (bytes <= NETWORK_RESPONSE_CHUNK_BYTES) return { ...metadata, kind: 'inline', body: (await readFile(join(path, 'response'))).toString('base64') };
      transfer.phase = 'complete';
      transfer.expires = Date.now() + TTL;
      await this.save(path, transfer);
      keep = true;
      return { ...metadata, kind: 'resource' };
    } catch (error) { controller.abort(); throw error; }
    finally {
      clearInterval(cancel); clearTimeout(timeout); upload?.destroy();
      await lock.close();
      await rm(join(path, 'busy'), { force: true });
      if (!keep || await exists(join(path, 'cancel'))) await rm(path, { recursive: true, force: true });
    }
  }
}

export const networkTransfers = new NetworkTransfers();
export function requestNetwork(input: Record<string, unknown>) { return networkTransfers.run(input as unknown as NetworkInput); }
