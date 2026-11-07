import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compilerError, projectDirectory, runtimeOptions, detectProject } from '../../wechat-miniprogram/scripts/runtime/project.js';

const directories: string[] = [];
function directory() {
  const value = realpathSync(mkdtempSync(join(tmpdir(), 'mearl-wechat-')));
  directories.push(value);
  return value;
}
function app(root: string, relative = '') {
  const target = join(root, relative);
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'app.json'), JSON.stringify({ pages: ['pages/index/index'] }));
  return target;
}
afterEach(() => directories.splice(0).forEach(value => rmSync(value, { recursive: true, force: true })));

describe('mini-program project selection', () => {
  it('distinguishes web folders from mini-programs without treating malformed mini-programs as web', () => {
    const root = directory();
    writeFileSync(join(root, 'index.html'), '<h1>Web page</h1>');
    expect(detectProject(root)).toEqual({ kind: 'web' });
    writeFileSync(join(root, 'project.config.json'), '{}');
    expect(() => detectProject(root)).toThrow('Build the project');
    app(root);
    expect(detectProject(root)).toEqual({ kind: 'mini-program', projectPath: root });
  });
  it('uses miniprogramRoot for native projects', () => {
    const root = directory();
    app(root, 'miniprogram');
    writeFileSync(join(root, 'project.config.json'), JSON.stringify({ miniprogramRoot: 'miniprogram' }));
    expect(projectDirectory(root)).toBe(root);
  });
  it('detects framework output but rejects ambiguous candidates', () => {
    const root = directory();
    const output = app(root, 'dist/dev/mp-weixin');
    expect(projectDirectory(root)).toBe(output);
    app(root, 'unpackage/dist/dev/mp-weixin');
    expect(() => projectDirectory(root)).toThrow('Multiple');
    expect(projectDirectory(output)).toBe(output);
  });
  it('rejects unbuilt projects and unknown or incorrectly typed options', () => {
    const root = directory();
    expect(() => projectDirectory(root)).toThrow('Build the project');
    app(root);
    expect(() => runtimeOptions({ projectPath: root, realLogin: true })).toThrow('Unknown');
    expect(() => runtimeOptions({ projectPath: root, watch: 'false' })).toThrow('Unknown runtime option: watch');
    expect(() => runtimeOptions({ projectPath: root, setup: true })).toThrow('setup');
    expect(runtimeOptions({ projectPath: root, setup: false })).toEqual({ projectPath: root, setup: false });
  });
  it('explains compiler architecture failures without treating them as ready', () => {
    expect(compilerError(new Error('spawn Unknown system error -86')).message).toContain('Apple Silicon');
    expect(compilerError(new Error('Invalid WXML')).message).toBe('Invalid WXML');
  });
});
