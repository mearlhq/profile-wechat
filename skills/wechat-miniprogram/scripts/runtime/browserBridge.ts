import { NETWORK_RPC_TIMEOUT_MS, type NetworkInput, type NetworkRpc } from './networkProtocol.js';

export function createNetworkRpc(win: Window): NetworkRpc {
  const pending = new Map<string, {
    input: NetworkInput;
    resolve(value: unknown): void;
    reject(error: Error): void;
    dispose(): void;
  }>();
  let sequence = 0;
  let connected = false;
  const send = (message: object) => win.postMessage({ channel: 'mearl-wxa', ...message }, '*');
  const sendRequest = (id: string, input: NetworkInput) => send({ operation: 'request', id, input });

  win.addEventListener('message', event => {
    if (event.source !== win || event.data?.channel !== 'mearl-wxa') return;
    const message = event.data;
    if (message.operation === 'ready' && !connected) {
      connected = true;
      for (const [id, item] of pending) sendRequest(id, item.input);
    } else if (message.operation === 'reply' && connected) {
      const item = pending.get(message.id);
      item?.dispose();
      if (message.error) item?.reject(new Error(message.error));
      else item?.resolve(message.result);
    }
  });

  return (input, signal) => {
    signal?.throwIfAborted();
    const id = String(++sequence);
    return new Promise((resolve, reject) => {
      const dispose = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); pending.delete(id); };
      const abort = () => { dispose(); reject(signal?.reason ?? new DOMException('Request aborted', 'AbortError')); };
      const timer = setTimeout(() => { dispose(); reject(new Error('Browser host request timed out')); }, NETWORK_RPC_TIMEOUT_MS);
      pending.set(id, { input, resolve, reject, dispose });
      signal?.addEventListener('abort', abort, { once: true });
      if (connected) sendRequest(id, input);
      // An already installed bridge can answer even if its initial ready event was missed.
      else if (pending.size === 1) send({ operation: 'connect' });
    });
  };
}
