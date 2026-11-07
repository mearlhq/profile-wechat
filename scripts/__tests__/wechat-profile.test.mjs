import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createContext, runInContext } from 'node:vm';
import { resolveAppProfileDefinition } from '@mearl/app-profiles';
import {
  buildPageRuntimeCallSource,
  buildPageRuntimeRegistrationSource,
  prepareBrowserPreset,
  readBundleJson,
  readBundleText,
} from '@mearl/preset/bundles';
import { beforeAll, expect, it, vi } from 'vitest';

let preset;
let bundle;
let definition;

beforeAll(async () => {
  ({ preset, bundles: [bundle] } = await prepareBrowserPreset(
    new URL('../../preset.json', import.meta.url).href,
    { mearlApiVersion: '1.0.0', load: url => readFile(new URL(url)) },
  ));
  definition = readBundleJson(bundle, bundle.manifest.contributions.appProfiles[0]);
});

it.each([
  ['ios', 'iPhone'],
  ['android', 'Android 17; Example Phone; wv'],
])('prepares a selectable %s WeChat H5 profile', (os, platform) => {
  expect(preset.appProfiles.wechat).toBe(definition.name);
  const profile = resolveAppProfileDefinition(definition, {
    os,
    deviceModel: 'Example Phone',
    appVersion: '8.0.99',
    language: 'en',
  });
  expect(profile.ua).toContain(platform);
  expect(profile.ua).toContain('MicroMessenger/8.0.99 NetType/WIFI Language/en');
  expect(profile.ua).not.toMatch(/[{}]|miniProgram/);
  const path = bundle.manifest.contributions.pageRuntimes.main;
  expect(profile.injected.pageRuntime).toEqual({
    id: 'wechat-profile/main',
    sha256: bundle.manifest.resources[path].sha256,
  });
});

function createPage({ bridge, wx, geolocation } = {}) {
  const window = { WeixinJSBridge: bridge, wx };
  const document = new EventTarget();
  const navigator = { geolocation };
  const ready = vi.fn();
  document.addEventListener('WeixinJSBridgeReady', ready);
  const context = createContext({ window, document, navigator, Event, queueMicrotask, structuredClone });
  const { injected } = resolveAppProfileDefinition(definition);
  const source = readBundleText(bundle, bundle.manifest.contributions.pageRuntimes.main);
  runInContext(buildPageRuntimeRegistrationSource(injected.pageRuntime, source, '__installWechat'), context);
  const install = () => runInContext(buildPageRuntimeCallSource(JSON.stringify(injected)), context);
  install();
  return { window, navigator, injected, install, ready };
}

it('installs the mobile identity and delivers bridge results asynchronously', async () => {
  const { window, navigator, injected, install, ready } = createPage();
  expect(navigator.userAgent).toBe(injected.userAgent);
  expect(window.__mearlAppProfile__).toBe(injected.profile);
  const bridge = window.WeixinJSBridge;
  const callback = vi.fn();
  const sdkReady = vi.fn();
  window.wx.ready(sdkReady);
  bridge.invoke('preVerifyJSAPI', {}, callback);
  bridge.invoke('getNetworkType', {}, callback);
  bridge.invoke('getBrandWCPayRequest', {}, callback);
  expect(callback).not.toHaveBeenCalled();
  install();
  await Promise.resolve();
  expect(window.WeixinJSBridge).toBe(bridge);
  expect(ready).toHaveBeenCalledTimes(1);
  expect(sdkReady).toHaveBeenCalledOnce();
  expect(callback.mock.calls).toEqual([
    [{ err_msg: 'preVerifyJSAPI:ok' }],
    [{ err_msg: 'network_type:wifi', subtype: 'wifi' }],
    [{ err_msg: 'getBrandWCPayRequest:fail unsupported' }],
  ]);
});

it('reports browser location and rejects coordinates that require conversion', async () => {
  const getCurrentPosition = vi.fn(success => success({ coords: { latitude: 30, longitude: 120 } }));
  const { window } = createPage({ geolocation: { getCurrentPosition } });
  const success = vi.fn();
  const fail = vi.fn();
  const complete = vi.fn();
  window.wx.getLocation({ success, fail, complete });
  window.wx.getLocation({ type: 'gcj02', success, fail, complete });
  const sdkLocation = vi.fn();
  window.WeixinJSBridge.invoke('geoLocation', { type: 'wgs84' }, sdkLocation);
  await Promise.resolve();
  expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  expect(success).toHaveBeenCalledWith(expect.objectContaining({ latitude: 30, longitude: 120, errMsg: 'getLocation:ok' }));
  expect(fail).toHaveBeenCalledWith({ errMsg: 'getLocation:fail unavailable' });
  expect(complete).toHaveBeenCalledTimes(2);
  expect(sdkLocation).toHaveBeenCalledWith(expect.objectContaining({ latitude: 30, longitude: 120, err_msg: 'geoLocation:ok' }));
});

it('preserves a bridge and SDK already provided by the page', async () => {
  const bridge = { invoke: vi.fn() };
  const wx = { ready: vi.fn() };
  const { window, ready } = createPage({ bridge, wx });
  await Promise.resolve();
  expect(window.WeixinJSBridge).toBe(bridge);
  expect(window.wx).toBe(wx);
  expect(ready).not.toHaveBeenCalled();
});

it('can install the JSBridge alongside an existing WebView runtime', async () => {
  const { installBridge } = createRequire(import.meta.url)('../../capabilities/wechat-profile/runtime.cjs');
  const wx = { miniProgram: { getEnv: vi.fn() } };
  vi.stubGlobal('window', { wx });
  vi.stubGlobal('document', new EventTarget());
  try {
    const ready = vi.fn();
    document.addEventListener('WeixinJSBridgeReady', ready);
    installBridge(definition.actions);
    const reply = vi.fn();
    window.WeixinJSBridge.invoke('getNetworkType', {}, reply);
    await Promise.resolve();
    expect(window.wx).toBe(wx);
    expect(window).not.toHaveProperty('__mearlAppProfile__');
    expect(ready).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith({ err_msg: 'network_type:wifi', subtype: 'wifi' });
  } finally {
    vi.unstubAllGlobals();
  }
});
