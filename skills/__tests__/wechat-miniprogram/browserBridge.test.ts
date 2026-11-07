import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createNetworkRpc } from '../../wechat-miniprogram/scripts/runtime/browserBridge.js';
import { pageRuntime } from '../../wechat-miniprogram/scripts/pageRuntime.mjs';

const input = { stage: 'fetch' as const, transferId: '00000000-0000-4000-8000-000000000001', url: 'https://example.com/startup' };

function fixture() {
  const listeners: Array<(event: MessageEvent) => void> = [];
  const win = {
    addEventListener: (_type: string, listener: (event: MessageEvent) => void) => listeners.push(listener),
    removeEventListener: (_type: string, listener: (event: MessageEvent) => void) => listeners.splice(listeners.indexOf(listener), 1),
    postMessage: (data: unknown) => queueMicrotask(() => {
      for (const listener of listeners) listener({ source: win, data } as unknown as MessageEvent);
    }),
  };
  const requests = vi.fn();
  let handler: { receive(message: any): any; dispose(): void };
  const emit = vi.fn(async (_event: string, { id }: { id: string }) => {
    const input = handler.receive({ type: 'take', id });
    requests(input);
    handler.receive({ type: 'reply', id, result: { status: 200, kind: 'inline' } });
  });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', { querySelector: () => ({ content: 'ready' }), getElementById: () => null });
  const connect = () => {
    handler = new Function(`return (${pageRuntime.code})`)()({ emit });
    handler.receive({ type: 'bind' });
    return handler;
  };
  return { win: win as unknown as Window, requests: () => requests.mock.calls, emit, connect };
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('delivers a launch request once after late bridge injection', async () => {
  const { win, requests, emit, connect } = fixture();
  const body = 'a'.repeat(128 * 1024);
  const result = createNetworkRpc(win)({ ...input, body });
  await Promise.resolve();
  expect(requests()).toHaveLength(0);
  connect();
  await expect(result).resolves.toMatchObject({ status: 200 });
  win.postMessage({ channel: 'mearl-wxa', operation: 'ready' }, '*');
  await Promise.resolve();
  expect(emit).toHaveBeenCalledExactlyOnceWith('network-request', { id: '1' });
  expect(requests()).toEqual([[{ ...input, transferId: expect.any(String), body }]]);
  expect(requests()[0][0].transferId).not.toBe(input.transferId);
});

it('connects when the bridge was installed before the page listener', async () => {
  const { win, requests, connect } = fixture();
  connect();
  await Promise.resolve();
  await expect(createNetworkRpc(win)(input)).resolves.toMatchObject({ status: 200 });
  expect(requests()).toHaveLength(1);
});

it('does not send a request cancelled before the bridge is ready', async () => {
  const { win, requests, connect } = fixture();
  const abort = new AbortController();
  const result = createNetworkRpc(win)(input, abort.signal);
  abort.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  connect();
  await Promise.resolve();
  expect(requests()).toHaveLength(0);
});

it('expires queued requests without sending them after a late connection', async () => {
  const { win, requests, connect } = fixture();
  const rpc = createNetworkRpc(win);
  const rejected = expect(rpc(input)).rejects.toThrow('Browser host request timed out');
  await vi.advanceTimersByTimeAsync(150_000);
  await rejected;
  connect();
  await expect(rpc(input)).resolves.toMatchObject({ status: 200 });
  expect(requests()).toHaveLength(1);
});

it('retries compile status polling after a failed dispatch and stops on disposal', async () => {
  const { emit, connect } = fixture();
  emit.mockResolvedValue(undefined).mockRejectedValueOnce(new Error('Temporary disconnection'));
  const handler = connect();
  await vi.advanceTimersByTimeAsync(2500);
  expect(emit.mock.calls).toEqual([['build-state', {}], ['build-state', {}]]);
  handler.dispose();
  await vi.advanceTimersByTimeAsync(2500);
  expect(emit).toHaveBeenCalledTimes(2);
});
