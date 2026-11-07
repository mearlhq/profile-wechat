(async () => {
  const host = window.mearl;
  const context = await host.ready();
  const byId = id => document.getElementById(id);
  const labels = {
    zh: {
      intro: '在浏览器中运行本地微信小程序', 'directory-label': '项目或编译产物目录', browse: '选择',
      'page-label': '启动页面（可选）', hint: 'uni-app / Taro 项目请先编译为微信小程序。',
      start: '运行小程序', 'running-label': '正在运行', inspect: '检查状态', stop: '停止',
      'details-label': '页面数据与错误', boundary: '本地模拟环境。登录、支付及设备能力需要 Mock 或独立验证。',
      pending: '正在处理…', ready: '已打开小程序', stopped: '已停止运行服务', healthy: '未发现运行时错误', errors: '存在运行时错误，请展开查看',
    },
    en: {
      intro: 'Run a local WeChat mini-program in your browser', 'directory-label': 'Project or compiled output directory', browse: 'Browse',
      'page-label': 'Initial page (optional)', hint: 'Build uni-app / Taro projects for mp-weixin first.',
      start: 'Run mini-program', 'running-label': 'Running', inspect: 'Inspect', stop: 'Stop',
      'details-label': 'Page data and errors', boundary: 'Local simulation. Login, payment and device features require mocks or separate verification.',
      pending: 'Working…', ready: 'Mini-program opened', stopped: 'Runtime stopped', healthy: 'No runtime errors detected', errors: 'Runtime errors detected; expand details',
    },
  };
  let copy;
  let running;
  let busy = false;
  const renderLocale = locale => {
    copy = labels[String(locale).startsWith('zh') ? 'zh' : 'en'];
    document.documentElement.lang = String(locale).startsWith('zh') ? 'zh-CN' : 'en';
    for (const [id, text] of Object.entries(copy)) if (byId(id)) byId(id).textContent = text;
    if (running) renderState(running);
  };
  const renderState = result => {
    byId('running').hidden = false;
    byId('current').textContent = result.currentPage?.path || '—';
    byId('health').textContent = result.healthy ? copy.healthy : copy.errors;
    byId('health').dataset.error = String(!result.healthy);
    byId('state').textContent = JSON.stringify({ data: result.data, errors: result.errors }, null, 2);
  };
  const perform = async action => {
    if (busy) return;
    busy = true;
    document.querySelectorAll('button').forEach(button => { button.disabled = true; });
    byId('status').textContent = copy.pending;
    byId('status').dataset.error = 'false';
    try { await action(); }
    catch (error) {
      byId('status').textContent = error.handledByHost ? '' : error.message;
      byId('status').dataset.error = 'true';
    } finally {
      busy = false;
      document.querySelectorAll('button').forEach(button => { button.disabled = false; });
    }
  };
  const start = async (command, input) => {
    const task = await host.invoke('host.task.start', { command, input, executionTimeoutMs: 600_000 });
    running = await host.waitTask(task.taskId);
    renderState(running);
    byId('status').textContent = copy.ready;
  };
  byId('browse').onclick = () => perform(async () => {
    const directory = await host.invoke('host.directory.select');
    if (directory) byId('directory').value = directory;
    byId('status').textContent = '';
  });
  byId('launch').onsubmit = event => {
    event.preventDefault();
    void perform(() => start('start', {
      projectPath: byId('directory').value.trim(),
      ...(byId('page').value.trim() ? { path: byId('page').value.trim() } : {}),
    }));
  };
  byId('inspect').onclick = () => perform(async () => {
    running = { ...running, ...await host.invoke('status', { tabId: running.tabId }) };
    renderState(running);
    byId('status').textContent = '';
  });
  byId('stop').onclick = () => perform(async () => {
    await host.invoke('stop', { projectPath: running.runtime.projectPath });
    running = undefined;
    byId('running').hidden = true;
    byId('status').textContent = copy.stopped;
  });
  renderLocale(context.locale);
  host.onContextChange(next => renderLocale(next.locale));
})().catch(error => { document.getElementById('status').textContent = error.message; });
