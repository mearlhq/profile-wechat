import { expect, it, vi } from 'vitest';
import { getDeviceChromeViewConfig, resolveEmulationConfig } from '@mearl/browser-core';
import { installClientGeometry } from '../../wechat-miniprogram/scripts/runtime/clientGeometry.js';

it('keeps Duo screen dimensions while exposing the usable page width and matching menu position', async () => {
  const native = vi.fn((api: string) => {
    if (api === 'getMenuButtonBoundingClientRect') return { left: 372, right: 459, top: 6, width: 87, height: 32 };
    const info = { screenWidth: 466, windowWidth: 466, safeArea: { left: 0, right: 466, width: 466, top: 0, bottom: 644, height: 644 }, safeAreaInsets: { top: 0, right: 0, bottom: 34, left: 0 } };
    return api === 'getSystemInfoAsync' ? Promise.resolve(info) : info;
  });
  const host = { device: { screenWidth: 466 }, api: { invoke: native as (...args: any[]) => any } };
  installClientGeometry(host, getDeviceChromeViewConfig(resolveEmulationConfig({ enabled: true, preset: 'iphone-duo-folded' })));
  for (const api of ['getSystemInfo', 'getSystemInfoSync', 'getSystemInfoAsync', 'getWindowInfo']) {
    expect(await host.api.invoke(api, {}, { api })).toMatchObject({ screenWidth: 466, windowWidth: 382, safeArea: { right: 382, width: 382 }, safeAreaInsets: { right: 84 } });
  }
  expect(host.api.invoke('getMenuButtonBoundingClientRect', {})).toMatchObject({ left: 288, right: 375, top: 6 });
  expect(host.api.invoke('getDeviceInfo', {}).windowWidth).toBe(466);
  host.device.screenWidth = 678;
  expect(host.api.invoke('getWindowInfo', {}).windowWidth).toBe(594);
});

it('leaves the ordinary iPhone and Android native API untouched', () => {
  const host = { api: { invoke: vi.fn() } };
  const original = host.api.invoke;
  installClientGeometry(host, getDeviceChromeViewConfig(resolveEmulationConfig({ enabled: true, preset: 'iphone-17-pro' })));
  expect(host.api.invoke).toBe(original);
});
