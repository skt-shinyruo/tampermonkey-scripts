# Tampermonkey Scripts Glossary

Shared domain terminology for Tampermonkey userscripts across A6API and Sub2API.

## A6API Market Search

**渠道 (Channel)**:
A model distribution endpoint identified by a unique ID and display name.
_Avoid_: 接口, 节点

**渠道名称 (Channel Name)**:
The primary display title of a channel (e.g. "能能CC-2").
_Avoid_: 标题, 标签

**渠道说明 (Channel Description)**:
Descriptive text or feature tags explaining the channel's capabilities, routing, or performance characteristics (e.g. "CC Kiro 保智商 保缓存").
_Avoid_: 备注, 描述信息

**我的渠道 (Owned Channel)**:
Channels owned and administered by the current merchant account on the management page.
_Avoid_: 自有渠道, 本地渠道

**自定义渠道 (Custom Channel)**:
User-defined channel IDs and aliases saved locally for quick market lookups.
_Avoid_: 外部渠道, 手动渠道

**快捷渠道抽屉 (Quick Channel Drawer)**:
A collapsible floating side panel injected into the market page for quick one-click channel searches.
_Avoid_: 侧边栏, 弹窗, 浮窗

**清空搜索 (Clear Search)**:
An action that clears the current channel search query and un-highlights active cards while preserving other user filter criteria.
_Avoid_: 清空选择, 搜索复位

**重置市场 (Reset Market)**:
An action that fully restores the market page to its pristine default state, selecting all brands, all models, default recommendation sort, and an empty search query.
_Avoid_: 全部重置, 恢复出厂

**渠道备注 (Channel Remark)**:
A user-defined text note attached to any channel (owned or custom), persisted independently by channel ID.
_Avoid_: 渠道说明, 渠道别名, 标签

**渠道反选 (Channel Deselection)**:
An interaction pattern where clicking an already-active channel card clears the search input and dispatches a search event without reloading the page.
_Avoid_: 重复点击, 取消选择

**自选渠道高亮 (Quick Channel Highlighting)**:
Visual emphasis applied to market rows whose channel matches an owned or custom channel when browsing or searching by model/description, suppressed when searching a specific channel.
_Avoid_: 列表发光, 收藏标记

**市场内容宽度 (Market Content Width)**:
A configurable layout width setting that overrides the maximum width limit of the market container, expanding the table and filters to avoid horizontal truncation.
_Avoid_: 屏幕拉伸, 界面缩放

**市场页模型列表 (Market Model List)**:
The paginated table of model supply rows on the market page (`#/market`), browsable by brand, model, and category.
_Avoid_: 模型类别页, 模型详情页, 模型列表

**多维快速筛选联动 (Multi-dimensional Filter Alignment)**:
An automated reset action triggered upon selecting a quick channel in the drawer, restoring brand ("全部品牌"), model series ("全部"), and sort ("综合推荐 (默认)") to their pristine states to eliminate 0-result false positives caused by lingering filter constraints.
_Avoid_: 强制全量重置, 筛选清空

**自动加载更多 (Auto Load More)**:
A configurable automation setting that observes the pagination button and triggers next-page loading via viewport intersection as the user scrolls.
_Avoid_: 无限滚动, 自动翻页, 连点展开

**抽屉贴边触点 (Drawer Edge Touchpoint)**:
An in-place edge anchor located at `top: 10vh` that serves as the unified, identical click target for both expanding and collapsing the quick channel drawer without coordinate or dimension shift.
_Avoid_: 悬浮球, 展开叉号, 侧边拉手

**筛选平铺流 (Filter Tag Flow)**:
An unconstrained multi-line tag presentation mode that allows brand and model filters to wrap naturally in wide layouts instead of hiding behind "+N" collapse buttons.
_Avoid_: 标签换行, 展开标签

**紧凑指标排版 (Compact Metric Layout)**:
A table column allocation strategy that fixes metric columns to compact widths while assigning expanded space to descriptive and identity columns, avoiding rubber-band empty gaps.
_Avoid_: 列宽压缩, 紧凑表格


**渠道信息同步 (Channel Info Sync)**:
An operation that queries the marketplace search API to retrieve the latest channel name and channel description for owned and custom channels, updating local storage while preserving channel remarks.
_Avoid_: 渠道全量克隆, 渠道覆盖, 列表重建

**被动同步 (Passive Channel Refresh)**:
A throttled background update triggered upon selecting a channel in the drawer, refreshing stale metadata against the public API without disrupting the search interaction.
_Avoid_: 实时轮询, 动态拉取, 页面拦截

**同步渠道按钮 (Sync Channels Toolbar Action)**:
A manual drawer toolbar action that initiates an on-demand batch refresh of all owned and custom channels with concurrent throttling and transient status feedback.
_Avoid_: 强制同步, 刷新所有

**下架渠道标识 (Delisted Channel Badge)**:
A visual indicator (`[已下架]`) displayed on a quick channel card when upstream data confirms the channel is inactive or unlisted, preserving the card and user remarks while clearly signaling its offline state.
_Avoid_: 渠道删除, 报错提示, 异常卡片
## Sub2API Helper

**站点排除 (Site Exclusion)**:
A configuration that completely blacklists a specific origin from running Sub2API Helper, enforcing total silence and zero host DOM/network manipulation.
_Avoid_: 网页禁用, 路径拉黑, 插件关闭

**彻底静默 (Total Silence)**:
An execution state where the userscript terminates early on an excluded origin, preventing DOM injection, observer registration, and fetch/XHR rewriting.
_Avoid_: 隐蔽模式, 静音运行, 后台禁用

**扩展菜单兜底 (Extension Menu Fallback)**:
An interaction pattern utilizing Tampermonkey's native popup menu (`GM_registerMenuCommand`) to toggle exclusion and open settings when in-page DOM controls are suppressed or host pages conflict.
_Avoid_: 快捷键唤醒, 隐蔽触点, 右键菜单

**排除名单 (Excluded Origins)**:
A globally persisted set of origin URLs where Sub2API Helper is deactivated, manageable across all sites via the settings panel.
_Avoid_: 域名黑名单, 屏蔽网站列表

## Userscript Repository Infrastructure

**用户脚本分发标准 (Userscript Distribution Standard)**:
A unified repository architecture where every script module maintains a dedicated directory with source code, build script, tests, and CI workflow, delivering versioned release artifacts to the `build` branch and GitHub Pages.
_Avoid_: 散装发布, 手工合并, 跨目录散落

**自动更新元数据 (Auto-Update Metadata)**:
The `@updateURL` and `@downloadURL` userscript headers injected during CI build that bind an installed script to its remote distribution URL for automatic background checking and silent updates.
_Avoid_: 强制更新链接, 校验头, 外部引用

**发布产物分支 (Distribution Branch)**:
The isolated branch (`build`) dedicated to hosting compiled, release-ready `*.user.js` files, decoupling build output from the `main` source branch and feeding GitHub Pages deployments.
_Avoid_: release 分支, 产物仓库, 静态分支
