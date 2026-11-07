import { afterEach, expect, it, vi } from 'vitest';
const shared = vi.hoisted(() => ({ install: vi.fn(), update: vi.fn(), destroy: vi.fn() }));
vi.mock('@mearl/browser-core/deviceChromeView', () => ({ installDeviceChromeView: shared.install }));
import { installClientViewport } from '../../wechat-miniprogram/scripts/runtime/clientViewport.js';
afterEach(() => vi.unstubAllGlobals());

it('shares the H5 status renderer, follows navigation colors and keeps native page geometry', async () => {
  let notify!: () => void;
  const disconnect = vi.fn();
  vi.stubGlobal('MutationObserver', class { constructor(callback: () => void) { notify = callback; } observe() {} disconnect = disconnect; });
  shared.install.mockReturnValue({ updateState: shared.update, destroy: shared.destroy });
  const status = { replaceChildren: vi.fn() };
  const shadow = {};
  const appearance = { display: 'block', backgroundColor: '#fff', color: '#000' };
  const shell = { screenTop: () => 74, windowHeight: () => 849 };
  const before = vi.fn();
  const cleanup = vi.fn();
  const root = {
    document: { createElement: () => ({ textContent: '', setAttribute: vi.fn(), attachShadow: () => shadow }), head: { appendChild: vi.fn() }, body: { appendChild: vi.fn() }, querySelector: () => status },
    __wxaHost: { shell, info: { device: { platform: 'android', statusBarHeight: 30, safeAreaBottom: 24 } } },
    __wxa_before_launch__: before, getComputedStyle: () => appearance, addEventListener: cleanup,
  };
  const chrome = { platform: 'android' as const, statusBarHeight: 30, bottomBarHeight: 24, cutout: 'none' as const, safeAreaInsets: { top: 30, right: 0, bottom: 24, left: 0 } };
  installClientViewport(root as unknown as Window, chrome);
  await root.__wxa_before_launch__();
  expect(shared.install).toHaveBeenCalledWith(shadow, chrome);
  expect(status.replaceChildren).toHaveBeenCalledWith();
  expect(root.document.body.appendChild).toHaveBeenCalledOnce();
  expect(shell.screenTop()).toBe(74);
  expect(shell.windowHeight()).toBe(849);
  expect(before).toHaveBeenCalledOnce();
  appearance.backgroundColor = '#087f5b';
  appearance.color = '#fff';
  appearance.display = 'none';
  notify();
  expect(shared.update).toHaveBeenLastCalledWith({ statusBarVisible: true, statusBarBackground: '#087f5b', textColor: '#fff' });
  cleanup.mock.calls[0][1]();
  expect(disconnect).toHaveBeenCalled();
  expect(shared.destroy).toHaveBeenCalled();
});
