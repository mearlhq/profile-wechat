/** The runner converts real mouse input to touch; Chromium compatibility mouse input already has a touch sequence. */
export function installMiniProgramInput(win: Window) {
  const ignoreCompatibilityMouse = (event: MouseEvent) => {
    const capabilities = (event as MouseEvent & { sourceCapabilities?: { firesTouchEvents: boolean } | null }).sourceCapabilities;
    if (capabilities?.firesTouchEvents) event.stopImmediatePropagation();
  };
  // Register before the runner's mouse-to-touch listeners. Preserve default actions such as input focus.
  for (const type of ['mousedown', 'mousemove', 'mouseup'] as const) win.addEventListener(type, ignoreCompatibilityMouse, true);
}
