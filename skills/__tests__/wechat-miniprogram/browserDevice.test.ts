import { expect, it } from 'vitest';
import { browserDevice } from '../../wechat-miniprogram/scripts/runtime/browserDevice.js';

function url(selection: unknown) {
  const value = new URL('file:///runtime.html');
  value.searchParams.set('deviceSelection', JSON.stringify(selection));
  return value;
}
it('uses the selected device profile for screen geometry and system information', () => {
  const value = url({ preset: 'pixel-11', fitToWindow: false });
  value.searchParams.set('device', JSON.stringify({ model: 'Untrusted', screenWidth: 99999, pixelRatio: -1 }));
  const result = browserDevice(value, { width: 1200, height: 800 });
  expect(result).toMatchObject({ device: { model: 'Pixel 11', screenWidth: 412, screenHeight: 923, pixelRatio: 2.625, statusBarHeight: 30, safeAreaBottom: 24, system: 'Android 17', platform: 'android' }, adaptive: false, configured: true });
});
it('fits adaptive screens to the available browser viewport', () => {
  const result = browserDevice(url({ preset: 'android-adaptive' }), { width: 800, height: 600 });
  expect(result).toMatchObject({ device: { model: 'Pixel 11', screenWidth: 800, screenHeight: 600 }, adaptive: true });
});
it('uses an adaptive default for invalid selections', () => {
  for (const selection of [null, { preset: 'constructor' }, { preset: 'unknown' }, { preset: 'pixel-11', orientation: 'invalid' }]) {
    expect(browserDevice(url(selection), { width: 800, height: 600 })).toMatchObject({ device: { screenWidth: 800, screenHeight: 600 }, configured: false, adaptive: true });
  }
});
it('derives iPhone and Duo geometry from the selection alone', () => {
  expect(browserDevice(url({ preset: 'iphone-17-pro', orientation: 'portrait' }), { width: 402, height: 874 }).chrome).toMatchObject({ cutout: 'dynamic-island', statusBarHeight: 62 });
  expect(browserDevice(url({ preset: 'iphone-duo-folded', orientation: 'portrait' }), { width: 466, height: 678 })).toMatchObject({ device: { screenWidth: 466, screenHeight: 678 }, chrome: { cutout: 'side-camera', sideBarWidth: 84, statusBarHeight: 0 } });
  expect(browserDevice(url({ preset: 'iphone-duo-unfolded', orientation: 'landscape' }), { width: 951, height: 669 })).toMatchObject({ device: { screenWidth: 951, screenHeight: 669 }, chrome: { cutout: 'none', sideBarWidth: 84, statusBarHeight: 0 } });
  expect(browserDevice(url({ preset: 'iphone-duo-unfolded', orientation: 'portrait' }), { width: 669, height: 951 }).chrome).toMatchObject({ statusBarHeight: 80 });
  expect(browserDevice(url({ preset: 'iphone-17-pro', orientation: 'landscape' }), { width: 874, height: 402 })).toMatchObject({ device: { screenWidth: 874, screenHeight: 402, statusBarHeight: 24 }, chrome: { cutout: 'none', statusBarHeight: 24 } });
});
