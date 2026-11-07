import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
const fixture = vi.hoisted(() => ({ storage: '', start: vi.fn(), stop: vi.fn() }));
vi.mock('@mearl/daemon-core', async importOriginal => {
  const original = await importOriginal<typeof import('@mearl/daemon-core')>();
  return {
    ...original,
    keyedConfigFile: (_name: string, key: string) => join(fixture.storage, original.hashKey(key) + '.json'),
    keyedDir: (name: string) => join(fixture.storage, name),
    keyedLogFile: (_name: string, key: string) => join(fixture.storage, original.hashKey(key) + '.log'),
    createDaemon: ({ configFile }: { configFile: string }) => ({
      running: () => original.readRecord(configFile),
      start: () => fixture.start(configFile),
      stop: async () => { fixture.stop(configFile); rmSync(configFile, { force: true }); },
    }),
  };
});
import { hashKey, readRecord } from '@mearl/daemon-core';
import { runtimeState, startRuntime, stopRuntime } from '../../wechat-miniprogram/scripts/runtime/index.js';
import { runtimeProjectPaths } from '../../wechat-miniprogram/scripts/runtime/project.js';
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mearl-lifecycle-'));
  fixture.storage = join(root, 'runtime'); mkdirSync(fixture.storage);
  fixture.start.mockReset();
  fixture.stop.mockClear();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function record(project: string) {
  const path = runtimeProjectPaths(project)[0];
  const config = join(fixture.storage, hashKey(path) + '.json');
  writeFileSync(config, JSON.stringify({ pid: 123, projectPath: path, transport: 'native-messaging', revision: 'ready' }));
  const html = config.replace(/\.json$/, '.html'); writeFileSync(html, 'snapshot');
  return { path, config, html };
}
it('queries and stops a registered runtime after its project directory has been deleted', async () => {
  const project = join(root, 'project'); mkdirSync(project);
  const runtime = record(project);
  rmSync(project, { recursive: true });
  expect(runtimeState({ projectPath: project })).toMatchObject({ projectPath: runtime.path, revision: 'ready' });
  expect(await stopRuntime({ projectPath: project })).toMatchObject({ stopped: true, projectPath: runtime.path });
  expect(fixture.stop).toHaveBeenCalledWith(runtime.config);
  expect(existsSync(runtime.html)).toBe(false);
});
it('finds registered framework outputs without app.json or valid project configuration', async () => {
  const output = join(root, 'dist/dev/mp-weixin'); mkdirSync(output, { recursive: true });
  const runtime = record(output);
  writeFileSync(join(root, 'project.config.json'), '{broken');
  expect(runtimeState({ projectPath: root })).toMatchObject({ projectPath: runtime.path });
  await stopRuntime({ projectPath: root });
  expect(existsSync(runtime.html)).toBe(false);
});
it('resolves symlink ancestors and rejects ambiguous registered output directories', async () => {
  const project = join(root, 'project'); mkdirSync(project);
  const alias = join(root, 'alias'); symlinkSync(project, alias, 'junction');
  expect(runtimeProjectPaths(join(alias, 'deleted'))[0]).toBe(join(runtimeProjectPaths(project)[0], 'deleted'));
  const first = join(project, 'dist/dev/mp-weixin'); mkdirSync(first, { recursive: true }); record(first);
  const second = join(project, 'unpackage/dist/dev/mp-weixin'); mkdirSync(second, { recursive: true }); record(second);
  await expect(stopRuntime({ projectPath: project })).rejects.toThrow('Multiple');
  expect(fixture.stop).not.toHaveBeenCalled();
});

it('serializes concurrent starts so both callers receive the same ready compiler', async () => {
  writeFileSync(join(root, 'app.json'), '{"pages":[]}');
  const projectPath = runtimeProjectPaths(root)[0];
  let complete!: () => void;
  const building = new Promise<void>(resolve => { complete = resolve; });
  let starts = 0;
  fixture.start.mockImplementation(async file => {
    if (readRecord(file)) return;
    starts++;
    await building;
    const url = pathToFileURL(join(fixture.storage, 'plugin-previews', 'wxa', hashKey(projectPath) + '.html')).href;
    writeFileSync(file, JSON.stringify({ pid: process.pid, projectPath, transport: 'native-messaging', options: { projectPath, watch: true }, revision: 'ready', url }));
  });
  const first = startRuntime({ projectPath });
  await expect.poll(() => starts).toBe(1);
  const second = startRuntime({ projectPath });
  complete();
  expect(await Promise.all([first, second])).toMatchObject([{ revision: 'ready', reused: false }, { revision: 'ready', reused: true }]);
  expect(starts).toBe(1);
});

it('waits for a compiler still starting after its original caller exited', async () => {
  writeFileSync(join(root, 'app.json'), '{"pages":[]}');
  const { path: projectPath, config } = record(root);
  const options = { projectPath, watch: true };
  const running = { pid: process.pid, projectPath, transport: 'native-messaging', options };
  writeFileSync(config, JSON.stringify({ ...running, daemonState: 'starting' }));
  fixture.start.mockImplementation(() => {
    setTimeout(() => writeFileSync(config, JSON.stringify({ ...running, revision: 'ready', url: 'file:///snapshot.html' })), 10);
  });
  await expect(startRuntime({ projectPath })).resolves.toMatchObject({ revision: 'ready', reused: true });
});
