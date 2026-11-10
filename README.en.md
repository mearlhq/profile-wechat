# WeChat Profile for Mearl

[简体中文](README.md) | English

This repository ships WeChat H5 emulation and the `wechat-miniprogram` Skill for Mearl 3.0.0.

## Install

Start with a working Mearl 3.0.0 installation and its connected browser extension.

### WeChat H5

```sh
npx @mearl/setup@3.0.0 profile install mearlhq/profile-wechat
```

In the extension's quick settings, open the App selector and choose **Add App emulation**. If the list is empty, click the App button to open the installer. Select **WeChat emulation** or enter `mearlhq/profile-wechat`, then approve the source if prompted. The installation keeps the active Preset. If the Preset already defines `wechat`, the menu continues to use the Preset's implementation.

Select **WeChat web page** in the App emulation menu. With the device shell enabled, click the bottom gesture bar and choose **WeChat web page** or **WeChat mini-program web page** under **Web page environment**. Switching reloads the current page. The mini-program WebView adds the `miniProgram` user-agent marker.

An Agent can use `mearl get_capabilities` to find the two installed IDs, then select one with `mearl set_app_profile` or the MCP tool `browser_set_app_profile`. The standalone IDs are `wechat` and `wechat-mini-program-webview`.

Both environments supply an iOS or Android `MicroMessenger` user agent and the `WeixinJSBridgeReady` event. They simulate JS-SDK initialization and a Wi-Fi network type. `wx.getLocation` obtains WGS84 coordinates via browser geolocation. JS-SDK signatures are unchecked, and login, payment, and mini-program WebView navigation are outside the scope of these environments.

To keep the capabilities of an existing Preset, merge these entries into its `packages` and `appProfiles` sections, or put them in a Preset that extends it. An existing `wechat` alias will point to the implementation selected here.

```json
{
  "packages": {
    "profile-wechat": {
      "source": "https://raw.githubusercontent.com/mearlhq/profile-wechat/main/bundle.json",
      "targets": ["browser"]
    }
  },
  "appProfiles": {
    "wechat": "profile-wechat/h5"
  }
}
```

### Run a local mini-program

Install the Skill on the browser host and allow file URL access for the matching Mearl extension. The Skill opens native mini-program projects and compiled `mp-weixin` output as a self-contained `file://` preview. Skill installation is independent of the selected Preset.

```sh
npx @mearl/setup@3.0.0 plugin install https://github.com/mearlhq/profile-wechat --skill wechat-miniprogram --yes
mearl wxa run /path/to/project
```

See the [mini-program guide](docs/wechat-miniprogram.en.md) for compiler requirements, request mocks, and browser permissions.

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
