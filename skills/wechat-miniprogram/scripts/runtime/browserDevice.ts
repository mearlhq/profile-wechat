import type { DeviceProfile } from '@open-wxa/wxa-runner-core';
import { DEVICE_PRESETS, getDeviceChromeViewConfig, resolveEmulationConfig, type BrowserDevicePresetName } from '@mearl/browser-core';

/** Persist only the selection; all device metadata comes from the shared preset table. */
export function browserDevice(url: URL, viewport: { width: number; height: number }) {
  let selection: { preset?: unknown; orientation?: unknown } | undefined;
  try {
    const parsed = JSON.parse(url.searchParams.get('deviceSelection') || 'null');
    if (parsed && typeof parsed === 'object') selection = parsed;
  } catch { /* Invalid selections use the default adaptive device. */ }
  const preset = selection?.preset === 'ios-adaptive' ? 'iphone-17-pro' : selection?.preset === 'android-adaptive' ? 'pixel-11' : selection?.preset;
  const orientation = selection?.orientation;
  const configured = typeof preset === 'string' && Object.hasOwn(DEVICE_PRESETS, preset) && (orientation === undefined || orientation === 'portrait' || orientation === 'landscape');
  const name: BrowserDevicePresetName = configured ? preset as BrowserDevicePresetName : 'iphone-17-pro';
  const config = resolveEmulationConfig({ enabled: true, preset: name, ...(configured && (orientation === 'portrait' || orientation === 'landscape') ? { orientation } : {}) });
  const chrome = getDeviceChromeViewConfig(config);
  const adaptive = !configured || selection?.preset === 'ios-adaptive' || selection?.preset === 'android-adaptive';
  const device: DeviceProfile = {
    model: DEVICE_PRESETS[name].appProfileModel,
    system: `${chrome.platform === 'ios' ? 'iOS' : 'Android'} ${config.platformVersion}`, platform: chrome.platform,
    screenWidth: adaptive ? viewport.width : config.width, screenHeight: adaptive ? viewport.height : config.height,
    pixelRatio: config.deviceScaleFactor, statusBarHeight: chrome.statusBarHeight, safeAreaBottom: chrome.bottomBarHeight,
  };
  return { device, chrome, adaptive, configured };
}
