import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AppBuilder, MiniProgram, findRuntimeDir, findSetupFile, bundleSetup } from '@open-wxa/wxa-runner-core';
import { resolveBaseLib, usesIsolatedContext } from '@open-wxa/wxa-runner-extractor';
import type { RuntimeOptions } from './project.js';

const escapeScript = (value: string) => value.replace(/<\/script/gi, '<\\/script');

function staticFiles(root: string, prefix = ''): string[] {
  return readdirSync(join(root, prefix), { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') return [];
    const relative = prefix + entry.name;
    return entry.isDirectory() ? staticFiles(root, relative + '/') : entry.isFile() ? [relative] : [];
  });
}

export async function createSnapshotBuilder(options: RuntimeOptions) {
  const project = new MiniProgram(options.projectPath);
  const builder = new AppBuilder(project);
  const baseLib = resolveBaseLib();
  const runtimeDir = findRuntimeDir();
  const setupFile = options.setup === false ? null : options.setup || findSetupFile(project.projectPath);
  const adapter = readFileSync(new URL('./browser.js', import.meta.url), 'utf8');
  const libraries: Record<string, { data: string; type: string }> = {};
  for (const [prefix, directory] of [['/__baselib__/', baseLib.dir], ['/__wxa__/runtime/', runtimeDir]]) {
    for (const file of readdirSync(directory)) {
      if (file.endsWith('.js')) libraries[prefix + file] = { data: readFileSync(join(directory, file)).toString('base64'), type: 'text/javascript' };
    }
  }
  return {
    project, builder, setupFile,
    async build(revision: string) {
      const build = await builder.build();
      if (Object.keys(project.readAppJson().plugins || {}).length) throw new Error('WeChat plugins are not supported by the local browser host yet');
      if (build.workerModules.length) throw new Error('Mini-program Workers are not supported by the local browser host yet');
      const resources = { ...libraries };
      let bytes = 0;
      for (const file of staticFiles(project.root)) {
        if (/\.(?:js|wxml|wxs|wxss|map|ts|less|s[ac]ss)$/.test(file)) continue;
        const data = readFileSync(join(project.root, file));
        bytes += data.length;
        if (bytes > 48 * 1024 * 1024) throw new Error('Project static assets exceed the 48 MiB browser snapshot limit');
        resources['/' + file] = { data: data.toString('base64'), type: '' };
      }
      const modules = Object.fromEntries(build.modules.map(id => [id, builder.getModuleScript(id)]));
      // Setup is compiled as a classic IIFE so no module URL or HTTP origin is required.
      let setup: string | null = null;
      if (setupFile) {
        const { transform } = await import('esbuild');
        setup = (await transform(await bundleSetup(setupFile), { format: 'iife', globalName: '__mearlWxaSetup', target: 'chrome141' })).code;
      }
      const setupEnv = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => key.startsWith('WXA_') && value !== undefined));
      const snapshot = { revision, build: { ...build, plugins: [] }, modules, resources, setup, setupEnv, appid: project.appid, baseLib: { version: baseLib.version, hasWorker: false }, isolated: usesIsolatedContext(baseLib.version) };
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="mearl-wxa-revision" content="${revision}"><title>Mearl · WeChat</title></head><body><div id="wxa-root"></div><script>window.__mearlWxaSnapshot=${escapeScript(JSON.stringify(snapshot))};\n${escapeScript(adapter)}</script></body></html>`;
      return { html, pages: build.pages };
    },
  };
}
