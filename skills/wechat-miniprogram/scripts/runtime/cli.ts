#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { serveRuntime, startRuntime, stopRuntime, runtimeState } from './index.js';
import { checkRuntime } from './check.js';

const [command, payload = '{}'] = process.argv.slice(2);
try {
  const input = JSON.parse(payload === '--stdin' ? readFileSync(0, 'utf8') : payload);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a JSON object');
  // The CLI reserves stdout for one JSON result; daemon diagnostics go to stderr.
  console.log = console.error;
  if (command === '--foreground') {
    await serveRuntime(input);
  } else {
    const result = command === 'check' ? await checkRuntime()
      : command === 'start' ? await startRuntime(input)
      : command === 'stop' ? await stopRuntime(input)
      : command === 'state' ? runtimeState(input)
      : command === 'request' ? await (await import('./network.js')).requestNetwork(input)
      : (() => { throw new Error('Unknown mini-program runtime command'); })();
    process.stdout.write(JSON.stringify(result) + '\n');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
