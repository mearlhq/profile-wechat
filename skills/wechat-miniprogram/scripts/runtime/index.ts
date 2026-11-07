import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createDaemon, keyedConfigFile, keyedDir, keyedLogFile, readRecord, removeRecordIfPid,
  tailFile, writeRecord, type DaemonRecord,
} from '@mearl/daemon-core';
import { runtimeOptions, runtimeProjectPaths, compilerError, type RuntimeOptions } from './project.js';
import { networkTransfers } from './network.js';
import { acquireLock } from './lock.js';

const READY_TIMEOUT_MS = 30_000;
const LIFECYCLE_TIMEOUT_MS = 45_000;

export { compilerError, projectDirectory, runtimeOptions } from './project.js';

export interface RuntimeRecord extends DaemonRecord {
  transport: 'native-messaging';
  url?: string;
  projectPath: string;
  options: RuntimeOptions;
  revision?: string;
  bytes?: number;
  pages?: string[];
  buildError?: string;
}

function manager(projectPath: string, options?: RuntimeOptions) {
  const configFile = keyedConfigFile('wechat', projectPath);
  const logFile = keyedLogFile('wechat', projectPath);
  const snapshotFile = join(keyedDir('plugin-previews'), 'wxa', basename(configFile, '.json') + '.html');
  const daemon = createDaemon({
    name: 'WeChat mini-program compiler',
    scriptPath: fileURLToPath(new URL('./runtime.mjs', import.meta.url)),
    configFile, logFile, readyTimeoutMs: READY_TIMEOUT_MS,
    ...(options ? { foregroundArgs: [JSON.stringify(options)] } : {}),
    startingRecord: (pid, startedAt) => ({ pid, startedAt, transport: 'native-messaging', projectPath, ...(options ? { options } : {}) }),
  });
  return { daemon, configFile, logFile, snapshotFile };
}

function registeredRuntime(projectPath: unknown) {
  const paths = runtimeProjectPaths(projectPath);
  const registered = paths.flatMap(path => {
    const runtime = manager(path);
    return readRecord(runtime.configFile)?.projectPath === path ? [{ ...runtime, projectPath: path }] : [];
  });
  const direct = registered.find(runtime => runtime.projectPath === paths[0]);
  if (direct) return direct;
  if (registered.length > 1) throw new Error('Multiple mini-program runtimes found; select the output directory explicitly');
  return registered[0] ?? { ...manager(paths[0]), projectPath: paths[0] };
}

export async function startRuntime(input: Record<string, unknown>) {
  const options = runtimeOptions(input);
  const { daemon, configFile, logFile, snapshotFile } = manager(options.projectPath, options);
  const release = await acquireLock(`${configFile}.lifecycle.lock`, LIFECYCLE_TIMEOUT_MS, 'the mini-program compiler');
  try {
    let previous = daemon.running() as RuntimeRecord | null;
    if (previous && (previous.transport !== 'native-messaging' || JSON.stringify(previous.options) !== JSON.stringify(options))) {
      throw new Error('This project is running with different runtime options. Stop it before restarting.');
    }
    if (previous?.url && fileURLToPath(previous.url) !== snapshotFile) {
      await daemon.stop();
      previous = null;
    }
    const deadline = Date.now() + READY_TIMEOUT_MS;
    await daemon.start();
    let record = daemon.running() as RuntimeRecord | null;
    // A detached child may still be compiling if its original caller exited.
    while (record?.daemonState === 'starting' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
      record = daemon.running() as RuntimeRecord | null;
    }
    if (!record?.revision || !record.url || record.daemonState === 'starting') throw new Error(`Mini-program compilation failed.\n${tailFile(logFile, 15)}\nLog: ${logFile}`);
    if (record.buildError) throw new Error(record.buildError);
    return { ...record, reused: Boolean(previous), logFile };
  } finally {
    release();
  }
}

export function runtimeState(input: Record<string, unknown>) {
  const record = registeredRuntime(input.projectPath).daemon.running() as RuntimeRecord | null;
  if (!record?.revision || record.transport !== 'native-messaging') throw new Error('Mini-program compiler is stopped. Enable WeChat again to start it.');
  return record;
}

export async function stopRuntime(input: Record<string, unknown>) {
  const { daemon, configFile, snapshotFile, projectPath } = registeredRuntime(input.projectPath);
  const release = await acquireLock(`${configFile}.lifecycle.lock`, LIFECYCLE_TIMEOUT_MS, 'the mini-program compiler');
  try {
    await daemon.stop();
    if (daemon.running()) throw new Error('Mini-program compiler is still stopping');
    rmSync(snapshotFile, { force: true });
    rmSync(configFile.replace(/\.json$/, '.html'), { force: true });
    return { stopped: true, projectPath, previewUrl: pathToFileURL(snapshotFile).href };
  } finally {
    release();
  }
}

/** Compilation and file watching use no listening network socket. */
export async function serveRuntime(input: Record<string, unknown>) {
  const options = runtimeOptions(input);
  const { configFile, snapshotFile } = manager(options.projectPath);
  const { createSnapshotBuilder } = await import('./snapshot.js');
  const compiler = await createSnapshotBuilder(options);
  mkdirSync(dirname(snapshotFile), { recursive: true, mode: 0o700 });
  let record: RuntimeRecord = { pid: process.pid, startedAt: new Date().toISOString(), transport: 'native-messaging', projectPath: options.projectPath, options };
  const publish = async () => {
    const revision = randomUUID();
    const { html, pages } = await compiler.build(revision);
    if (Buffer.byteLength(html) > 96 * 1024 * 1024) throw new Error('Mini-program snapshot exceeds the browser size limit');
    const temporary = snapshotFile + '.' + process.pid;
    writeFileSync(temporary, html, { mode: 0o600 });
    renameSync(temporary, snapshotFile);
    const url = pathToFileURL(snapshotFile);
    url.searchParams.set('project', options.projectPath);
    url.searchParams.set('source', pathToFileURL(options.projectPath.replace(/[/\\]$/, '') + '/').href);
    record = { ...record, url: url.href, revision, bytes: Buffer.byteLength(html), pages, buildError: undefined };
    const current = readRecord(configFile);
    if (current && current.pid !== process.pid) throw new Error('Another compiler process owns this project');
    writeRecord(configFile, record);
  };
  try { await publish(); } catch (error) { compiler.builder.dispose(); throw compilerError(error); }
  const sweep = () => { void networkTransfers.cleanupExpired().catch(error => console.error('Network staging cleanup:', error)); };
  sweep();
  const idle = setInterval(sweep, 60_000);
  let watcher: import('chokidar').FSWatcher | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain = Promise.resolve();
  let closing = false;
  if (options.watch) {
    const { watch } = await import('chokidar');
    watcher = watch([compiler.project.root, ...(compiler.setupFile ? [compiler.setupFile] : [])], { ignoreInitial: true, ignored: /(?:^|[/\\])(?:node_modules|\.git)(?:[/\\]|$)/, awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 } });
    watcher.on('all', (_event, file) => {
      compiler.builder.invalidate([relative(compiler.project.root, file).replaceAll('\\', '/')]);
      clearTimeout(timer);
      timer = setTimeout(() => {
        chain = chain.then(async () => {
          if (closing) return;
          try { await publish(); } catch (error) {
            record = { ...record, buildError: compilerError(error).message };
            writeRecord(configFile, record);
          }
        });
      }, 150);
    });
  }
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(idle);
    clearTimeout(timer);
    await watcher?.close();
    await chain;
    compiler.builder.dispose();
    rmSync(snapshotFile, { force: true });
    removeRecordIfPid(configFile, process.pid);
  };
  process.once('SIGTERM', () => void close());
  process.once('SIGINT', () => void close());
}
