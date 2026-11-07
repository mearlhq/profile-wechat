# Mearl 微信端模拟

[English](README.md) | 简体中文

本仓库提供适配 Mearl 3.0.0 的微信 H5 App 档案和 `wechat-miniprogram` Skill。

## 安装

需要已安装 Mearl 3.0.0，并连接配套浏览器扩展。

### 微信 H5

每套安装只有一个生效的 Preset。切换时，旧 Preset 独有的能力会从当前环境移除。如需切换到独立的微信 Preset，执行：

```sh
npx @mearl/setup@3.0.0 preset apply https://raw.githubusercontent.com/mearlhq/wechat-profile/main/preset.json
```

在 App 模拟菜单中选择 **微信**。`wechat` 档案提供 iOS 或 Android 的 `MicroMessenger` UA 和 `WeixinJSBridgeReady` 事件，模拟 JS-SDK 初始化及 Wi-Fi 网络类型。`wx.getLocation` 通过浏览器定位获取 WGS84 坐标。档案不校验 JS-SDK 签名，登录、支付和小程序 WebView 导航也不在能力范围内。

若要保留已有 Preset 的能力，请将以下条目合并到原 Preset 的 `packages` 和 `appProfiles`，或加到继承它的 Preset 中。已有的 `wechat` 别名会改为指向这里选择的实现。

```json
{
  "packages": {
    "wechat-profile": {
      "source": "https://raw.githubusercontent.com/mearlhq/wechat-profile/main/capabilities/wechat-profile/bundle.json",
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
