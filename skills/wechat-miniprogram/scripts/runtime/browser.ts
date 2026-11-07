// Browser host adapter. The official runner owns compilation, framework and page behavior.
import { FileStore, mimeType, extname, routeApp } from '@open-wxa/wxa-runner-core/web';
import { browserDevice } from './browserDevice.js';
import { installClientViewport } from './clientViewport.js';
import { fetchNetworkRequest } from './browserNetwork.js';
import { createNetworkRpc } from './browserBridge.js';
import { installMiniProgramInput } from './browserInput.js';
import { animatePage, canAnimatePage, patchPageTransitions } from './pageTransition.js';

const root = window as any;
const nativeFetch = window.fetch.bind(window);
const snapshot = root.__mearlWxaSnapshot;
const viewport = { width: innerWidth, height: innerHeight };
const runtimeDevice = browserDevice(new URL(location.href), viewport);
if (runtimeDevice.adaptive) {
  root.addEventListener('resize', () => {
    const size = { screenWidth: innerWidth, screenHeight: innerHeight };
    Object.assign(runtimeDevice.device, size);
    if (root.__wxaHost) Object.assign(root.__wxaHost.device, size);
  });
}
const origin = 'https://mearl-wxa.invalid';
const launch = root.location.hash.slice(1) || new URL(root.location.href).searchParams.get('launch') || '';
const source = { build: snapshot.build, moduleScript: (id: string) => snapshot.modules[id], baseLib: snapshot.baseLib, isolated: snapshot.isolated, hot: false };
const networkRpc = createNetworkRpc(root);
const storage = window.localStorage;
const sessions = new Map<string, FileStore>();
const blobs = new Map<string, string>();
const decode = (data: string) => Uint8Array.from(atob(data), char => char.charCodeAt(0));

function virtualUrl(value: string, base = '/') {
  return new URL(String(value).replace(/^null\//, '/'), new URL(base, origin));
}

function resource(url: URL): { body: string | Uint8Array; type: string; status: number } | null {
  if (url.origin !== origin) return null;
  const routed = routeApp(source, url);
  if (routed) return { ...routed, type: mimeType(routed.type) };
  const pathname = decodeURIComponent(url.pathname);
  const stored = /^\/__wxa__\/(?:usr|tmp)\/([^/]+)\//.exec(pathname);
  if (stored) {
    try { return { body: fileStore(stored[1]).read(pathname), type: mimeType(extname(pathname)), status: 200 }; } catch { return null; }
  }
  const file = snapshot.resources[pathname] || snapshot.resources[pathname.replace(/^\/__wxa__\/webview\//, '/')];
  return file ? { body: decode(file.data), type: file.type || mimeType(extname(pathname)), status: 200 } : null;
}

function script(url: URL): string {
  const response = resource(url);
  if (!response || response.status !== 200) throw new Error(`Missing script: ${url.pathname}`);
  let code = typeof response.body === 'string' ? response.body : new TextDecoder().decode(response.body);
  if (url.pathname.startsWith('/__wxa__/runtime/')) {
    if (url.pathname.endsWith('/host.js')) code = patchPageTransitions(code);
    // Runner bundles are IIFEs; lexical location supplies resource paths without a network origin.
    code = `(function(location,history){${code}\n})(window.__mearlWxa.location(window),window.__mearlWxa.history);`;
    if (url.pathname.endsWith('/host.js') && snapshot.setup) {
      if ((code.match(/import\(\w+\)/g) || []).length !== 1) throw new Error('Unsupported runner setup loader');
      code = code.replace(/import\(\w+\)/g, 'Promise.resolve(window.__mearlWxa.setup)');
    }
  }
  return code + '\n//# sourceURL=' + origin + url.pathname;
}

function blobUrl(url: URL, isScript = false): string {
  const key = (isScript ? 'script:' : '') + url.href;
  if (blobs.has(key)) return blobs.get(key)!;
  const response = resource(url);
  if (!response) return 'data:,';
  const blob = new Blob([isScript ? script(url) : response.body as BlobPart], { type: response.type });
  const value = URL.createObjectURL(blob);
  blobs.set(key, value);
  return value;
}

function html(url: URL): string {
  const response = resource(url);
  if (!response) throw new Error(`Missing mini-program page: ${url.pathname}`);
  let text = String(response.body);
  text = text.replace(/<script\b([^>]*?)\s+src="([^"]+)"([^>]*)><\/script>/g, (_match, before, src, after) => {
    const code = script(virtualUrl(src, url.href)).replace(/<\/script/gi, '<\\/script');
    return `<script${before}${after}>${code}</script>`;
  });
  const prelude = `<script>window.__mearlWxa=parent.__mearlWxa;window.__mearlWxa.install(window,${JSON.stringify(url.href)});</script>`;
  return text.replace(/<head>/i, '<head>' + prelude);
}

function fileStore(session: string): FileStore {
  if (!/^[a-z0-9-]{1,80}$/i.test(session)) throw new Error('Invalid filesystem session');
  if (!sessions.has(session)) sessions.set(session, new FileStore([`/__wxa__/usr/${session}`, `/__wxa__/tmp/${session}`]));
  return sessions.get(session)!;
}

function filesystemSession(url: URL, method: string): string | undefined {
  if (url.origin !== origin || method !== 'POST') return;
  return /^\/__wxa__\/fs\/([^/]+)\/?$/.exec(url.pathname)?.[1];
}

function fileOperation(session: string, body: string) {
  try {
    const { operation, args } = JSON.parse(body);
    return { result: fileStore(session).execute(operation, args || {}) };
  } catch (error) {
    return { error: String(error) };
  }
}

async function fetchResource(value: string | URL | Request, init: RequestInit = {}, base = '/') {
  // Request objects can originate in any of the runtime's frames.
  const input = Object.prototype.toString.call(value) === '[object Request]' ? value as Request : virtualUrl(String(value), base);
  const request = new Request(input, init);
  request.signal.throwIfAborted();
  if (/^(?:blob:|data:)/.test(request.url)) return nativeFetch(request);
  const url = new URL(request.url);
  const method = request.method;
  if (url.pathname === '/__wxa__/app-info.json') return Response.json({ version: snapshot.build.version, appid: snapshot.appid, baseLibVersion: snapshot.baseLib.version, wxConfig: snapshot.build.wxConfig, pages: snapshot.build.pages, device: runtimeDevice.device, liveReload: false, externalServiceWorker: true, socketProxy: false, ...(snapshot.setup ? { setup: { env: snapshot.setupEnv } } : {}) });
  const session = filesystemSession(url, method);
  if (session) return Response.json(fileOperation(session, await request.text()));
  const temporary = /^\/__wxa__\/tmp\/([^/]+)\/?$/.exec(url.pathname);
  if (temporary && method === 'POST') {
    const path = `/__wxa__/tmp/${temporary[1]}/${crypto.randomUUID()}.${url.searchParams.get('type') || 'bin'}`;
    fileStore(temporary[1]).write(path, new Uint8Array(await request.arrayBuffer()));
    return Response.json({ url: origin + path });
  }
  const stored = /^\/__wxa__\/(?:usr|tmp)\/([^/]+)\//.exec(url.pathname);
  if (stored) {
    const files = fileStore(stored[1]);
    if (method === 'DELETE') { files.remove(url.pathname, { dir: false }); return new Response(null); }
    try { return new Response(method === 'HEAD' ? null : files.read(url.pathname) as BodyInit); } catch { return new Response(null, { status: 404 }); }
  }
  const proxy = /^\/__wxa__\/proxy\/(https?)\/(.+)$/.exec(url.pathname);
  if (proxy || url.origin !== origin) {
    return fetchNetworkRequest(request, networkRpc, proxy ? `${proxy[1]}://${proxy[2]}${url.search}` : undefined);
  }
  if (url.pathname.startsWith('/__wxa__/mock/')) return new Response(null, { status: 204 });
  const response = resource(url);
  return response ? new Response(response.body as BodyInit, { status: response.status, headers: { 'content-type': response.type } }) : new Response('Resource not found', { status: 404 });
}

function install(win: any, path: string) {
  if (win !== root) installMiniProgramInput(win);
  win.__mearlWxa = host;
  win.__mearlWxaPath = path;
  Object.defineProperty(win, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(win, 'sessionStorage', { value: storage, configurable: true });
  Object.defineProperty(win.navigator, 'serviceWorker', { value: undefined, configurable: true });
  win.fetch = (value: string | URL | Request, init?: RequestInit) => fetchResource(value, init, path);
  const frameSrc = Object.getOwnPropertyDescriptor(win.HTMLIFrameElement.prototype, 'src')!;
  Object.defineProperty(win.HTMLIFrameElement.prototype, 'src', { ...frameSrc, set(this: HTMLIFrameElement, value: string) {
    const url = virtualUrl(value, path);
    if (url.origin !== origin) throw new Error('External web-view is not supported by this sandbox host');
    this.srcdoc = html(url);
  } });
  const asset = (value: string, isScript: boolean) => {
    if (/^(?:data:|blob:)/.test(value)) return value;
    const url = virtualUrl(value, path);
    return url.origin === origin ? blobUrl(url, isScript) : value;
  };
  for (const [type, name, isScript] of [[win.HTMLScriptElement, 'src', true], [win.HTMLImageElement, 'src', false], [win.HTMLMediaElement, 'src', false], [win.HTMLLinkElement, 'href', false]] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(type.prototype, name)!;
    if (descriptor?.set) Object.defineProperty(type.prototype, name, { ...descriptor, set(value: string) { descriptor.set!.call(this, asset(value, isScript)); } });
  }
  const setAttribute = win.Element.prototype.setAttribute;
  const css = (value: string) => value.replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g, (_match, _quote, url) => `url("${asset(url, false)}")`);
  win.Element.prototype.setAttribute = function(name: string, value: string) {
    if (name === 'src' && ['IFRAME', 'SCRIPT', 'IMG', 'AUDIO', 'VIDEO'].includes(this.tagName)) { this.src = value; return; }
    return setAttribute.call(this, name, name === 'style' ? css(value) : value);
  };
  const textContent = Object.getOwnPropertyDescriptor(win.Node.prototype, 'textContent')!;
  Object.defineProperty(win.Node.prototype, 'textContent', { ...textContent, set(this: HTMLElement, value: string) { textContent.set!.call(this, this.tagName === 'STYLE' ? css(value) : value); } });
  const appendChild = win.Node.prototype.appendChild;
  win.Node.prototype.appendChild = function(child: Node) {
    if (this.tagName === 'STYLE' && child.nodeType === 3) child.textContent = css(child.textContent || '');
    return appendChild.call(this, child);
  };
  // The base library reads scripts synchronously and the runner uses sync POST for FileSystemManager.
  win.XMLHttpRequest = class {
    status = 0; responseText = ''; response: any; readyState = 0;
    private url = ''; private method = 'GET'; private async = true;
    onload?: () => void; onreadystatechange?: () => void; onerror?: () => void;
    open(method: string, url: string, async = true) { this.method = method.toUpperCase(); this.url = url; this.async = async; }
    send(body = '') {
      const url = virtualUrl(this.url, path);
      const session = filesystemSession(url, this.method);
      const response = session ? { status: 200, body: JSON.stringify(fileOperation(session, body)) } : resource(url);
      this.status = response?.status ?? 404;
      this.response = this.responseText = response ? typeof response.body === 'string' ? response.body : new TextDecoder().decode(response.body) : '';
      this.readyState = 4;
      const notify = () => { this.onreadystatechange?.(); this.onload?.(); };
      if (this.async) queueMicrotask(notify); else notify();
    }
    setRequestHeader() {} getResponseHeader() { return null; } abort() {}
  };
}

const host = {
  install,
  animatePage,
  canAnimatePage,
  location(win: any) { const url = virtualUrl(win.__mearlWxaPath || '/' + launch); return { origin, href: url.href, pathname: url.pathname, search: url.search, protocol: 'https:', host: url.host, reload: () => root.location.reload() }; },
  history: { replaceState(_state: unknown, _title: string, value: string) {
    const url = virtualUrl(value);
    root.__mearlWxaPath = url.href;
    root.history.replaceState(null, '', '#' + url.search);
  } },
  setup: null as any,
};
install(root, origin + '/' + launch);
installClientViewport(root, runtimeDevice.chrome);
if (snapshot.setup) {
  const setupScript = document.createElement('script');
  setupScript.textContent = snapshot.setup;
  document.head.appendChild(setupScript);
  host.setup = root.__mearlWxaSetup;
}
const entry = document.createElement('script');
entry.textContent = script(virtualUrl('/__wxa__/runtime/host.js'));
document.body.appendChild(entry);
