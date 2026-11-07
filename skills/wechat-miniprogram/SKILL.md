---
name: wechat-miniprogram
description: 使用 Mearl 运行和验证本地微信小程序或 uni-app/Taro 的 mp-weixin 产物，检查页面状态并模拟微信 API 与接口回包。普通微信 H5/WebView 模拟不使用此 Skill。
install:
  description: 安装运行环境并注册微信小程序工具
  command: npx @mearl/setup@3.0.0 plugin "$SKILL_DIR"
version: "3.0.0"
---

# 微信小程序

Skill 自带运行脚本，安装时自动准备第三方依赖，首次使用会检查并补齐缺失依赖。需要已连接的 Mearl 浏览器；未注册时执行上面的安装命令。项目路径属于浏览器所在宿主；框架项目先生成 `mp-weixin` 产物，本能力不会构建框架源码。当前参数以 `mearl wxa start --help` 为准。

## 启动

```bash
mearl wxa start /path/to/project
mearl wxa --payload '{"command":"start","input":{"projectPath":"/path/to/mp-weixin","path":"pages/detail/index?id=1"}}'
```

保留返回的 `tabId`、`runtime.projectPath` 和当前页面信息。多个编译产物目录有歧义时，显式指定要运行的目录；`path` 使用项目中已声明的页面。再次启动会复用已有运行实例。

## 操作与诊断

页面操作沿用 Mearl 标准命令。小程序有独立的渲染 frame，使用 `page_snapshot` 的完整快照获取跨 frame 元素引用；导航后重新观察页面。

检查页面数据、页面栈、运行时错误，或需要 Mock 微信 API 与请求时，读取 [运行时测试](./references/testing.md)。以实际 UI、页面数据和错误记录核验结果。登录、支付、硬件能力及真机一致性需要独立验证。

## 停止

```bash
mearl wxa stop /path/to/compiled/project
```

需要结束运行时，使用启动返回的 `runtime.projectPath`。关闭标签页或工具箱不会停止编译监听；停止会保留浏览器标签页。
