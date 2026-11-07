import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const preset = JSON.parse(await readFile(new URL('preset.json', root), 'utf8'));
const packageId = 'wechat-profile';
const bundleUrl = new URL(preset.packages[packageId].source, root);
const runtimeUrl = new URL('runtime.cjs', bundleUrl);
const profileUrl = new URL('wechat.json', bundleUrl);

function resource(bytes) {
  return { sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length };
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

const runtime = resource(await readFile(runtimeUrl));
const profile = jsonBytes({
  name: preset.appProfiles.wechat,
  label: 'WeChat',
  labels: { en: 'WeChat', zh_CN: '微信' },
  appName: 'wechat',
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
});
const bundle = jsonBytes({
  schemaVersion: 1,
  id: packageId,
  version: preset.version,
  requires: preset.requires,
  resources: { 'wechat.json': resource(profile), 'runtime.cjs': runtime },
  contributions: { appProfiles: ['wechat.json'], pageRuntimes: { main: 'runtime.cjs' } },
});

for (const [url, bytes] of [[profileUrl, profile], [bundleUrl, bundle]]) {
  if (process.argv.includes('--check')) {
    if (!(await readFile(url)).equals(bytes)) throw new Error(`${url.pathname} is stale. Run pnpm build.`);
  } else {
    await writeFile(url, bytes);
  }
}
