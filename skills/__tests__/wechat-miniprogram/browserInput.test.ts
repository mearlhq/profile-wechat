import { expect, it } from 'vitest';
import { installMiniProgramInput } from '../../wechat-miniprogram/scripts/runtime/browserInput.js';

function input(type: string, firesTouchEvents?: boolean) {
  const event = new Event(type, { cancelable: true });
  if (firesTouchEvents !== undefined) Object.defineProperty(event, 'sourceCapabilities', { value: { firesTouchEvents } });
  return event;
}

function fixture() {
  const target = new EventTarget();
  installMiniProgramInput(target as unknown as Window);
  let taps = 0;
  // The foundation handles touch; the runner translates mouse input for desktop users.
  target.addEventListener('touchend', () => { taps++; });
  target.addEventListener('mouseup', () => target.dispatchEvent(input('touchend')));
  return { target, count: () => taps };
}

it('delivers one tap for a touch followed by compatibility mouse events', () => {
  const { target, count } = fixture();
  target.dispatchEvent(input('touchstart'));
  target.dispatchEvent(input('touchend'));
  for (const type of ['mousedown', 'mousemove', 'mouseup']) {
    const event = input(type, true);
    let reachedRunner = false;
    target.addEventListener(type, () => { reachedRunner = true; }, { once: true });
    target.dispatchEvent(event);
    expect(reachedRunner).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  }
  expect(count()).toBe(1);
});

it('preserves consecutive real mouse clicks, mouse events without capabilities, and touch gestures', () => {
  const { target, count } = fixture();
  for (const capabilities of [false, false, undefined]) {
    target.dispatchEvent(input('mousedown', capabilities));
    target.dispatchEvent(input('mouseup', capabilities));
  }
  expect(count()).toBe(3);
  target.dispatchEvent(input('touchstart'));
  target.dispatchEvent(input('touchmove'));
  target.dispatchEvent(input('touchend'));
  expect(count()).toBe(4);
});
