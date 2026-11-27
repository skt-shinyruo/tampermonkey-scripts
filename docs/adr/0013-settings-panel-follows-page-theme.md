# ADR 0013: 设置面板配色以页面实际主题为准，打开期间实时跟随

状态：accepted

设置面板原先是一整块内联样式的浅色 UI，与 Sub2API 页面主题无关，深色页面下会突然闪出白色弹窗。决定：面板配色以**页面实际主题**为唯一来源——Sub2API 特征页读取 `<html>` 的 `dark` class（现有主题模式、Sub2API 原生切换按钮、系统偏好最终都落到这里），非 Sub2API 页面（只能从油猴菜单打开）回退到 `prefers-color-scheme`。面板打开期间监听 `documentElement` 的 `class` 与浏览器的 `change` 事件，主题翻转时按调色板重渲染整块面板。

## Considered Options

- **读 helper 保存的 `theme-mode`**（拒绝）：用户可能直接点 Sub2API 原生主题按钮，或以 `system` 模式运行而浏览器偏好已变化；保存值会与页面实际状态脱节。
- **CSS 变量 + 样式表，翻转只改属性**（拒绝）：面板从未引入样式表，所有配色是 JS 条件内联样式；CSS 变量会新增第二种样式机制，还要处理 `Object.assign(style, {'--x': ...})` 在真实浏览器不生效、必须走 `setProperty` 的坑。测试 harness 也没有样式引擎，只能断言 `var()` 字符串，行为证明更弱。
- **只在打开时计算一次**（拒绝）：面板内的「主题模式」单选项本身就会翻转页面主题，不跟随会自相矛盾。

## Consequences

- 主题翻转会重建面板 DOM；`refreshSettingsPanel()` 必须保存并恢复设置列表滚动容器的 `scrollTop`。
- 新增设计令牌时必须同时补齐 `SETTINGS_THEME_PALETTES` 的 light/dark 两套值；遗漏会在深色下表现为浅色残留。
- 面板根节点携带 `data-sub2api-settings-theme="light|dark"`，测试据此断言换肤结果。
