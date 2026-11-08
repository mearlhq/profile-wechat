import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const preset = JSON.parse(await readFile(new URL('preset.json', root), 'utf8'));
const packageId = 'wechat-profile';
const bundleUrl = new URL(preset.packages[packageId].source, root);
const runtimePath = 'capabilities/wechat-profile/runtime.cjs';
const profilePath = 'capabilities/wechat-profile/wechat.json';
const miniProgramPath = 'capabilities/wechat-profile/mini-program-webview.json';
const runtimeUrl = new URL(runtimePath, root);
const profileUrl = new URL(profilePath, root);

function resource(bytes) {
  return { sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length };
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

const runtime = resource(await readFile(runtimeUrl));
const definition = {
  name: preset.appProfiles.wechat,
  defaultAppId: 'wechat',
  label: 'WeChat web page',
  labels: { en: 'WeChat web page', zh_CN: '微信内网页' },
  appName: 'wechat',
  settingsGroup: 'webview',
  defaultAppVersion: '8.0.58',
  uaTemplate: {
    ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/{v} NetType/WIFI Language/{language}',
    android: 'Mozilla/5.0 (Linux; Android 17; {deviceModel}; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/152.0.0.0 Mobile Safari/537.36 MicroMessenger/{v} NetType/WIFI Language/{language}',
  },
  policies: { languages: ['zh_CN', 'en'], defaultLanguage: 'zh_CN' },
  pageRuntime: { id: `${packageId}/main`, sha256: runtime.sha256 },
  uaTokens: [],
  globals: {},
  bridges: [{ global: 'WeixinJSBridge', style: 'wechat' }, { global: 'wx', style: 'wechat' }],
  activeEvents: [],
  actions: {
    open: [],
    close: [],
    title: [],
    systemInfo: [],
    protocol: [],
    noop: [],
    responses: {
      preVerifyJSAPI: { err_msg: 'preVerifyJSAPI:ok' },
      getNetworkType: { err_msg: 'network_type:wifi', subtype: 'wifi' },
    },
  },
  schemes: [],
  usage: {
    description: 'Simulate a WeChat H5 WebView with a mobile user agent and basic JSBridge.',
    limitations: ['SDK initialization and network type are simulated. Location uses the browser permission. Native APIs such as login and payment are unavailable.'],
  },
};
const profile = jsonBytes(definition);
const miniProgram = jsonBytes({
  ...definition,
  name: `${packageId}/mini-program-webview`,
  defaultAppId: 'wechat-mini-program-webview',
  label: 'WeChat mini-program web page',
  labels: { en: 'WeChat mini-program web page', zh_CN: '微信小程序内网页' },
  uaTemplate: {
    ios: `${definition.uaTemplate.ios} miniProgram`,
    android: `${definition.uaTemplate.android} miniProgram`,
  },
  usage: {
    description: 'Simulate an H5 page opened in a WeChat mini-program WebView with the miniProgram user-agent marker and basic WeChat JSBridge.',
    limitations: [...definition.usage.limitations, 'Mini-program navigation APIs are unavailable.'],
  },
});
const bundle = jsonBytes({
  schemaVersion: 1,
  id: packageId,
  version: preset.version,
  requires: preset.requires,
  resources: {
    [profilePath]: resource(profile),
    [miniProgramPath]: resource(miniProgram),
    [runtimePath]: runtime,
  },
  contributions: { appProfiles: [profilePath, miniProgramPath], pageRuntimes: { main: runtimePath } },
});

for (const [url, bytes] of [[profileUrl, profile], [new URL(miniProgramPath, root), miniProgram], [bundleUrl, bundle]]) {
  if (process.argv.includes('--check')) {
    if (!(await readFile(url)).equals(bytes)) throw new Error(`${url.pathname} is stale. Run pnpm build.`);
  } else {
    await writeFile(url, bytes);
  }
}
