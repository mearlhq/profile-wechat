import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Script } from 'node:vm';
import { findRuntimeDir } from '@open-wxa/wxa-runner-core';
import { expect, it } from 'vitest';
import { patchPageTransitions } from '../../wechat-miniprogram/scripts/runtime/pageTransition.js';

it('applies the route patch to the shipped runner bundle and preserves valid script syntax', () => {
  const host = readFileSync(join(findRuntimeDir(), 'host.js'), 'utf8');
  expect(() => new Script(patchPageTransitions(host))).not.toThrow();
});
