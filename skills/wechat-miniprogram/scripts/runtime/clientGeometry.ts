import type { ResolvedDeviceChromeConfig } from '@mearl/browser-core';

/** The runner's native system API assumes a full-width page; Duo has a separate system side bar. */
export function installClientGeometry(host: any, chrome: ResolvedDeviceChromeConfig) {
  const side = chrome.sideBarWidth ?? 0;
  if (!side) return;
  const invoke = host.api.invoke.bind(host.api);
  host.api.invoke = (api: string, ...args: unknown[]) => {
    const update = (result: any) => {
      if (!result || typeof result !== 'object') return result;
      if (['getSystemInfo', 'getSystemInfoSync', 'getSystemInfoAsync', 'getWindowInfo'].includes(api) && typeof result.windowWidth === 'number') {
        return {
          ...result, windowWidth: Math.max(0, host.device.screenWidth - side),
          ...(result.safeArea ? { safeArea: { ...result.safeArea, right: result.safeArea.right - side, width: result.safeArea.width - side } } : {}),
          ...(result.safeAreaInsets ? { safeAreaInsets: { ...result.safeAreaInsets, right: side } } : {}),
        };
      }
      if (api === 'getMenuButtonBoundingClientRect' && typeof result.left === 'number') return { ...result, left: result.left - side, right: result.right - side };
      return result;
    };
    const result = invoke(api, ...args);
    return result && typeof result.then === 'function' ? result.then(update) : update(result);
  };
}
