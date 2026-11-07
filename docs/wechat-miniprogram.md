# WeChat mini-program runtime

English | [简体中文](./wechat-miniprogram.zh-CN.md)

The `wechat-miniprogram` Skill runs native mini-program projects and compiled `mp-weixin` output using wxa-runner 0.12.3. It includes its runtime scripts and browser assets. The [WeChat H5 profile](../README.md) can be installed separately.

## Installation

Install the Skill through Mearl's Skill installer. The installation hook automatically prepares third-party dependencies and the base library, then validates the compiler with a disposable project before registration. First use repairs missing dependencies or runtime resources automatically. No global CLI installation or PATH configuration is required.

Dependencies and executable runtime resources are cached under `~/.mearl/wechat-runtime/`, keyed by their bundled contents. CLI, toolbox and directory-page simulation share preparation. Concurrent installations are serialized, failed installs can be retried, and caches remain available after unregistering the Skill. OS compiler compatibility and browser file permissions still apply below.

## Development

From the repository root, with Node.js >= 22.23.4 and pnpm 10.34.5:

```bash
pnpm install --frozen-lockfile
pnpm build
npx @mearl/setup@3.0.0 plugin "$PWD/skills/wechat-miniprogram"
mearl wxa start /path/to/project
```

Runtime sources are under the Skill's `scripts/`; the root build generates self-contained runtime and browser bundles inside the Skill. `pnpm check:generated` verifies those resources.

Open **WeChat Mini Program** in the Mearl toolbox to select a local directory.
You can also open a local directory as `file:///.../project/` in Chrome, then enable **WeChat**
in Mearl's existing app simulation control. The current tab becomes the mini-program; disabling
WeChat returns to the directory. Allow file URL access for the extension when using directory pages.
WeChat automatically uses H5 simulation for ordinary pages and folders without mini-program
artifacts. A directory containing `app.json` or a recognized compiled output starts the mini-program
runtime; malformed mini-program projects report their error instead of falling back to H5.
Without the optional Skill, directory pages retain ordinary H5 simulation; an installed Skill prepares a missing runtime automatically.
The current mode appears beside the device controls. The model picker remains available in both
modes. For mini-programs it updates screen size, pixel ratio, safe areas, model and system information
through the runner, including `wx.getSystemInfo`. Mini-programs use the same frameless device viewport
as H5 app simulation. System bars, Dynamic Island/notch appearance and iPhone Duo side-bar layouts
reuse Mearl's shared H5 device configuration and renderer. Duo content, navigation, menu bounds and
window width avoid the system side bar. The title, back button and menu capsule use WeChat mini-program
navigation. Phone borders and the runner toolbar are hidden. Native tab-bar navigation remains functional. Orientation
and fit controls use Mearl's shared device emulation. Adaptive presets fill the browser viewport.
Model changes refresh the same tab while preserving its page path and query; they reuse the
existing compilation. Mini-program mode currently has no phone-shell toggle.
The Skill exposes only `start` and `stop` publicly, because they manage compilation and local
processes. Interaction, screenshots and runtime API calls use Mearl's existing browser commands.
Toolbox status queries are private UI operations.
For uni-app and Taro, run the framework's mp-weixin build first. The launcher detects
`dist/dev/mp-weixin`, `unpackage/dist/dev/mp-weixin` and `dist`, but never runs project build
scripts. Select the output directory explicitly when multiple candidates exist.

### CLI options

```bash
mearl wxa --payload '{"command":"start","input":{"projectPath":"/path/to/mp-weixin","path":"pages/detail/index?id=1","watch":true}}'
```

`projectPath` selects the project or compiled output. Optional `path` must name a declared page.
`watch` defaults to `true`. `setup` accepts a script path relative to the resolved project directory,
an absolute path, or `false` to disable setup discovery. A project's `wxa.setup.js` can declare mocks
that are applied on every launch, while mocks set through the browser test API reset on refresh.
Stop a running project before changing its runtime options.

Startup returns `runtime.projectPath`, `tabId`, the current page, page stack, page data, errors and
`healthy`. Browser startup failure can leave the compiler running; retry to reuse it or stop it using
the runtime project path.

### Runtime behavior

The runtime uses no HTTP server or listening network port. One compiler process per canonical
project directory writes a self-contained HTML runtime into `~/.mearl/wechat/`, opened through
`file://`. Compiled templates, modules, static assets and the base library are loaded from its
virtual resource map. An isolated extension bridge forwards network requests and checks compile
status through Native Messaging. Page code has no extension APIs.

Saving a project file recompiles the runtime and refreshes the same tab. The current page path
and query survive refresh; in-memory page data and API mocks reset. Browser mini-program storage
persists. Compilation errors appear over the last working page and recover after a successful build.
Closing a page does not stop its compiler. Use `mearl wxa stop <runtime.projectPath>` to stop the
watcher and remove the generated HTML; the browser tab remains open. Startup compiles before
publishing readiness, so compilation failure is not reported as a successful launch.
State queries and stopping use the registered runtime identity, so they remain available after
`app.json`, project configuration or the output directory has been removed.


## Requirements and boundaries

- The installed runtime requires Node.js >= 20.18.0.
- Browser and runtime must share the local filesystem. Enable extension file URL access and
  grant file URL host access. Remote browser hosts need a runtime on their own filesystem.
- WeChat compilers must execute on the host. The bundled macOS binaries are Intel binaries;
  Apple Silicon needs Rosetta or executable compilers selected through `WXA_WCC` and `WXA_WCSC`.
  The runtime does not install system components. Compiler environment variables must be present
  on the process starting the runtime.
- Original source is not compiled from TypeScript or framework components. Provide native
  mini-program code or framework build output.
- Login, payment and hardware behavior are simulated. The launcher does not obtain developer
  credentials or provide real-device, upload or publishing capabilities.
- `wx.request` uses the Native Messaging bridge and Node fetch. Browser cookies and browser request rules are not
  automatically shared. Use runner setup files or the test API through `page_eval`.
- Network bodies default to 128 MiB per request and per response. Set
  `MEARL_WECHAT_NETWORK_MAX_BYTES` on the Native Host environment to change this limit
  (256 KiB–2 GiB). Uploads up to 128 KiB with responses up to 256 KiB use one bridge call;
  larger bodies use 128 KiB upload chunks and 256 KiB download chunks.
  Native workers spool bodies to private files in `~/.mearl/wechat-network/`, with bounded
  transport memory. Responses become available after downloading to disk; this does not provide
  real-time SSE or incremental network events. Cancellation, navigation and tab closure release
  staging data; abandoned transfers expire after five minutes of inactivity. The compiler sweeps
  expired data every minute and new transfers also sweep it. HTTP forwarding times out after
  120 seconds; the mini-program's own shorter request timeout still applies.
- Fresh element refs from `page_snapshot` address inputs across frames. Page state inspection
  always executes in the runner's main frame; click operations resolve the current page frame.
- The upstream runtime and compiler compatibility boundaries still apply. Read
  [wxa-runner's supported features](https://open-wxa.github.io/wxa-runner/features) and
  [third-party notices](../skills/wechat-miniprogram/assets/runtime/THIRD_PARTY_NOTICES.md) before distribution.
- This browser host currently rejects mini-program plugins and Workers. External `web-view`,
  custom-header WebSocket proxying and Service Worker network mirroring are unavailable.
  Static assets are limited to 48 MiB per
  project, and the generated HTML to 96 MiB. File API bytes live in browser memory and reset on refresh.
