# WeChat Profile for Mearl

[简体中文](README.md) | English

Emulate WeChat web environments or run local mini-programs in Mearl for Agent-driven debugging and verification.

This repository provides two independently installable capabilities:

- **Web emulation**: WeChat or mini-program WebView user agents and a basic JSBridge for H5 pages.
- **Local mini-programs**: the `wechat-miniprogram` Skill previews native projects or uni-app / Taro `mp-weixin` output, with page inspection and request mocks.

## WeChat web emulation

Install and connect [Mearl](https://github.com/mearlhq/mearl) first. This repository targets Mearl 3.0.0.

```sh
npx @mearl/setup@3.0.0 profile install mearlhq/profile-wechat
```

Alternatively, open **App → Add App emulation** in the extension's quick settings and select **WeChat emulation**.

Select **WeChat web page** in the App emulation menu. With the device shell enabled, click the bottom gesture bar and choose **WeChat web page** or **WeChat mini-program web page** under **Web page environment**. Switching reloads the page.

Both environments simulate JS-SDK initialization and a Wi-Fi network type, and use browser permissions for location. The mini-program WebView also adds the `miniProgram` UA marker. JS-SDK signatures are unchecked; real login, payment and mini-program navigation are unavailable.

Installation preserves the active Preset. If it already defines `wechat`, its implementation remains active. See the [web emulation guide](docs/wechat-h5.en.md) for Agent commands and custom Preset configuration.

## Local mini-programs

Install the Skill on the browser host. When using the Mearl extension, allow file URL access. Web emulation above is not a prerequisite.

```sh
npx @mearl/setup@3.0.0 plugin install https://github.com/mearlhq/profile-wechat --skill wechat-miniprogram --yes
mearl wxa run /path/to/project
```

You can also select a project in Mearl's **WeChat Mini Program** toolbox. Build uni-app / Taro projects to `mp-weixin` first, then select the compiled output.

The preview opens as a local `file://` page. Use Mearl to inspect it, take screenshots and interact with elements. Run the same command after changes to update the original tab. Login, payment and hardware behavior are simulated; real-device debugging, upload and publishing are unavailable.

See the [mini-program guide](docs/wechat-miniprogram.en.md) for compilers, browser permissions, device settings and limitations, and [runtime testing (Chinese)](skills/wechat-miniprogram/references/testing.md) for page state inspection and request mocks.

## Source development

Use Node.js ≥ 22.23.4 and pnpm 10.34.5.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm check:generated
```

Web emulation lives in `capabilities/profile-wechat/`; mini-program Skill sources and assets live in `skills/wechat-miniprogram/`. Build after changes and use `check:generated` to verify bundled resources are in sync.

## License

Source is licensed under [Apache-2.0](LICENSE). Bundled dependencies retain their own licenses. See the [third-party notices](skills/wechat-miniprogram/assets/runtime/THIRD_PARTY_NOTICES.md).
