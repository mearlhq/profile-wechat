import { NETWORK_CHUNK_BYTES, NETWORK_RESPONSE_CHUNK_BYTES, type NetworkRpc, type NetworkResponse } from './networkProtocol.js';

const encode = (bytes: Uint8Array) => {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(text);
};
const decode = (data: string) => Uint8Array.from(atob(data), char => char.charCodeAt(0));

export function fetchNetworkRequest(request: Request, rpc: NetworkRpc, proxyUrl?: string): Promise<Response> {
  const contentType = request.headers.get('content-type');
  const headers: Record<string, string> = proxyUrl
    ? JSON.parse(request.headers.get('x-wxa-headers') || '{}')
    : Object.fromEntries(request.headers);
  if (proxyUrl && contentType && !Object.keys(headers).some(name => name.toLowerCase() === 'content-type')) {
    headers['content-type'] = contentType;
  }
  return fetchNetwork({ url: proxyUrl ?? request.url, method: request.method, headers, body: request.body, signal: request.signal }, rpc);
}

async function* chunks(body: ReadableStream<Uint8Array> | null, signal?: AbortSignal) {
  if (!body) return;
  const reader = body.getReader();
  const abort = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    let buffer = new Uint8Array(NETWORK_CHUNK_BYTES);
    let length = 0;
    for (;;) {
      signal?.throwIfAborted();
      const part = await reader.read();
      signal?.throwIfAborted();
      if (part.done) break;
      for (let offset = 0; offset < part.value.length;) {
        const count = Math.min(buffer.length - length, part.value.length - offset);
        buffer.set(part.value.subarray(offset, offset + count), length);
        length += count; offset += count;
        if (length === buffer.length) { yield buffer; buffer = new Uint8Array(NETWORK_CHUNK_BYTES); length = 0; }
      }
    }
    if (length) yield buffer.subarray(0, length);
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Each bridge message is bounded; response chunks are pulled as the consumer reads. */
export async function fetchNetwork(
  input: { url: string; method: string; headers: Record<string, string>; body: ReadableStream<Uint8Array> | null; signal?: AbortSignal },
  rpc: NetworkRpc,
): Promise<Response> {
  const { signal } = input;
  signal?.throwIfAborted();
  const transferId = crypto.randomUUID();
  let registered = false;
  let released = false;
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const release = async () => {
    if (released) return;
    released = true;
    signal?.removeEventListener('abort', abort);
    if (registered) await rpc({ stage: 'release', transferId }).catch(() => {});
  };
  const abort = () => {
    streamController?.error(signal?.reason ?? new DOMException('Request aborted', 'AbortError'));
    streamController = undefined;
    void release();
  };
  signal?.addEventListener('abort', abort, { once: true });
  const request = async (stage: 'fetch' | 'begin', body?: Uint8Array) => {
    signal?.throwIfAborted();
    registered = true;
    return rpc({ stage, transferId, url: input.url, method: input.method, headers: input.headers, ...(body?.length ? { body: encode(body) } : {}) }, signal);
  };
  const iterator = chunks(input.body, signal);
  try {
    const first = await iterator.next();
    const second = first.done ? { done: true as const, value: undefined } : await iterator.next();
    let result: NetworkResponse;
    if (second.done) result = await request('fetch', first.done ? undefined : first.value);
    else {
      const capability = await request('begin');
      let offset = 0;
      const write = async (body: Uint8Array) => {
        if (offset + body.length > capability.maxBytes) throw new Error(`Request body exceeds the configured ${capability.maxBytes} byte limit`);
        const accepted = await rpc({ stage: 'write', transferId, offset, body: encode(body) }, signal);
        if (accepted.offset !== offset + body.length) throw new Error('Invalid upload acknowledgement');
        offset = accepted.offset;
      };
      await write(first.value!); await write(second.value!);
      for await (const body of iterator) await write(body);
      result = await rpc({ stage: 'send', transferId }, signal);
    }
    signal?.throwIfAborted();
    const headers = {
      'x-wxa-headers': encodeURIComponent(JSON.stringify(result.headers)),
      'x-wxa-set-cookie': encodeURIComponent(JSON.stringify(result.cookies)),
      'content-type': result.headers['content-type'] || 'application/octet-stream',
    };
    if (result.kind === 'inline' || input.method.toUpperCase() === 'HEAD' || [204, 205, 304].includes(result.status)) {
      if (result.kind === 'inline') registered = false;
      await release();
      return new Response(input.method.toUpperCase() === 'HEAD' || [204, 205, 304].includes(result.status) ? null : decode(result.body || '') as BodyInit, { status: result.status, headers });
    }
    let offset = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { streamController = controller; },
      async pull(controller) {
        try {
          signal?.throwIfAborted();
          const part = await rpc({ stage: 'read', transferId, offset }, signal);
          signal?.throwIfAborted();
          const bytes = decode(part.body);
          if (part.offset !== offset || !bytes.length || bytes.length > NETWORK_RESPONSE_CHUNK_BYTES || offset + bytes.length > result.bytes) throw new Error('Invalid response chunk');
          offset += bytes.length;
          controller.enqueue(bytes);
          if (offset === result.bytes) { controller.close(); streamController = undefined; await release(); }
        } catch (error) { if (streamController) controller.error(error); streamController = undefined; await release(); }
      },
      async cancel() { streamController = undefined; await release(); },
    });
    return new Response(body as BodyInit, { status: result.status, headers });
  } catch (error) { await release(); throw error; }
  finally { await iterator.return(undefined); }
}
