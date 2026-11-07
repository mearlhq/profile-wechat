import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ directory: '', build: vi.fn(), invalidate: vi.fn(), dispose: vi.fn(), watcher: null as any }));
vi.mock('@mearl/daemon-core', async importOriginal => ({
  ...await importOriginal<typeof import('@mearl/daemon-core')>(),
  keyedConfigFile: () => join(fixture.directory, 'test.json'), keyedLogFile: () => join(fixture.directory, 'test.log'),
  keyedDir: (name: string) => join(fixture.directory, name),
}));
vi.mock('../../wechat-miniprogram/scripts/runtime/snapshot.js', () => ({ createSnapshotBuilder: async () => ({ project: { root: fixture.directory }, setupFile: null, builder: { invalidate: fixture.invalidate, dispose: fixture.dispose }, build: fixture.build }) }));
vi.mock('chokidar', () => ({ watch: () => fixture.watcher }));
import { serveRuntime } from '../../wechat-miniprogram/scripts/runtime/index.js';

let close: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  fixture.directory = mkdtempSync(join(tmpdir(), 'mearl-wxa-watch-'));
  writeFileSync(join(fixture.directory, 'app.json'), '{"pages":[]}');
  fixture.watcher = new EventEmitter();
  fixture.watcher.close = vi.fn(async () => {});
  fixture.build.mockReset().mockResolvedValue({ html: '<html>working</html>', pages: ['pages/index/index'] });
  const once = process.once.bind(process);
  vi.spyOn(process, 'once').mockImplementation(((event: string, listener: () => void) => {
    if (event === 'SIGTERM') { close = listener; return process; }
    if (event === 'SIGINT') return process;
    return once(event, listener);
  }) as typeof process.once);
});
afterEach(async () => {
  close?.();
  await vi.advanceTimersByTimeAsync(1);
  vi.restoreAllMocks();
  vi.useRealTimers();
  rmSync(fixture.directory, { recursive: true, force: true });
  close = undefined;
});
it('publishes a local file, preserves the working build on error, and recovers on the next save', async () => {
  await serveRuntime({ projectPath: fixture.directory });
  const record = () => JSON.parse(readFileSync(join(fixture.directory, 'test.json'), 'utf8'));
  const initial = record();
  expect(initial.url).toMatch(/^file:/);
  expect(initial.url).not.toContain('localhost');
  fixture.build.mockRejectedValueOnce(new Error('Invalid WXML'));
  fixture.watcher.emit('all', 'change', join(fixture.directory, 'pages/index/index.wxml'));
  await vi.advanceTimersByTimeAsync(200);
  expect(record()).toMatchObject({ revision: initial.revision, buildError: 'Invalid WXML' });
  expect(readFileSync(fileURLToPath(initial.url), 'utf8')).toBe('<html>working</html>');
  fixture.build.mockResolvedValue({ html: '<html>recovered</html>', pages: ['pages/index/index'] });
  fixture.watcher.emit('all', 'change', join(fixture.directory, 'pages/index/index.wxml'));
  await vi.advanceTimersByTimeAsync(200);
  expect(record().revision).not.toBe(initial.revision);
  expect(record().buildError).toBeUndefined();
  close?.();
  await vi.advanceTimersByTimeAsync(1);
  expect(existsSync(fileURLToPath(initial.url))).toBe(false);
  expect(existsSync(join(fixture.directory, 'test.json'))).toBe(false);
});
