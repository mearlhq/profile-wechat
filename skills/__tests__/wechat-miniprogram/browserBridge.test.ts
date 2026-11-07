import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createNetworkRpc } from '../../wechat-miniprogram/scripts/runtime/browserBridge.js';

const input = { stage: 'fetch' as const, transferId: '00000000-0000-4000-8000-000000000001', url: 'https://example.com/startup' };

function fixture() {
  const listeners: Array<(event: MessageEvent) => void> = [];
  const win = {
    addEventListener: (_type: string, listener: (event: MessageEvent) => void) => listeners.push(listener),
    postMessage: (data: unknown) => queueMicrotask(() => {
      for (const listener of listeners) listener({ source: win, data } as unknown as MessageEvent);
    }),
  };
  const requests: unknown[] = [];
  const reply = (message: object) => win.postMessage({ channel: 'mearl-wxa', ...message });
  function connect() {
    win.addEventListener('message', ({ data }) => {
      if (data?.channel !== 'mearl-wxa') return;
      if (data.operation === 'connect') reply({ operation: 'ready' });
      if (data.operation === 'request') {
        requests.push(data.input);
        reply({ operation: 'reply', id: data.id, result: { status: 200 } });
      }
    });
    reply({ operation: 'ready' });
  }
  return { win: win as unknown as Window, requests, connect };
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('delivers a launch request once after late bridge injection', async () => {
  const { win, requests, connect } = fixture();
  const result = createNetworkRpc(win)(input);
  await Promise.resolve();
  expect(requests).toHaveLength(0);
  connect();
  await expect(result).resolves.toEqual({ status: 200 });
  win.postMessage({ channel: 'mearl-wxa', operation: 'ready' }, '*');
  await Promise.resolve();
  expect(requests).toEqual([input]);
});

it('connects when the bridge was installed before the page listener', async () => {
  const { win, requests, connect } = fixture();
  connect();
  await Promise.resolve();
  await expect(createNetworkRpc(win)(input)).resolves.toEqual({ status: 200 });
  expect(requests).toHaveLength(1);
});

it('does not send a request cancelled before the bridge is ready', async () => {
  const { win, requests, connect } = fixture();
  const abort = new AbortController();
  const result = createNetworkRpc(win)(input, abort.signal);
  abort.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  connect();
  await Promise.resolve();
  expect(requests).toHaveLength(0);
});

it('expires queued requests without sending them after a late connection', async () => {
  const { win, requests, connect } = fixture();
  const rpc = createNetworkRpc(win);
  const rejected = expect(rpc(input)).rejects.toThrow('Browser host request timed out');
  await vi.advanceTimersByTimeAsync(150_000);
  await rejected;
  connect();
  await expect(rpc(input)).resolves.toEqual({ status: 200 });
  expect(requests).toHaveLength(1);
});
