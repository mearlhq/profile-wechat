import { mkdirSync, writeFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppBuilder, MiniProgram, findRuntimeDir } from '@open-wxa/wxa-runner-core';
import { resolveBaseLib } from '@open-wxa/wxa-runner-extractor';
import { compilerError } from './project.js';

/** Validate shipped dependencies using a disposable project, without a daemon or browser. */
export async function checkRuntime() {
  const baseLib = resolveBaseLib();
  for (const file of readdirSync(baseLib.dir).filter(file => file.endsWith('.js'))) readFileSync(join(baseLib.dir, file));
  findRuntimeDir();
  const directory = mkdtempSync(join(tmpdir(), 'mearl-wechat-check-'));
  let builder: AppBuilder | undefined;
  try {
    mkdirSync(join(directory, 'pages/index'), { recursive: true });
    for (const [file, content] of Object.entries({
      'app.json': JSON.stringify({ pages: ['pages/index/index'] }), 'app.js': 'App({})',
      'pages/index/index.js': 'Page({})', 'pages/index/index.wxml': '<view>ready</view>', 'pages/index/index.wxss': 'view{color:#333}',
    })) writeFileSync(join(directory, file), content);
    builder = new AppBuilder(new MiniProgram(directory));
    await builder.build();
    return { ready: true, baseLibVersion: baseLib.version, nodeVersion: process.versions.node };
  } catch (error) {
    throw compilerError(error);
  } finally {
    builder?.dispose();
    rmSync(directory, { recursive: true, force: true });
  }
}
