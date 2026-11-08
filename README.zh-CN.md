# Mearl 微信端模拟

[English](README.md) | 简体中文

本仓库提供适配 Mearl 3.0.0 的微信 H5 端模拟和 `wechat-miniprogram` Skill。

## 安装

需要已安装 Mearl 3.0.0，并连接配套浏览器扩展。

### 微信 H5

```sh
npx @mearl/setup@3.0.0 profile install mearlhq/wechat-profile
```

也可以在扩展快捷设置的客户端下拉菜单中选择「添加端模拟」。列表为空时，点击「客户端」可直接打开安装弹窗。选择「微信端模拟」或输入 `mearlhq/wechat-profile`，若扩展提示授权，请确认来源。安装会保留当前 Preset。如果 Preset 已定义 `wechat`，菜单继续使用 Preset 选定的实现。

在端模拟菜单中选择 **微信内网页**。开启设备外壳后，点击底部手势条，在 **网页环境** 中选择 **微信内网页** 或 **微信小程序内网页**。切换后会重新加载当前网页。小程序内网页的 UA 会带上 `miniProgram` 标记。

Agent 可通过 `mearl get_capabilities` 查询当前浏览器的配置 ID，再用 `mearl set_app_profile` 或 MCP 的 `browser_set_app_profile` 选择环境。独立安装时的 ID 是 `wechat` 和 `wechat-mini-program-webview`。

两种环境均提供 iOS 或 Android 的 `MicroMessenger` UA 和 `WeixinJSBridgeReady` 事件，模拟 JS-SDK 初始化及 Wi-Fi 网络类型。`wx.getLocation` 通过浏览器定位获取 WGS84 坐标。JS-SDK 签名校验、登录、支付和小程序 WebView 导航属于真实客户端能力。

若要保留已有 Preset 的能力，请将以下条目合并到原 Preset 的 `packages` 和 `appProfiles`，或加到继承它的 Preset 中。已有的 `wechat` 别名会改为指向这里选择的实现。

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

### 运行本地小程序

在浏览器所在机器上安装 Skill，并为配套的 Mearl 扩展允许文件网址访问。Skill 将原生小程序和已编译的 `mp-weixin` 产物作为自包含的 `file://` 预览打开。安装 Skill 独立于当前选用的 Preset。

```sh
npx @mearl/setup@3.0.0 plugin install https://github.com/mearlhq/wechat-profile --skill wechat-miniprogram --yes
mearl wxa run /path/to/project
```

编译器要求、请求 Mock 和浏览器权限见[小程序指南](docs/wechat-miniprogram.zh-CN.md)。

## 开发

使用 Node.js 22.23.4 或更高版本与 pnpm 10.34.5。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm check:generated
```

源码采用 [Apache-2.0](LICENSE)，随附依赖保留各自的许可证。见[第三方声明](skills/wechat-miniprogram/assets/runtime/THIRD_PARTY_NOTICES.md)。
