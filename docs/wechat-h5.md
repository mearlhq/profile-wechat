# 微信网页模拟

简体中文 | [English](wechat-h5.en.md)

[返回 README](../README.md)

需要已安装 Mearl 3.0.0，并连接配套浏览器扩展。

## 安装与配置

```sh
npx @mearl/setup@3.0.0 profile install mearlhq/profile-wechat
```

也可以在扩展快捷设置的客户端下拉菜单中选择「添加端模拟」。列表为空时，点击「客户端」可直接打开安装弹窗。选择「微信端模拟」或输入 `mearlhq/profile-wechat`，若扩展提示授权，请确认来源。安装会保留当前 Preset。如果 Preset 已定义 `wechat`，菜单继续使用 Preset 选定的实现。

在端模拟菜单中选择 **微信内网页**。开启设备外壳后，点击底部手势条，在 **网页环境** 中选择 **微信内网页** 或 **微信小程序内网页**。切换后会重新加载当前网页。小程序内网页的 UA 会带上 `miniProgram` 标记。

## Agent 调用与能力边界

Agent 可通过 `mearl get_capabilities` 查询当前浏览器的配置 ID，再用 `mearl set_app_profile` 或 MCP 的 `browser_set_app_profile` 选择环境。独立安装时的 ID 是 `wechat` 和 `wechat-mini-program-webview`。

两种环境均提供 iOS 或 Android 的 `MicroMessenger` UA 和 `WeixinJSBridgeReady` 事件，模拟 JS-SDK 初始化及 Wi-Fi 网络类型。`wx.getLocation` 通过浏览器定位获取 WGS84 坐标。JS-SDK 签名校验、登录、支付和小程序 WebView 导航属于真实客户端能力。

## 合并到自定义 Preset

若要保留已有 Preset 的能力，请将以下条目合并到原 Preset 的 `packages` 和 `appProfiles`，或加到继承它的 Preset 中。已有的 `wechat` 别名会改为指向这里选择的实现。

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
