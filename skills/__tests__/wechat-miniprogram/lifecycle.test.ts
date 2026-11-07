import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const fixture = vi.hoisted(() => ({ storage: '', compilerAlive: false, build: vi.fn(), dispose: vi.fn() }));
vi.mock('@mearl/daemon-core', async importOriginal => {
  const original = await importOriginal<typeof import('@mearl/daemon-core')>();
  return {
    ...original,
    keyedConfigFile: (_name: string, key: string) => join(fixture.storage, original.hashKey(key) + '.json'),
    keyedDir: (name: string) => join(fixture.storage, name),
    isAlive: (pid: number) => pid === 123 ? fixture.compilerAlive : original.isAlive(pid),
  };
});
vi.mock('../../wechat-miniprogram/scripts/runtime/snapshot.js', () => ({
  createSnapshotBuilder: async () => ({ builder: { dispose: fixture.dispose }, build: fixture.build }),
}));
import { hashKey } from '@mearl/daemon-core';
import { compileRuntime, runtimeState } from '../../wechat-miniprogram/scripts/runtime/index.js';
import { runtimeProjectPaths } from '../../wechat-miniprogram/scripts/runtime/project.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mearl-lifecycle-'));
  fixture.storage = join(root, 'runtime');
  fixture.compilerAlive = false;
  fixture.dispose.mockClear();
  fixture.build.mockReset().mockResolvedValue({ html: '<html>first</html>', pages: ['pages/index/index'] });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function files(project: string) {
  const path = runtimeProjectPaths(project)[0];
  const key = hashKey(path);
  return { path, config: join(fixture.storage, key + '.json'), html: join(fixture.storage, 'plugin-previews', 'wxa', key + '.html') };
}
function writePreview(project: string) {
  const preview = files(project);
  mkdirSync(dirname(preview.html), { recursive: true });
  writeFileSync(preview.html, 'snapshot');
  return preview;
}

it('finds a preview after its framework output directory is deleted', async () => {
  const output = join(root, 'dist/dev/mp-weixin');
  mkdirSync(output, { recursive: true });
  const preview = writePreview(output);
  rmSync(output, { recursive: true });
  writeFileSync(join(root, 'project.config.json'), '{broken');
  expect(runtimeState({ projectPath: root })).toMatchObject({ projectPath: preview.path });
});

it('resolves symlink ancestors and rejects ambiguous preview directories', async () => {
  const project = join(root, 'project'); mkdirSync(project);
  const alias = join(root, 'alias'); symlinkSync(project, alias, 'junction');
  expect(runtimeProjectPaths(join(alias, 'deleted'))[0]).toBe(join(runtimeProjectPaths(project)[0], 'deleted'));
  writePreview(join(project, 'dist/dev/mp-weixin'));
  writePreview(join(project, 'unpackage/dist/dev/mp-weixin'));
  expect(() => runtimeState({ projectPath: project })).toThrow('Multiple');
});

it('compiles once per run, disposes the compiler and preserves the published file on error', async () => {
  writeFileSync(join(root, 'app.json'), '{"pages":[]}');
  const first = await compileRuntime({ projectPath: root });
  const preview = files(root);
  expect(fileURLToPath(first.url)).toBe(preview.html);
  expect(fixture.build).toHaveBeenCalledTimes(1);
  expect(fixture.dispose).toHaveBeenCalledTimes(1);
  expect(existsSync(preview.config)).toBe(false);
  fixture.build.mockRejectedValueOnce(new Error('Invalid WXML'));
  await expect(compileRuntime({ projectPath: root })).rejects.toThrow('Invalid WXML');
  expect(readFileSync(preview.html, 'utf8')).toBe('<html>first</html>');
  fixture.build.mockResolvedValueOnce({ html: '<html>second</html>', pages: [] });
  const second = await compileRuntime({ projectPath: root });
  expect(fileURLToPath(second.url)).toBe(preview.html);
  expect(second.url).not.toBe(first.url);
  expect(readFileSync(preview.html, 'utf8')).toBe('<html>second</html>');
  expect(fixture.dispose).toHaveBeenCalledTimes(3);
});

it('protects a preview owned by an old compiler and replaces it once the compiler exits', async () => {
  writeFileSync(join(root, 'app.json'), '{"pages":[]}');
  const preview = writePreview(root);
  writeFileSync(preview.config, JSON.stringify({ pid: 123, projectPath: preview.path, transport: 'native-messaging' }));
  fixture.compilerAlive = true;
  await expect(compileRuntime({ projectPath: root })).rejects.toThrow('previous mini-program compiler');
  expect(readFileSync(preview.html, 'utf8')).toBe('snapshot');
  fixture.compilerAlive = false;
  await compileRuntime({ projectPath: root });
  expect(existsSync(preview.config)).toBe(false);
  expect(readFileSync(preview.html, 'utf8')).toBe('<html>first</html>');
});
