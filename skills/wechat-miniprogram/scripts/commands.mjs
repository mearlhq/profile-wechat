import { fileURLToPath, pathToFileURL } from 'node:url';
import { detectProject, runtimeCommand } from './bootstrap.mjs';

export function localProjectPath(value) {
  if (typeof value !== 'string' || !value.startsWith('file:')) return value;
  const url = new URL(value);
  if ((url.hostname && url.hostname !== 'localhost') || url.search || url.hash) throw new Error('Select a local directory URL without query parameters');
  return fileURLToPath(url);
}

function fields(input, allowed) {
  for (const name of Object.keys(input)) if (!allowed.includes(name)) throw new Error(`Unknown field: ${name}`);
}

function tab(input) {
  const id = Number(input.tabId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('tabId must be a positive integer');
  return id;
}

function pageUrl(path) {
  if (typeof path !== 'string' || !path.trim() || path.includes('://') || path.startsWith('//') || path.split(/[/?]/).includes('..')) {
    throw new Error('path must be a mini-program page path');
  }
  return path.replace(/^\//, '');
}

// Executed in the runner's main frame, independently of Mearl's active business-frame selection.
export async function invokeTestApi(operation, args) {
  const deadline = Date.now() + 10_000;
  let api;
  // The document can finish loading before runner has installed its asynchronous runtime.
  while (!(api = window.__wxa_test_api__)) {
    const shown = document.querySelector('.wxa-error');
    if (shown) throw new Error(shown.textContent || 'Mini-program startup failed');
    if (Date.now() >= deadline) throw new Error('Mini-program startup timed out');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  let timer;
  try {
    await Promise.race([api.ready, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Mini-program startup timed out')), Math.max(0, deadline - Date.now())); })]);
  } finally { clearTimeout(timer); }
  if (operation === 'status') {
    const current = api.currentPage();
    return { currentPage: current, pageStack: api.pageStack(), data: api.pageData(), errors: api.errors() };
  }
  if (operation === 'reLaunch') return await api.reLaunch(...args);
  throw new Error('Unsupported mini-program operation');
}

export function createCommands(app, runRuntime = (command, input, signal) => runtimeCommand(command, input, signal, message => app.progress(message))) {
  const frames = async tabId => (await app.invoke('page_frames', { tabId })).frames;
  const api = async (tabId, operation, args = []) => {
    const main = (await frames(tabId)).find(frame => frame.isMainFrame);
    if (!main) throw new Error('Cannot find the mini-program main frame');
    const response = await app.invoke('page_eval', {
      tabId, frameId: main.frameId, expression: invokeTestApi.toString(), args: [operation, args],
    });
    return response.result;
  };
  const status = async input => {
    fields(input, ['tabId']);
    const tabId = tab(input);
    const state = await api(tabId, 'status');
    const business = (await frames(tabId)).find(frame => frame.name === state.currentPage?.frameName);
    return { tabId, ...state, businessFrameId: business?.frameId ?? null, healthy: state.errors.length === 0 };
  };
  const launch = async (command, input, context) => {
    fields(input, ['projectPath', 'watch', 'setup', 'path']);
    const { path, ...options } = input;
    if (options.projectPath !== undefined) options.projectPath = localProjectPath(options.projectPath);
    const initialPage = path === undefined ? undefined : pageUrl(path);
    app.progress('正在编译并启动微信小程序…');
    const runtime = await runRuntime(command, options, context?.signal);
    const url = new URL(runtime.url);
    if (url.protocol !== 'file:') throw new Error('Invalid mini-program browser runtime URL');
    url.searchParams.set('project', runtime.projectPath);
    url.searchParams.set('source', pathToFileURL(runtime.projectPath.replace(/\/$/, '') + '/').href);
    if (initialPage) {
      const [pagePath, query = ''] = initialPage.split(/\?(.*)/s);
      if (!runtime.pages.includes(pagePath)) throw new Error(`Page is not declared in app.json: ${pagePath}`);
      const launch = new URLSearchParams(query);
      launch.set('path', pagePath);
      url.hash = '?' + launch;
    }
    const opened = await app.invoke('tab_open', {
      url: url.href, reuse: 'prefer', match: { ignoreSearch: true, ignoreHash: true, onMultiple: 'first' }, active: true,
    });
    if (opened.reused && initialPage) {
      const result = await api(opened.tabId, 'reLaunch', ['/' + initialPage]);
      if (result.errMsg && !result.errMsg.endsWith(':ok')) throw new Error(result.errMsg);
    }
    return { runtime, ...await status({ tabId: opened.tabId }) };
  };
  return {
    start: (input, context) => launch('start', input, context),
    async prepare(input, context) {
      fields(input, ['projectPath']);
      const projectPath = localProjectPath(input.projectPath);
      const detected = detectProject(projectPath);
      if (detected.kind === 'web') return detected;
      return runRuntime('start', { projectPath: detected.projectPath }, context?.signal);
    },
    async state(input, context) {
      fields(input, ['projectPath']);
      return runRuntime('state', input, context?.signal);
    },
    async request(input, context) {
      fields(input, ['stage', 'transferId', 'url', 'method', 'headers', 'body', 'offset']);
      return runRuntime('request', input, context?.signal);
    },
    async stop(input, context) {
      fields(input, ['projectPath']);
      return runRuntime('stop', input, context?.signal);
    },
    status,
  };
}
