import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import register from '../../wechat-miniprogram/scripts/main.mjs';
import { createCommands, invokeTestApi, localProjectPath } from '../../wechat-miniprogram/scripts/commands.mjs';

const projects = [];
afterEach(() => {
  vi.unstubAllGlobals(); vi.useRealTimers();
  for (const project of projects.splice(0)) rmSync(project, { recursive: true, force: true });
});

function directory(miniProgram = false) {
  const project = realpathSync(mkdtempSync(join(tmpdir(), 'wechat project ')));
  projects.push(project);
  if (miniProgram) writeFileSync(join(project, 'app.json'), '{"pages":[]}');
  return project;
}

function fixture() {
  const current = 'wxa-webview-1';
  const invoke = vi.fn(async (action, input) => {
    if (action === 'page_frames') return { frames: [
      { isMainFrame: true, frameId: 'main' },
      { frameId: current, name: current },
    ] };
    if (action === 'page_eval') {
      expect(input.frameId).toBe('main');
      expect(input.args).toEqual([]);
      return { result: { currentPage: { path: 'pages/index/index', frameName: current }, data: {}, pageStack: [], errors: [] } };
    }
    if (action === 'tab_open') return { tabId: 123 };
    if (action === 'get_versions') return { extensionId: 'a'.repeat(32) };
    return { action: { success: true } };
  });
  const page = vi.fn();
  const app = { invoke, page, progress: vi.fn() };
  const runtime = vi.fn(async () => ({ transport: 'native-messaging', url: 'file:///home/test/.mearl/wechat/0123456789abcdef.html', projectPath: '/project', pages: ['pages/index/index', 'pages/detail/index'] }));
  return { commands: createCommands(app, runtime, (path, run) => run(path)), invoke, page, runtime };
}

describe('WeChat mini-program commands', () => {
  it('surfaces dependency preparation failures and project errors', async () => {
    const { commands, runtime } = fixture();
    const project = directory(true);
    runtime.mockRejectedValueOnce(new Error('Could not install runtime'));
    await expect(commands.prepare({ projectPath: project })).rejects.toThrow('Could not install runtime');
    writeFileSync(join(project, 'project.config.json'), '{broken');
    await expect(commands.prepare({ projectPath: project })).rejects.toThrow(SyntaxError);
    expect(runtime).toHaveBeenCalledTimes(1);
  });
  it('forwards private network stages, offsets and cancellation to the runtime', async () => {
    const { commands, runtime } = fixture();
    const abort = new AbortController();
    const input = { stage: 'write', transferId: '00000000-0000-4000-8000-000000000001', offset: 262144, body: 'aGVsbG8=' };
    await commands.request(input, { signal: abort.signal });
    expect(runtime).toHaveBeenCalledWith('request', input, abort.signal);
    await commands.request({ stage: 'release', transferId: input.transferId });
    expect(runtime).toHaveBeenLastCalledWith('request', { stage: 'release', transferId: input.transferId }, undefined);
  });
  it('prepares a selected local directory without opening another browser tab', async () => {
    const { commands, invoke, runtime } = fixture();
    const project = directory(true);
    await commands.prepare({ projectPath: pathToFileURL(project + '/').href });
    expect(runtime).toHaveBeenCalledExactlyOnceWith('compile', { projectPath: project }, undefined);
    expect(invoke).not.toHaveBeenCalled();
    expect(() => localProjectPath('file://server/share/')).toThrow('local directory');
  });
  it('identifies an ordinary web folder without preparing the runtime', async () => {
    const { commands, invoke, runtime } = fixture();
    runtime.mockRejectedValue(new Error('Registry offline'));
    expect(await commands.prepare({ projectPath: directory() })).toEqual({ kind: 'web' });
    expect(runtime).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
  it('waits for the runtime hook after a cold document load', async () => {
    vi.useFakeTimers();
    const window = {};
    vi.stubGlobal('window', window);
    vi.stubGlobal('document', { querySelector: () => null });
    const result = invokeTestApi();
    setTimeout(() => { window.__wxa_test_api__ = {
      ready: Promise.resolve(), currentPage: () => null, pageStack: () => [], pageData: () => null, errors: () => [],
    }; }, 10);
    await vi.advanceTimersByTimeAsync(60);
    expect(await result).toEqual({ currentPage: null, pageStack: [], data: null, errors: [] });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('surfaces the runner startup error while waiting for its hook', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { querySelector: () => ({ textContent: 'Invalid WXML' }) });
    await expect(invokeTestApi()).rejects.toThrow('Invalid WXML');
  });
  it('registers commands without starting a process or touching the browser', () => {
    const command = vi.fn();
    const toolboxCommand = vi.fn();
    register({ command, toolboxCommand, runtimeCommand: vi.fn() });
    expect(command.mock.calls.map(([signature]) => signature)).toEqual(['run <projectPath>']);
    expect(toolboxCommand.mock.calls.map(([name]) => name)).not.toContain('demo');
  });
  it('opens a project with encoded page parameters and preserves cancellation', async () => {
    const { commands, invoke, page, runtime } = fixture();
    const signal = new AbortController().signal;
    const result = await commands.run({ projectPath: '/project', path: 'pages/detail/index?id=a%26b' }, { signal });
    expect(runtime).toHaveBeenCalledWith('compile', { projectPath: '/project' }, signal);
    const url = new URL(invoke.mock.calls.find(([action]) => action === 'tab_open')[1].url);
    expect(url.protocol).toBe('file:');
    expect(page).toHaveBeenNthCalledWith(1, 'attach', { tabId: 123, frame: 'main' });
    expect(page).toHaveBeenNthCalledWith(2, 'activation', { enabled: true, frame: 'main', matchPatch: { add: [url.origin === 'null' ? 'file://' + url.pathname : url.origin + url.pathname] } });
    const launch = new URLSearchParams(url.hash.slice(1));
    expect(launch.get('path')).toBe('pages/detail/index');
    expect(launch.get('id')).toBe('a&b');
    expect(result.healthy).toBe(true);
  });
  it('navigates the existing tab to the newly compiled preview and honors the requested page', async () => {
    const { commands, invoke, page, runtime } = fixture();
    runtime.mockResolvedValueOnce({ url: 'file:///preview.html?revision=new', projectPath: '/project', pages: ['pages/detail/index'] });
    const original = invoke.getMockImplementation();
    invoke.mockImplementation((action, input) => action === 'tab_open'
      ? { tabId: 123, reused: true, url: 'file:///preview.html?revision=old#?path=pages%2Findex%2Findex' }
      : original(action, input));
    await commands.run({ projectPath: '/project', path: 'pages/detail/index?id=2' });
    const navigation = invoke.mock.calls.find(([action]) => action === 'page_navigate')[1];
    const url = new URL(navigation.url);
    expect(navigation.tabId).toBe(123);
    expect(url.searchParams.get('revision')).toBe('new');
    expect(Object.fromEntries(new URLSearchParams(url.hash.slice(1)))).toEqual({ path: 'pages/detail/index', id: '2' });
    expect(invoke.mock.invocationCallOrder[invoke.mock.calls.findIndex(([action]) => action === 'page_navigate')]).toBeLessThan(page.mock.invocationCallOrder[0]);
  });
  it('does not hide runtime errors behind healthy status', async () => {
    const { commands, invoke } = fixture();
    invoke.mockImplementation(async action => action === 'page_frames'
      ? { frames: [{ isMainFrame: true, frameId: 'main' }] }
      : { result: { currentPage: null, data: null, pageStack: [], errors: [{ message: 'Unimplemented API' }] } });
    expect((await commands.status({ tabId: 123 })).healthy).toBe(false);
  });
  it('validates mutation inputs before browser calls', async () => {
    const { commands, invoke } = fixture();
    await expect(commands.status({ tabId: 0 })).rejects.toThrow('positive integer');
    await expect(commands.run({ projectPath: '/project', path: 'https://example.com' })).rejects.toThrow('page path');
    await expect(commands.run({ projectPath: '/project', path: 'pages/missing/index' })).rejects.toThrow('not declared');
    await expect(commands.run({ projectPath: '/project', realLogin: true })).rejects.toThrow('Unknown field');
    expect(invoke.mock.calls.every(([action]) => action === 'get_versions')).toBe(true);
  });
});
