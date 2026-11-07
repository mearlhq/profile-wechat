# WeChat Profile for Mearl

English | [简体中文](README.zh-CN.md)

This repository ships a WeChat H5 App profile and the `wechat-miniprogram` Skill for Mearl 3.0.0.

## Install

Start with a working Mearl 3.0.0 installation and its connected browser extension.

### WeChat H5

```sh
npx @mearl/setup@3.0.0 profile install mearlhq/wechat-profile
```

In the extension's quick settings, open the App selector and choose **Add App profiles**. If the list is empty, click the App button to open the installer. Select **WeChat** or enter `mearlhq/wechat-profile`, then approve the source if prompted. The installation keeps the active Preset. If the Preset already defines `wechat`, the menu continues to use the Preset's implementation.

Select **WeChat** in the App simulation menu. The `wechat` profile supplies an iOS or Android `MicroMessenger` user agent and the `WeixinJSBridgeReady` event. It simulates JS-SDK initialization and a Wi-Fi network type. `wx.getLocation` obtains WGS84 coordinates via browser geolocation. JS-SDK signatures are unchecked, and login, payment, and mini-program WebView navigation are outside the profile's scope.

To keep the capabilities of an existing Preset, merge these entries into its `packages` and `appProfiles` sections, or put them in a Preset that extends it. An existing `wechat` alias will point to the implementation selected here.

```json
{
  "packages": {
    "wechat-profile": {
      "source": "https://raw.githubusercontent.com/mearlhq/wechat-profile/main/bundle.json",
      "targets": ["browser"]
    }
  },
  "appProfiles": {
    "wechat": "wechat-profile/h5"
  }
}
```

### Run a local mini-program

Install the Skill on the browser host and allow file URL access for the matching Mearl extension. The Skill opens native mini-program projects and compiled `mp-weixin` output as a self-contained `file://` preview. Skill installation is independent of the selected Preset.

```sh
npx @mearl/setup@3.0.0 plugin install https://github.com/mearlhq/wechat-profile --skill wechat-miniprogram --yes
mearl wxa run /path/to/project
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
