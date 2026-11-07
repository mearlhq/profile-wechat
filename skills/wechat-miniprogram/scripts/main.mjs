import { createCommands } from './commands.mjs';
import { registerPreviewRuntime } from './pageRuntime.mjs';
export { pageRuntime } from './pageRuntime.mjs';
export { setup } from './bootstrap.mjs';

export const name = 'wxa';
export const description = '运行、操作和诊断本地微信小程序';
export const toolbox = {
  version: 1, title: '微信小程序', description: '运行本地小程序，检查页面状态与错误', icon: 'smartphone',
  locales: { en: { title: 'WeChat Mini Program', description: 'Run local mini-programs and inspect page state and errors' } },
  page: { type: 'sandbox', entry: 'assets/toolbox/index.html', commands: ['start', 'stop', 'status'] },
  order: 85,
};

export default function register(app) {
  const commands = createCommands(app);
  registerPreviewRuntime(app, commands);
  app.command('start <projectPath>', commands.start, '启动本地小程序或 mp-weixin 编译产物');
  app.command('stop <projectPath>', commands.stop, '停止项目编译监听，清理运行文件，保留浏览器标签页');
  app.toolboxCommand('status', commands.status, '读取工具箱当前项目的页面数据和运行时错误');
}
