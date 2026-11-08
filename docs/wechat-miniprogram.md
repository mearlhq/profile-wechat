# WeChat mini-program runtime

English | [简体中文](./wechat-miniprogram.zh-CN.md)

The `wechat-miniprogram` Skill runs native mini-program projects and compiled `mp-weixin` output using wxa-runner 0.13.0. It includes its runtime scripts and browser assets. WeChat H5 emulation is available separately.

## Installation

Install the Skill through Mearl's Skill installer. The installation hook automatically prepares third-party dependencies and the base library, then validates the compiler with a disposable project before registration. First use repairs missing dependencies or runtime resources automatically. No global CLI installation or PATH configuration is required.

Dependencies and executable runtime resources are cached under `~/.mearl/wechat-runtime/`, keyed by their bundled contents. The CLI and toolbox share preparation. Concurrent installations are serialized, failed installs can be retried, and caches remain available after unregistering the Skill. OS compiler compatibility and browser file permissions still apply below.

## Development

From the repository root, with Node.js >= 22.23.4 and pnpm 10.34.5:

```bash
pnpm install --frozen-lockfile
pnpm build
npx @mearl/setup@3.0.0 plugin "$PWD/skills/wechat-miniprogram"
mearl wxa run /path/to/project
```

The Skill's `scripts/` directory contains the runtime sources. The root build generates self-contained runtime and browser bundles inside the Skill. Run `pnpm check:generated` to verify those resources.

Select a project directory in the **WeChat Mini Program** toolbox, or run `mearl wxa run <project-path>`. WeChat H5 uses a separate App profile.

Set `device` to select a preset and `orientation` to choose portrait or landscape. Running the same project with a device rebuilds the preview in the existing browser tab. Use `path` to select the page to open.

```bash
mearl wxa --payload '{"command":"run","input":{"projectPath":"/path/to/project","device":"pixel-11","orientation":"landscape"}}'
```

The preview uses Mearl device presets and system bar components. The preset controls the browser viewport and the dimensions, pixel ratio, model, and system reported by `wx.getSystemInfo`. Use standard Mearl browser commands for page actions, screenshots, and test API calls.

For uni-app and Taro, run the framework's mp-weixin build first. The launcher detects
`dist/dev/mp-weixin`, `unpackage/dist/dev/mp-weixin` and `dist`, but never runs project build
scripts. Select the output directory explicitly when multiple candidates exist.

### CLI options

```bash
mearl wxa --payload '{"command":"run","input":{"projectPath":"/path/to/mp-weixin","path":"pages/detail/index?id=1"}}'
```

`projectPath` selects the project or compiled output. Optional `path` must name a declared page.
`setup` accepts a script path relative to the resolved project directory,
an absolute path, or `false` to disable setup discovery. A project's `wxa.setup.js` can declare mocks
that are applied on every launch, while mocks set through the browser test API reset on refresh.

The run returns `runtime.projectPath`, `tabId`, the current page, page stack, page data, errors and
`healthy`.

### Runtime behavior

Each run compiles once and writes a self-contained HTML preview to
`~/.mearl/plugin-previews/wxa/`. The browser opens it through `file://`. The Skill uses Mearl page runtimes to forward network requests. The preview supports both the extension and CDP.

Run `mearl wxa run` again after changes to rebuild and update the original tab. The current page path and query carry over by default. Use `path` to open a specific page. In-memory page data and API mocks reset, while browser mini-program storage persists. A failed compile preserves the last working preview.

Close the tab when you finish. Each project keeps one local preview file, which the next successful run replaces.

## Requirements and boundaries

- The installed runtime requires Node.js >= 20.18.0.
- Browser and runtime must share the local filesystem. With the extension, enable file URL access, grant file URL host access, and enable user scripts.
- wxa-runner tries an explicit `WXA_WCC` and `WXA_WCSC` pair, then installed WeChat DevTools, then the npm fallback. Set `WXA_DEVTOOLS_PATH` for a custom DevTools installation. The npm fallback on macOS ships Intel binaries and needs Rosetta on Apple Silicon. Use compatible DevTools compilers or an explicit executable pair for native execution. See the [upstream compiler settings](https://open-wxa.github.io/wxa-runner/cli#环境变量).
- Original source is not compiled from TypeScript or framework components. Provide native
  mini-program code or framework build output.
- Login, payment and hardware behavior are simulated. The launcher does not obtain developer
  credentials or provide real-device, upload or publishing capabilities.
- `wx.request` uses the plugin page runtime and Node fetch. Browser cookies and browser request rules are not
  automatically shared. Use runner setup files or the test API through `page_eval`.
- Network bodies default to 128 MiB per request and per response. Set
  `MEARL_WECHAT_NETWORK_MAX_BYTES` on the Native Host environment to change this limit
  (256 KiB–2 GiB). Uploads up to 128 KiB with responses up to 256 KiB use one bridge call;
  larger bodies use 128 KiB upload chunks and 256 KiB download chunks.
  Native workers spool bodies to private files in `~/.mearl/wechat-network/`, with bounded
  transport memory. Responses become available after downloading to disk; this does not provide
  real-time SSE or incremental network events. Cancellation requests the release of staged data. After navigation or tab closure, abandoned transfers expire after five minutes of inactivity. New transfers clear expired data. HTTP forwarding times out after
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
