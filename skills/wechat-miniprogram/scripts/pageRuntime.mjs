import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function install(host) {
  const channel = 'mearl-wxa';
  const requests = new Map();
  const transfers = new Map();
  let bound = false;
  const post = message => window.postMessage({ channel, ...message }, '*');
  const ready = () => post({ operation: 'ready' });
  const reply = (id, result, error) => post({ operation: 'reply', id, result, error });
  const listener = event => {
    const message = event.data;
    if (!bound || event.source !== window || message?.channel !== channel) return;
    if (message.operation === 'connect') { ready(); return; }
    if (message.operation !== 'request' || typeof message.id !== 'string' || !message.input) return;
    const { id, input } = message;
    if (requests.has(id) || (requests.size >= 8 && input.stage !== 'release')) {
      reply(id, undefined, 'Too many pending requests');
      return;
    }
    if (!/^[a-f0-9-]{36}$/.test(input.transferId)) {
      reply(id, undefined, 'Invalid network transfer ID');
      return;
    }
    let transfer = transfers.get(input.transferId);
    if (input.stage === 'begin' || input.stage === 'fetch') {
      if (transfer || transfers.size >= 8) { reply(id, undefined, 'Too many active transfers or duplicate ID'); return; }
      transfer = crypto.randomUUID();
      transfers.set(input.transferId, transfer);
    }
    if (!transfer) { reply(id, undefined, 'Network transfer does not belong to this document'); return; }
    requests.set(id, { input: { ...input, transferId: transfer }, transferId: input.transferId });
    void host.emit('network-request', { id }).catch(error => {
      requests.delete(id);
      transfers.delete(input.transferId);
      reply(id, undefined, String(error));
    });
  };
  window.addEventListener('message', listener);
  return {
    receive(message) {
      if (message.type === 'bind') {
        if (bound) return;
        bound = true;
        ready();
      } else if (message.type === 'take') {
        return requests.get(message.id)?.input;
      } else if (message.type === 'reply') {
        const request = requests.get(message.id);
        if (!request) return;
        requests.delete(message.id);
        if (message.error || request.input.stage === 'release' || message.result?.kind === 'inline') transfers.delete(request.transferId);
        reply(message.id, message.result, message.error);
      }
    },
    dispose() {
      bound = false;
      window.removeEventListener('message', listener);
    },
  };
}

export const pageRuntime = {
  version: 1,
  matches: [pathToFileURL(join(homedir(), '.mearl', 'plugin-previews', 'wxa')).href + '/*.html'],
  code: install.toString(),
  initialize: 'bind-preview',
  events: {
    'network-request': { command: 'network-request', policy: 'parallel', concurrency: 8, executionTimeoutMs: 145000, schema: { type: 'object', required: ['id'], properties: { id: { type: 'string', maxLength: 64 } }, additionalProperties: false } },
  },
};

export function registerPreviewRuntime(app, commands) {
  const state = async context => {
    const { target } = await context.page.get();
    const url = new URL(target.url);
    const current = await commands.state({ projectPath: url.searchParams.get('project') }, context);
    if (fileURLToPath(current.url) !== fileURLToPath(url)) throw new Error('The project does not own this preview file');
    return current;
  };
  app.runtimeCommand('bind-preview', async (_input, context) => {
    await state(context);
    await context.page.send({ type: 'bind' });
  });
  app.runtimeCommand('network-request', async ({ event: { payload: { id } } }, context) => {
    const input = await context.page.send({ type: 'take', id });
    if (!input) return;
    let response;
    try { response = { result: await commands.request(input, context) }; }
    catch (error) { response = { error: String(error) }; }
    await context.page.send({ type: 'reply', id, ...response });
  });
}
