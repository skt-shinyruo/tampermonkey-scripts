# A6API Tampermonkey Scripts

Tampermonkey userscript suite enhancing A6API channel management and market exploration.

## Language

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
