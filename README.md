# Mearl 微信端模拟

简体中文 | [English](README.en.md)

在 Mearl 中模拟微信网页环境，或运行本地微信小程序，供 Agent 调试与验证。

本仓库提供两项可独立安装的能力：

- **微信网页模拟**：为 H5 页面提供微信或小程序 WebView 的 User-Agent 和基础 JSBridge。
- **本地小程序运行**：通过 `wechat-miniprogram` Skill 预览原生小程序或 uni-app / Taro 的 `mp-weixin` 产物，检查页面并 Mock 接口。

## 微信网页模拟

先安装并连接 [Mearl](https://github.com/mearlhq/mearl)。本仓库适配 Mearl 3.0.0。

```sh
npx @mearl/setup@3.0.0 profile install mearlhq/profile-wechat
```

也可以在扩展快捷设置中选择「客户端 → 添加端模拟」，搜索「微信端模拟」安装。

安装后，在端模拟菜单中选择 **微信内网页**。开启设备外壳时，点击底部手势条，可在「网页环境」中选择 **微信内网页** 或 **微信小程序内网页**。切换会重新加载当前页面。

两种环境都模拟 JS-SDK 初始化和 Wi-Fi 网络类型，定位使用浏览器权限；小程序内网页额外带有 `miniProgram` UA 标记。这里不校验 JS-SDK 签名，也不提供真实登录、支付或小程序导航。

安装会保留当前 Preset；若它已定义 `wechat`，仍使用原实现。Agent 调用和自定义 Preset 配置见[微信网页模拟指南](docs/wechat-h5.md)。

## 本地小程序

在浏览器所在机器上安装 Skill；使用 Mearl 扩展时，允许文件网址访问。无需先安装上面的网页模拟能力。

```sh
npx @mearl/setup@3.0.0 plugin install https://github.com/mearlhq/profile-wechat --skill wechat-miniprogram --yes
mearl wxa run /path/to/project
```

也可以在 Mearl 的「微信小程序」工具箱中选择项目目录。uni-app / Taro 项目需要先构建为 `mp-weixin`，再选择编译产物。

预览以本地 `file://` 页面打开，可使用 Mearl 检查页面、截图和操作元素。修改后再次运行同一命令会更新原标签页。登录、支付和硬件能力为模拟行为，不提供真机调试、上传或发布。

编译器、浏览器权限、设备配置和运行限制见[小程序指南](docs/wechat-miniprogram.md)；页面状态检查与请求 Mock 见[运行时测试](skills/wechat-miniprogram/references/testing.md)。

## 源码开发

使用 Node.js ≥ 22.23.4 和 pnpm 10.34.5。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm check:generated
```

网页模拟配置位于 `capabilities/profile-wechat/`，小程序 Skill 的源码和资源位于 `skills/wechat-miniprogram/`。修改后构建，并用 `check:generated` 检查随包资源是否同步。

## 许可证

源码采用 [Apache-2.0](LICENSE)，随附依赖保留各自的许可证。见[第三方声明](skills/wechat-miniprogram/assets/runtime/THIRD_PARTY_NOTICES.md)。
