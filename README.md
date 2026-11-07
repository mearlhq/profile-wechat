# WeChat Profile for Mearl

English | [简体中文](README.zh-CN.md)

This repository ships a WeChat H5 App profile and the `wechat-miniprogram` Skill for Mearl 3.0.0.

## Install

Start with a working Mearl 3.0.0 installation and its connected browser extension.

```sh
git clone https://github.com/mearlhq/wechat-profile.git
cd wechat-profile
npx @mearl/setup@3.0.0 preset apply ./preset.json
```

Select **WeChat** in the App simulation menu. The `wechat` profile supplies an iOS or Android `MicroMessenger` user agent and the `WeixinJSBridgeReady` event. It simulates JS-SDK initialization and a Wi-Fi network type. `wx.getLocation` obtains WGS84 coordinates via browser geolocation. JS-SDK signatures are unchecked, and login, payment, and mini-program WebView navigation are outside the profile's scope.

Applying a Preset selects it for the installation. To keep an existing Preset, add the `wechat-profile` browser package and map an App alias to `wechat-profile/h5` in that Preset.

### Run a local mini-program

Register the Skill on the browser host and allow file URL access for the matching Mearl extension. The Skill opens native mini-program projects and compiled `mp-weixin` output as a self-contained `file://` preview. The extension handles requests and build status.

```sh
npx @mearl/setup@3.0.0 plugin "$PWD/skills/wechat-miniprogram"
mearl wxa start /path/to/project
```

See the [mini-program guide](docs/wechat-miniprogram.md) for compiler requirements, request mocks, and browser permissions.

## Develop

Use Node.js 22.23.4 or later and pnpm 10.34.5.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm check:generated
```

Source is licensed under [Apache-2.0](LICENSE). Bundled dependencies retain their own licenses. See the [third-party notices](skills/wechat-miniprogram/assets/runtime/THIRD_PARTY_NOTICES.md).
