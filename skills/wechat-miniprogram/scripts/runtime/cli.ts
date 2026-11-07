#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { compileRuntime, runtimeState } from './index.js';
import { checkRuntime } from './check.js';

const [command, payload = '{}'] = process.argv.slice(2);
try {
  const input = JSON.parse(payload === '--stdin' ? readFileSync(0, 'utf8') : payload);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a JSON object');
  // Reserve stdout for one JSON result.
  console.log = console.error;
  const result = command === 'check' ? await checkRuntime()
    : command === 'compile' ? await compileRuntime(input)
    : command === 'state' ? runtimeState(input)
    : command === 'request' ? await (await import('./network.js')).requestNetwork(input)
    : (() => { throw new Error('Unknown mini-program runtime command'); })();
  process.stdout.write(JSON.stringify(result) + '\n');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
