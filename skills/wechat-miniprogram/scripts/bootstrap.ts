import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findExecutable, keyedConfigFile, npmExecEnvironment, prependNodePath, runCommand, type CommandRunner } from '@mearl/daemon-core';
import { acquireLock } from './runtime/lock.js';
import { projectDirectory } from './runtime/project.js';

export { detectProject } from './runtime/project.js';

function execute(entry: string, command: string, input: Record<string, unknown>, signal?: AbortSignal, timeoutMs = 135_000): Promise<any> {
  const body = JSON.stringify(input);
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [entry, command, '--stdin'], {
      encoding: 'utf8', timeout: timeoutMs, maxBuffer: 512 * 1024, signal, windowsHide: true, env: prependNodePath(),
    }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message, { cause: error }));
      else {
        try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Invalid mini-program runtime response')); }
      }
    });
    child.stdin!.on('error', () => {});
    child.stdin!.end(body);
  });
}

/** Source snapshots carry all runtime resources; only third-party dependencies are installed. */
export function createRuntimeInstaller(options: { skillRoot?: string; cacheRoot?: string; runner?: CommandRunner } = {}) {
  const skillRoot = options.skillRoot ?? fileURLToPath(new URL('../', import.meta.url));
  const assets = join(skillRoot, 'assets/runtime');
  const dependencies: Record<string, string> = JSON.parse(readFileSync(join(assets, 'dependencies.json'), 'utf8'));
  const files = new Map(['runtime.mjs', 'browser.js'].map(name => [name, readFileSync(join(assets, name))]));
  const manifest = JSON.stringify({ private: true, type: 'module', dependencies });
  const hash = createHash('sha256').update(manifest);
  for (const bytes of files.values()) hash.update(bytes);
  const key = hash.digest('hex').slice(0, 24);
  const root = options.cacheRoot ?? join(homedir(), '.mearl', 'wechat-runtime');
  const target = join(root, key);
  const entry = join(target, 'runtime.mjs');
  const ready = () => {
    try {
      return [...files].every(([name, bytes]) => readFileSync(join(target, name)).equals(bytes))
        && Object.entries(dependencies).every(([name, version]) => JSON.parse(readFileSync(join(target, 'node_modules', name, 'package.json'), 'utf8')).version === version);
    } catch { return false; }
  };
  const ensure = async ({ check = false, signal, progress }: { check?: boolean; signal?: AbortSignal; progress?: (message: string) => void } = {}) => {
    signal?.throwIfAborted();
    let checked = false;
    if (!ready()) {
      mkdirSync(root, { recursive: true, mode: 0o700 });
      const release = await acquireLock(join(root, `${key}.lock`), 240_000, 'the mini-program dependencies', signal);
      const temporary = join(root, `.install-${key}`);
      try {
        if (!ready()) {
          progress?.('正在准备微信小程序运行依赖…');
          rmSync(temporary, { recursive: true, force: true });
          mkdirSync(temporary, { mode: 0o700 });
          for (const [name, bytes] of files) writeFileSync(join(temporary, name), bytes, { mode: 0o600 });
          writeFileSync(join(temporary, 'package.json'), manifest, { mode: 0o600 });
          const npm = findExecutable('npm', { extraDirectories: [dirname(process.execPath)] });
          if (!npm) throw new Error('Node.js npm is unavailable; mini-program dependencies could not be prepared');
          const result = await (options.runner ?? runCommand)(npm, ['install', '--prefix', temporary, '--no-audit', '--no-fund', '--no-package-lock', '--omit=dev'], {
            capture: true, timeoutMs: 180_000, env: prependNodePath(npmExecEnvironment()),
          });
          signal?.throwIfAborted();
          if (result.code !== 0) throw new Error(`Mini-program dependency installation failed: ${(result.stderr || result.stdout).trim().slice(-2000)}`);
          for (const [name, version] of Object.entries(dependencies)) {
            if (JSON.parse(readFileSync(join(temporary, 'node_modules', name, 'package.json'), 'utf8')).version !== version) throw new Error(`Unexpected dependency version: ${name}`);
          }
          await execute(join(temporary, 'runtime.mjs'), 'check', {}, signal, 45_000);
          checked = true;
          rmSync(target, { recursive: true, force: true });
          renameSync(temporary, target);
        }
      } finally {
        rmSync(temporary, { recursive: true, force: true });
        release();
      }
    }
    if (check && !checked) await execute(entry, 'check', {}, signal, 45_000);
    return entry;
  };
  return { ensure, async run(command: string, input: Record<string, unknown>, signal?: AbortSignal, progress?: (message: string) => void) {
    return execute(await ensure({ signal, progress }), command, input, signal);
  } };
}

let runtime: ReturnType<typeof createRuntimeInstaller> | undefined;
const localRuntime = () => runtime ??= createRuntimeInstaller();
export function setup(context?: { runCommand: CommandRunner }) {
  return (context ? createRuntimeInstaller({ runner: context.runCommand }) : localRuntime()).ensure({ check: true, progress: console.error });
}
export function runtimeCommand(command: string, input: Record<string, unknown>, signal?: AbortSignal, progress?: (message: string) => void) {
  return localRuntime().run(command, input, signal, progress);
}

export async function withPreviewRun<T>(value: unknown, run: (projectPath: string) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const projectPath = projectDirectory(value);
  const lock = keyedConfigFile('wechat', projectPath) + '.run.lock';
  const release = await acquireLock(lock, 240_000, 'the mini-program run', signal);
  try {
    return await run(projectPath);
  } finally {
    release();
  }
}
