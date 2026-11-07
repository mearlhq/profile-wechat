// The pinned runner owns the stack. Hook the two route operations before they
// discard the frame needed for the visual transition.
export function patchPageTransitions(code: string): string {
  const patches = [
    [
      'this.stack.push(page);\n      this.activate(page, "navigateTo");',
      `const previous = this.currentPage();
      this.stack.push(page);
      this.activate(page, "navigateTo");
      if (window.__mearlWxa.canAnimatePage(previous?.frame)) {
        await window.__mearlWxa.animatePage(previous.frame, page.frame, "push");
      }`,
    ],
    [
      'this.stack.pop(delta).forEach((page) => this.closePage(page));\n      this.activate(this.currentPage(), "navigateBack");',
      `const leaving = this.currentPage();
      const popped = this.stack.pop(delta);
      const animate = popped.includes(leaving) && window.__mearlWxa.canAnimatePage(leaving.frame);
      for (const page of popped) {
        if (!animate || page !== leaving) this.closePage(page);
      }
      try {
        const target = this.currentPage();
        this.activate(target, "navigateBack");
        if (animate) await window.__mearlWxa.animatePage(leaving.frame, target.frame, "pop");
      } finally {
        if (animate) this.closePage(leaving);
      }`,
    ],
  ] as const;
  for (const [original, replacement] of patches) {
    if (code.split(original).length !== 2) throw new Error('Unsupported wxa-runner page transition patch');
    code = code.replace(original, replacement);
  }
  return code;
}

const DURATION_MS = 300;

export function canAnimatePage(frame?: HTMLIFrameElement): boolean {
  return Boolean(frame?.isConnected && !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches);
}

export async function animatePage(previous: HTMLIFrameElement, current: HTMLIFrameElement, direction: 'push' | 'pop') {
  const viewport = current.parentElement;
  if (!viewport || previous.parentElement !== viewport) return;
  const sliding = direction === 'push' ? current : previous;
  const initialVisibility = previous.style.visibility;
  const initialZIndex = previous.style.zIndex;
  const initialAriaHidden = previous.getAttribute('aria-hidden');
  const regions = [viewport, ...(viewport.parentElement?.querySelectorAll<HTMLElement>(':scope > .wxa-navbar, :scope > .wxa-tabbar') ?? [])];
  const initialInert = regions.map(region => region.inert);
  let animation: Animation | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    for (const region of regions) region.inert = true;
    previous.setAttribute('aria-hidden', 'true');
    previous.style.visibility = 'visible';
    if (direction === 'pop') previous.style.zIndex = '2';
    const transforms = direction === 'push' ? ['translateX(100%)', 'translateX(0)'] : ['translateX(0)', 'translateX(100%)'];
    animation = sliding.animate({ transform: transforms }, { duration: DURATION_MS, easing: 'ease', fill: 'both' });
    await Promise.race([
      animation.finished.catch(() => undefined),
      new Promise<void>(resolve => { timeout = setTimeout(resolve, DURATION_MS + 60); }),
    ]);
  } finally {
    clearTimeout(timeout);
    animation?.cancel();
    previous.style.visibility = initialVisibility;
    previous.style.zIndex = initialZIndex;
    if (initialAriaHidden === null) previous.removeAttribute('aria-hidden');
    else previous.setAttribute('aria-hidden', initialAriaHidden);
    regions.forEach((region, index) => { region.inert = initialInert[index]; });
  }
}
