import { installDeviceChromeView } from '@mearl/browser-core/deviceChromeView';
import type { ResolvedDeviceChromeConfig } from '@mearl/browser-core';
import { installClientGeometry } from './clientGeometry.js';

/** Client bars share Mearl's renderer; the runner owns WeChat navigation and page geometry. */
export function installClientViewport(win: Window, chrome: ResolvedDeviceChromeConfig) {
  const root = win as any;
  const style = win.document.createElement('style');
  style.textContent = `
html,body,#wxa-root,.wxa-stage,.wxa-device-slot{width:100%!important;height:100%!important;min-height:0!important;margin:0!important;padding:0!important;gap:0!important;box-sizing:border-box!important}
html,body{background:#fff!important;overflow:hidden!important}
.wxa-stage,.wxa-device-slot{display:block!important}
.wxa-device{position:relative!important;left:0!important;top:0!important;width:100%!important;height:100%!important;transform:none!important;border:0!important;border-radius:0!important;box-shadow:none!important}
.wxa-statusbar:not(.is-hidden){display:block!important;padding:0!important}
.wxa-navbar,.wxa-pages,.wxa-tabbar,.wxa-overlay{width:calc(100% - ${chrome.sideBarWidth ?? 0}px)!important}
.wxa-capsule{left:auto!important;right:${7 + (chrome.sideBarWidth ?? 0)}px!important}
.wxa-notch,.wxa-home-indicator,.wxa-toolbar{display:none!important}
`;
  win.document.head.appendChild(style);
  const beforeLaunch = root.__wxa_before_launch__;
  root.__wxa_before_launch__ = async (api: unknown) => {
    const host = root.__wxaHost;
    const statusBar = win.document.querySelector<HTMLElement>('.wxa-statusbar')!;
    const mount = win.document.createElement('div');
    mount.setAttribute('data-mearl-miniprogram-chrome', '');
    statusBar.replaceChildren();
    win.document.body.appendChild(mount);
    const view = installDeviceChromeView(mount.attachShadow({ mode: 'open' }), chrome);
    installClientGeometry(host, chrome);
    const update = () => {
      const appearance = win.getComputedStyle(statusBar);
      view.updateState({ statusBarVisible: true, statusBarBackground: appearance.backgroundColor, textColor: appearance.color });
    };
    const observer = new MutationObserver(update);
    observer.observe(statusBar, { attributes: true, attributeFilter: ['style', 'class'] });
    win.addEventListener('pagehide', () => { observer.disconnect(); view.destroy(); }, { once: true });
    update();
    if (typeof beforeLaunch === 'function') await beforeLaunch(api);
  };
}
