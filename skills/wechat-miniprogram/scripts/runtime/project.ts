import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve, dirname, basename } from 'node:path';

const PROJECT_OUTPUTS = ['', 'dist/dev/mp-weixin', 'unpackage/dist/dev/mp-weixin', 'dist'];

/** Runtime identity survives deleted output directories and resolves existing symlink ancestors. */
function projectIdentity(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('projectPath is required');
  let directory = resolve(value);
  const missing: string[] = [];
  for (;;) {
    try { return resolve(realpathSync(directory), ...missing); }
    catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '') || dirname(directory) === directory) throw error;
      missing.unshift(basename(directory));
      directory = dirname(directory);
    }
  }
}

export function runtimeProjectPaths(value: unknown): string[] {
  const directory = projectIdentity(value);
  return [...new Set(PROJECT_OUTPUTS.map(part => projectIdentity(join(directory, part))))];
}

export interface RuntimeOptions {
  projectPath: string;
  watch: boolean;
  setup?: string | false;
}

export function findProjectDirectory(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) throw new Error('projectPath is required');
  const directory = realpathSync(resolve(value));
  const matches = PROJECT_OUTPUTS.map(part => join(directory, part)).filter(candidate => {
    const configFile = join(candidate, 'project.config.json');
    const config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {};
    return existsSync(resolve(candidate, config.miniprogramRoot || '', 'app.json'));
  });
  if (matches.includes(directory)) return directory;
  if (matches.length === 1) return realpathSync(matches[0]);
  if (matches.length > 1) throw new Error('Multiple mini-program outputs found; select the output directory explicitly');
  return null;
}

export function projectDirectory(value: unknown): string {
  const directory = findProjectDirectory(value);
  if (directory) return directory;
  throw new Error('No app.json found. Build the project for mp-weixin, then select its output directory.');
}

export function detectProject(value: unknown) {
  const directory = findProjectDirectory(value);
  if (directory) return { kind: 'mini-program', projectPath: directory };
  if (existsSync(join(resolve(String(value)), 'project.config.json'))) projectDirectory(value);
  return { kind: 'web' };
}

export function runtimeOptions(input: Record<string, unknown>): RuntimeOptions {
  for (const key of Object.keys(input)) {
    if (!['projectPath', 'watch', 'setup'].includes(key)) throw new Error(`Unknown runtime option: ${key}`);
  }
  if (input.watch !== undefined && typeof input.watch !== 'boolean') throw new Error('watch must be a boolean');
  const projectPath = projectDirectory(input.projectPath);
  if (input.setup !== undefined && input.setup !== false && (typeof input.setup !== 'string' || !input.setup.trim())) {
    throw new Error('setup must be a file path or false');
  }
  const setup = typeof input.setup === 'string'
    ? realpathSync(isAbsolute(input.setup) ? input.setup : resolve(projectPath, input.setup))
    : input.setup;
  return { projectPath, watch: input.watch !== false, ...(setup === undefined ? {} : { setup }) };
}

export function compilerError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(/(?:-86|bad cpu type|exec format error)/i.test(message)
    ? 'The selected WeChat compiler cannot run on this CPU. On Apple Silicon, wxa-runner can reuse compatible compilers from WeChat DevTools. Set WXA_DEVTOOLS_PATH if DevTools is installed outside the default location, or set WXA_WCC and WXA_WCSC to an executable pair. The npm fallback for macOS uses Intel binaries and requires Rosetta.\n' + message
    : message);
}
