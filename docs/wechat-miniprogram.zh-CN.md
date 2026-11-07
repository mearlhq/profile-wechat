# 微信小程序运行环境

[English](./wechat-miniprogram.md) | 简体中文

`wechat-miniprogram` Skill 使用 wxa-runner 0.13.0 运行原生小程序与已编译的 `mp-weixin` 产物，自带运行脚本和浏览器资源。原有微信 H5/WebView 档案可以独立使用。

## 安装

通过 Mearl 的 Skill 安装器安装。安装钩子自动准备第三方依赖及基础库，再用临时项目验证编译器，通过后才注册。首次使用也会自动补齐缺失的依赖和运行资源，无需全局安装 CLI 或配置 PATH。

依赖及可执行运行资源按内容存放在 `~/.mearl/wechat-runtime/` 缓存中，CLI 和工具箱共用同一流程。并发安装串行，失败可重试。注销 Skill 后保留缓存供复用。系统编译器兼容性与浏览器文件权限要求见下文。

## 本地开发

在仓库根目录操作，使用 Node.js >= 22.23.4 和 pnpm 10.34.5：

```bash
pnpm install --frozen-lockfile
pnpm build
npx @mearl/setup@3.0.0 plugin "$PWD/skills/wechat-miniprogram"
mearl wxa start /path/to/project
```

运行源码位于 Skill 的 `scripts/`。根目录构建在 Skill 内生成自包含的运行脚本和浏览器资源。使用 `pnpm check:generated` 检查生成结果。

在工具箱的“微信小程序”中选择项目目录，或运行 `mearl wxa start <项目路径>`。微信 H5 使用独立的 App 档案。

通过 `device` 选择机型，`orientation` 选择横竖屏。再次启动同一项目并传入机型时，复用编译结果和原标签页。可用 `path` 指定要打开的页面。

```bash
mearl wxa --payload '{"command":"start","input":{"projectPath":"/path/to/project","device":"pixel-11","orientation":"landscape"}}'
```

小程序运行页复用 Mearl 设备配置与系统栏组件。机型影响浏览器视口以及 `wx.getSystemInfo` 返回的尺寸、像素比、型号和系统信息。页面操作、截图和测试 API 使用现有浏览器命令。

uni-app 和 Taro 项目请先执行框架的微信小程序构建。启动器会识别 `dist/dev/mp-weixin`、
`unpackage/dist/dev/mp-weixin` 和 `dist`，但不会执行项目的构建脚本。存在多个候选时，显式选择产物目录。

### CLI 选项

```bash
mearl wxa --payload '{"command":"start","input":{"projectPath":"/path/to/mp-weixin","path":"pages/detail/index?id=1","watch":true}}'
```

`projectPath` 指定项目或编译产物目录；可选 `path` 必须是已声明的页面。`watch` 默认开启。
`setup` 可以是相对解析后项目目录的脚本路径、绝对路径，或用于禁用自动发现的 `false`。
项目的 `wxa.setup.js` 可以声明每次启动时应用的 Mock；通过浏览器测试 API 设置的 Mock 在整页刷新后重置。
修改运行选项前先停止已有实例。

启动结果包含 `runtime.projectPath`、`tabId`、当前页面、页面栈、页面数据、错误及 `healthy`。
浏览器启动失败时编译进程可能仍在运行，可以再次启动复用，或使用运行项目路径停止。

### 运行行为

运行时不启动 HTTP 服务，也不监听网络端口。每个规范化项目目录复用一个编译进程，向
`~/.mearl/plugin-previews/wxa/` 写入自包含 HTML 运行页，由浏览器通过 `file://` 打开。编译后的模板、模块、静态资源和基础库通过页内虚拟资源映射加载。Skill 通过 Mearl 页面运行时转发网络请求并查询编译状态。运行页可使用扩展或纯 CDP。

保存项目文件后会重新编译并刷新原标签页，保留当前页面路径与参数；页面内存数据和 API Mock 重置，
小程序浏览器存储保留。编译错误会叠加显示在上次成功的页面上，修复后自动恢复。
关闭页面不停止编译进程；使用 `mearl wxa stop <runtime.projectPath>` 关闭监听、删除生成的 HTML，
保留浏览器标签页。启动时先编译，编译失败不会被报告为启动成功。
状态查询和停止操作使用已登记的运行实例标识，删除 `app.json`、项目配置或编译产物目录后仍可执行。


## 环境要求与能力边界

- 安装后的 Skill 脚本需要 Node.js >= 20.18.0。
- 浏览器与运行进程需要共享本地文件系统。使用扩展时，需要允许文件 URL 访问、授予文件 URL 宿主权限，并启用用户脚本。
- wxa-runner 依次查找显式指定的 `WXA_WCC` 和 `WXA_WCSC`、已安装的微信开发者工具，以及 npm 随包编译器。开发者工具不在默认位置时可设置 `WXA_DEVTOOLS_PATH`。npm 随包的 macOS 编译器只有 Intel 版本，在 Apple Silicon 上需要 Rosetta。也可复用开发者工具里的兼容编译器或显式指定可执行的编译器对。见[上游编译器配置](https://open-wxa.github.io/wxa-runner/cli#环境变量)。
- 不负责从 TypeScript 或框架组件编译源代码。输入应为原生小程序代码或框架编译产物。
- 登录、支付和硬件能力是模拟行为。启动器不获取开发者凭据，也不提供真机、上传或发布能力。
- `wx.request` 通过插件页面运行时和 Node fetch 转发，不会自动共享浏览器 Cookie 和请求规则。
  使用运行器 setup 文件，或通过 `page_eval` 调用测试 API。
- 网络请求体和响应体各自默认支持 128 MiB。在 Native Host 的运行环境中设置
  `MEARL_WECHAT_NETWORK_MAX_BYTES` 可调整到 256 KiB–2 GiB。上传不超过 128 KiB 且响应不超过
  256 KiB 时只需一次桥接调用；大数据按上传 128 KiB、下载 256 KiB 分块传输。
  Native 进程将数据暂存到 `~/.mearl/wechat-network/` 的私有文件，
  控制传输内存占用。响应下载到磁盘后才交给页面，不提供实时 SSE 或增量网络事件。
  取消会请求释放暂存数据。导航或关闭标签页后，未完成清理的传输在闲置五分钟后过期，由编译进程或下一次传输回收。
  HTTP 转发超时为 120 秒，小程序自身设置的更短请求超时仍然生效。
- 输入框使用 `page_snapshot` 新返回的跨 frame 元素引用。页面状态在运行器主 frame 中读取；
  点击操作需要定位当前页面的渲染 frame。
- 仍受上游运行环境和编译器兼容范围限制。分发前请阅读
  [wxa-runner 功能与限制](https://open-wxa.github.io/wxa-runner/features)及
  [第三方声明](../skills/wechat-miniprogram/assets/runtime/THIRD_PARTY_NOTICES.md)。
- 此浏览器宿主暂不支持小程序插件、Worker、外部 `web-view`、自定义请求头的 WebSocket 代理，
  以及 Service Worker 网络镜像。项目静态资源
  总计限制为 48 MiB，生成的 HTML 限制为 96 MiB。文件 API 的字节保存在浏览器内存中，刷新会重置。
