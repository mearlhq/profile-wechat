# 运行时测试

示例中的 `tabId`、frame ID 和页面路径需替换为当前运行结果。

## 页面状态与 frame

测试 API `window.__wxa_test_api__` 位于运行页的主 frame。用 `page_frames` 找到主 frame，并将其 ID 传给 `page_eval`：

```bash
mearl page_frames --payload '{"tabId":123}'
mearl page_eval --payload '{"tabId":123,"frameId":"<mainFrameId>","expression":"({page: __wxa_test_api__.currentPage(), stack: __wxa_test_api__.pageStack(), data: __wxa_test_api__.pageData(), errors: __wxa_test_api__.errors()})"}'
```

按文字定位或执行业务 frame 内的脚本时，使用 `currentPage().frameName` 匹配 `page_frames` 返回的当前渲染 frame；导航后重新获取。完整快照返回的 `@eN` 可以直接用于跨 frame 的点击和输入。

页面跳转可以通过 UI，也可以在主 frame 调用 `__wxa_test_api__.reLaunch("/pages/detail/index?id=1")`，随后检查当前页面和实际内容。

## 请求与微信 API Mock

在主 frame 中执行：

```javascript
// 接口回包使用 route，不用 mock 覆盖 request。
__wxa_test_api__.route('GET https://example.com/api/items', { body: { items: [] } });

// 微信 API 的固定回包。
__wxa_test_api__.mock('getLocation', { latitude: 31.2, longitude: 121.5 });

// 查看 wx.request 请求记录和命中的路由。
__wxa_test_api__.requests();
```

Mock 作用于当前运行页，整页刷新后失效；保存项目文件触发的刷新也会重置 Mock 和页面内存数据。需要继续验证时重新设置。

未命中路由的请求不会自动共享浏览器 Cookie 或 Mearl 浏览器请求规则。`requests()` 提供请求记录，不包含完整响应 trace。验证时同时检查页面结果和 `errors()`，说明尚未实现的 API 或模拟行为对结论的影响。
