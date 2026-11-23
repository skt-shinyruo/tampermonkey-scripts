# ADR 0012: GM 存储热路径读取统一走「2 秒 TTL + 写入即失效」进程内缓存

状态：accepted

Tampermonkey 的 `GM_getValue` 是同步跨上下文调用，不是内存 Map 读。命中率注入 pass 曾以每行 3 次的频率读昨天 store 与监控列表，auto-refresh 每个 tick 也读功能开关；按 30 行、20 pass/秒估算是 1800 次同步扩展调用/秒。决定：凡在 observer/tick 触发的重复路径上读取的 GM 键，一律走进程内缓存：TTL 统一 2000ms（`STORAGE_READ_CACHE_MS`），本标签任何 `storage.set`/`storage.delete` 立即清空缓存。当前适用：功能开关（`getEnabledSetting`）、监控账户列表、昨天命中率 store。

同标签写入（设置面板、点击开关）即时生效——写入唯一漏斗是 `storage.set`，清缓存挂在漏斗上不可能漏；跨标签写入最多 2 秒后可见，已被接受：本标签的重绘本来就要等下一次 DOM 变更，2 秒陈旧不改变任何单标签内的可观察行为。

## Considered Options

- **每 pass 读一次快照向下传**（拒绝）：把每行 3 次降到每 pass 3 次，但每 pass 仍留同步扩展调用；开关读取也完全没被覆盖。
- **删除 pass 内的开关重查，依赖安装/清理边界**（拒绝）：跨标签关闭将永不生效（而非 ≤2 秒），是删掉一个现存行为的语义回退。
- **不缓存**（拒绝）：热路径上唯一剩下的同步扩展调用就这么留着。

## Consequences

- 稳态注入 pass 的 GM 读取为 0；`steady passes stop reading hit rate and flag storage` 用 harness 的 `getStorageReadKeys` 计数钉住。
- 新键要享受该惯例必须走同一形状：写路径经 `storage.set` 漏斗自动失效，或在写入处显式清 `featureFlagCache` 类缓存。
- 冷路径（每页数量、筛选恢复、刷新间隔等用户交互触发的读取）不缓存，单次读取成本由交互本身承担。
- 其余部件的 observer 每 tick 仍读各自状态键（sidebar、账号筛选、excluded-origins），尚未纳入本惯例；它们是同一问题类的后续候选，不属于本决策。
