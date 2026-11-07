import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRuntimeInstaller } from '../../wechat-miniprogram/scripts/bootstrap.js';

let root: string;
let skillRoot: string;
let cacheRoot: string;
const source = `import {readFileSync} from 'node:fs';
const input=JSON.parse(readFileSync(0,'utf8'));
if(process.env.MEARL_TEST_CHECK_FAIL){console.error('Compiler unavailable');process.exit(1)}
console.log(JSON.stringify({command:process.argv[2],input,ready:true}));`;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'wechat skill space-')));
  skillRoot = join(root, 'skill'); cacheRoot = join(root, 'cache');
  const assets = join(skillRoot, 'assets/runtime'); mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, 'dependencies.json'), JSON.stringify({ '@example/compiler': '1.2.3' }));
  writeFileSync(join(assets, 'runtime.mjs'), source);
  writeFileSync(join(assets, 'browser.js'), 'window.miniProgram=true;');
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });
function installer() {
  return vi.fn(async (_command, args) => {
    const target = args[args.indexOf('--prefix') + 1];
    const manifest = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
    for (const [name, version] of Object.entries(manifest.dependencies)) {
      const directory = join(target, 'node_modules', name); mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version }));
    }
    return { code: 0, stdout: '', stderr: '' };
  });
}

it('prepares dependencies once across concurrent callers and executes the copied runtime without a shell', async () => {
  const runner = installer();
  const first = createRuntimeInstaller({ skillRoot, cacheRoot, runner });
  const second = createRuntimeInstaller({ skillRoot, cacheRoot, runner });
  const [a, b] = await Promise.all([first.ensure(), second.ensure()]);
  expect(a).toBe(b); expect(runner).toHaveBeenCalledTimes(1);
  expect(await first.run('echo', { path: '目录/space & `literal`' })).toEqual({ command: 'echo', input: { path: '目录/space & `literal`' }, ready: true });
  expect(await second.ensure({ check: true })).toBe(a);
  expect(runner).toHaveBeenCalledTimes(1);
});

it('repairs missing runtime resources and mismatched dependency versions automatically', async () => {
  const runner = installer(); const runtime = createRuntimeInstaller({ skillRoot, cacheRoot, runner });
  const entry = await runtime.ensure();
  rmSync(entry); await runtime.ensure();
  writeFileSync(join(dirname(entry), 'node_modules/@example/compiler/package.json'), '{"version":"0.1.0"}');
  await runtime.ensure();
  expect(runner).toHaveBeenCalledTimes(3);
});

it('does not accept failed installs or failing compiler checks and permits retries', async () => {
  const failure = vi.fn().mockResolvedValue({ code: 1, stdout: '', stderr: 'Registry offline' });
  await expect(createRuntimeInstaller({ skillRoot, cacheRoot, runner: failure }).ensure()).rejects.toThrow('Registry offline');
  expect(readdirSync(cacheRoot)).toEqual([]);
  vi.stubEnv('MEARL_TEST_CHECK_FAIL', '1');
  await expect(createRuntimeInstaller({ skillRoot, cacheRoot, runner: installer() }).ensure()).rejects.toThrow('Compiler unavailable');
  expect(readdirSync(cacheRoot)).toEqual([]);
  vi.unstubAllEnvs();
  expect(await createRuntimeInstaller({ skillRoot, cacheRoot, runner: installer() }).ensure()).toContain('runtime.mjs');
});

it('pins executable resources by content so accepted snapshots retain their own runtime', async () => {
  const runner = installer(); const first = createRuntimeInstaller({ skillRoot, cacheRoot, runner });
  const a = await first.ensure();
  writeFileSync(join(skillRoot, 'assets/runtime/browser.js'), 'window.miniProgram="next";');
  const second = createRuntimeInstaller({ skillRoot, cacheRoot, runner });
  expect(await second.ensure()).not.toBe(a);
  expect(await first.ensure()).toBe(a);
  expect(runner).toHaveBeenCalledTimes(2);
});

it('runs the distributed bootstrap from an independent Skill directory with no workspace imports', async () => {
  mkdirSync(join(skillRoot, 'scripts'));
  copyFileSync(new URL('../../wechat-miniprogram/scripts/bootstrap.mjs', import.meta.url), join(skillRoot, 'scripts/bootstrap.mjs'));
  const { createRuntimeInstaller: portable } = await import(pathToFileURL(join(skillRoot, 'scripts/bootstrap.mjs')).href);
  const runner = installer();
  const runtime = portable({ cacheRoot, runner });
  expect(await runtime.run('echo', { value: 1 })).toEqual({ command: 'echo', input: { value: 1 }, ready: true });
  expect(runner).toHaveBeenCalledTimes(1);
});

it('does not install after cancellation', async () => {
  const abort = new AbortController(); abort.abort();
  const runner = installer();
  await expect(createRuntimeInstaller({ skillRoot, cacheRoot, runner }).ensure({ signal: abort.signal })).rejects.toThrow();
  expect(runner).not.toHaveBeenCalled();
});
