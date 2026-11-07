# Mearl 微信端模拟

[English](README.md) | 简体中文

本仓库提供适配 Mearl 3.0.0 的微信 H5 App 档案和 `wechat-miniprogram` Skill。

## 安装

需要已安装 Mearl 3.0.0，并连接配套浏览器扩展。

```sh
git clone https://github.com/mearlhq/wechat-profile.git
cd wechat-profile
npx @mearl/setup@3.0.0 preset apply ./preset.json
```

在 App 模拟菜单中选择 **微信**。`wechat` 档案提供 iOS 或 Android 的 `MicroMessenger` UA 和 `WeixinJSBridgeReady` 事件，模拟 JS-SDK 初始化及 Wi-Fi 网络类型。`wx.getLocation` 通过浏览器定位获取 WGS84 坐标。档案不校验 JS-SDK 签名，登录、支付和小程序 WebView 导航也不在能力范围内。

应用 Preset 会为当前安装选用该 Preset。若要沿用已有 Preset，请在其中添加 `wechat-profile` 浏览器能力包，并将 App 别名映射到 `wechat-profile/h5`。

### 运行本地小程序

在浏览器所在机器上注册 Skill，并为配套的 Mearl 扩展允许文件网址访问。Skill 将原生小程序和已编译的 `mp-weixin` 产物作为自包含的 `file://` 预览打开，由扩展转发请求并查询编译状态。

```sh
npx @mearl/setup@3.0.0 plugin "$PWD/skills/wechat-miniprogram"
mearl wxa start /path/to/project
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
