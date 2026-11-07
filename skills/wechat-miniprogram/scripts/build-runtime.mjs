import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const jobs = [
  { entryPoints: [root + 'scripts/bootstrap.ts'], outfile: root + 'scripts/bootstrap.mjs', platform: 'node', format: 'esm' },
  { entryPoints: [root + 'scripts/runtime/cli.ts'], outfile: root + 'assets/runtime/runtime.mjs', platform: 'node', format: 'esm', external: ['@open-wxa/*', 'esbuild'] },
  { entryPoints: [root + 'scripts/runtime/browser.ts'], outfile: root + 'assets/runtime/browser.js', platform: 'browser', format: 'iife' },
];
for (const job of jobs) {
  const result = await build({ ...job, bundle: true, write: false, target: job.platform === 'browser' ? 'chrome141' : 'node20.18', legalComments: 'inline' });
  const bytes = result.outputFiles[0].contents;
  if (process.argv.includes('--check')) {
    if (!readFileSync(job.outfile).equals(bytes)) throw new Error(`Outdated WeChat Skill resource: ${job.outfile}`);
  } else writeFileSync(job.outfile, bytes);
}
