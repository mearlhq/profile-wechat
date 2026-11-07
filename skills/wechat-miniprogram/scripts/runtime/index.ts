import { pathToFileURL } from 'node:url';
import { existsSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isAlive, keyedConfigFile, keyedDir, readRecord, removeRecordIfPid } from '@mearl/daemon-core';
import { runtimeOptions, runtimeProjectPaths, compilerError } from './project.js';
import { acquireLock } from './lock.js';

const LIFECYCLE_TIMEOUT_MS = 45_000;

function previewFiles(projectPath: string) {
  const configFile = keyedConfigFile('wechat', projectPath);
  const snapshotFile = join(keyedDir('plugin-previews'), 'wxa', basename(configFile, '.json') + '.html');
  return { configFile, snapshotFile, projectPath };
}

function registeredPreview(projectPath: unknown) {
  const [direct, ...outputs] = runtimeProjectPaths(projectPath).map(previewFiles);
  if (existsSync(direct.snapshotFile) || readRecord(direct.configFile)?.projectPath === direct.projectPath) return direct;
  const matches = outputs.filter(output => existsSync(output.snapshotFile) || readRecord(output.configFile)?.projectPath === output.projectPath);
  if (matches.length > 1) throw new Error('Multiple mini-program previews found; select the output directory explicitly');
  return matches[0] ?? direct;
}

function checkPreviousCompiler({ configFile, projectPath }: ReturnType<typeof previewFiles>) {
  const record = readRecord(configFile);
  if (record?.projectPath !== projectPath || record.transport !== 'native-messaging') return;
  // A compiler from an older installation can still write to this preview path.
  if (isAlive(record.pid)) throw new Error('A previous mini-program compiler still owns this preview. Stop it from the previous installation before continuing.');
  removeRecordIfPid(configFile, record.pid);
}

export async function compileRuntime(input: Record<string, unknown>) {
  const options = runtimeOptions(input);
  const preview = previewFiles(options.projectPath);
  const { configFile, snapshotFile } = preview;
  const release = await acquireLock(`${configFile}.lifecycle.lock`, LIFECYCLE_TIMEOUT_MS, 'the mini-program preview');
  const revision = randomUUID();
  const temporary = `${snapshotFile}.${revision}`;
  try {
    checkPreviousCompiler(preview);
    const { createSnapshotBuilder } = await import('./snapshot.js');
    const compiler = await createSnapshotBuilder(options);
    try {
      const { html, pages } = await compiler.build();
      const bytes = Buffer.byteLength(html);
      if (bytes > 96 * 1024 * 1024) throw new Error('Mini-program snapshot exceeds the browser size limit');
      mkdirSync(dirname(snapshotFile), { recursive: true, mode: 0o700 });
      writeFileSync(temporary, html, { mode: 0o600 });
      renameSync(temporary, snapshotFile);
      const url = pathToFileURL(snapshotFile);
      url.searchParams.set('revision', revision);
      return { url: url.href, projectPath: options.projectPath, bytes, pages };
    } finally {
      compiler.builder.dispose();
    }
  } catch (error) {
    throw compilerError(error);
  } finally {
    try { rmSync(temporary, { force: true }); } finally { release(); }
  }
}

export function runtimeState(input: Record<string, unknown>) {
  const { snapshotFile, projectPath } = registeredPreview(input.projectPath);
  if (!existsSync(snapshotFile)) throw new Error('Mini-program preview is unavailable. Run the project again to generate it.');
  return { url: pathToFileURL(snapshotFile).href, projectPath };
}
