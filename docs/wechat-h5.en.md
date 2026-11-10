# WeChat web emulation

[简体中文](wechat-h5.md) | English

[Back to README](../README.en.md)

Requires Mearl 3.0.0 and its connected browser extension.

## Install and configure

```sh
npx @mearl/setup@3.0.0 profile install mearlhq/profile-wechat
```

In the extension's quick settings, open the App selector and choose **Add App emulation**. If the list is empty, click the App button to open the installer. Select **WeChat emulation** or enter `mearlhq/profile-wechat`, then approve the source if prompted. The installation keeps the active Preset. If the Preset already defines `wechat`, the menu continues to use the Preset's implementation.

Select **WeChat web page** in the App emulation menu. With the device shell enabled, click the bottom gesture bar and choose **WeChat web page** or **WeChat mini-program web page** under **Web page environment**. Switching reloads the current page. The mini-program WebView adds the `miniProgram` user-agent marker.

## Agent commands and limitations

An Agent can use `mearl get_capabilities` to find the two installed IDs, then select one with `mearl set_app_profile` or the MCP tool `browser_set_app_profile`. The standalone IDs are `wechat` and `wechat-mini-program-webview`.

Both environments supply an iOS or Android `MicroMessenger` user agent and the `WeixinJSBridgeReady` event. They simulate JS-SDK initialization and a Wi-Fi network type. `wx.getLocation` obtains WGS84 coordinates via browser geolocation. JS-SDK signatures are unchecked, and login, payment, and mini-program WebView navigation are outside the scope of these environments.

## Merge into a custom Preset

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
