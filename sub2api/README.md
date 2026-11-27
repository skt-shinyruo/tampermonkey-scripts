# Sub2API Helper

Sub2API Helper 是一个 Tampermonkey userscript，用来增强 Sub2API 管理端的日常使用体验。脚本会在所有网页中加载，但只会在识别到 Sub2API 管理端页面特征后启用功能。

生成后的安装文件是 `sub2api-helper.user.js`。源码拆分在 `src/parts/` 下，修改源码后由 GitHub Actions 构建最终 userscript，推送到 `build` 分支供 Greasy Fork webhook 同步；`pages.yml` 会把 `build` 分支发布到 GitHub Pages 作为调试入口。

## 功能

- 主题模式：支持深色、浅色、系统三种模式；系统模式会根据浏览器深浅色偏好同步 Sub2API 管理端主题。
- 侧边栏状态记忆：记住侧边栏收起或展开状态，并在同一 Sub2API 站点中恢复。
- 侧边栏宽度设置：按 Sub2API 域名保存默认、紧凑或自定义 px 宽度，并同步扩大主内容区域。
- 使用记录日期范围记忆：记住使用记录页选择的日期范围，并在请求 `/api/v1/usage` 时同步改写日期参数。
- 使用记录粒度记忆：记住使用记录页的粒度选择。
- 使用记录每页数量记忆：记住使用记录页每页显示数量。
- 账号管理每页数量记忆：记住账号管理页每页显示数量，并与使用记录页独立保存。
- 分组管理每页数量记忆：记住分组管理页每页显示数量，并与使用记录页、账号管理页独立保存。
- 用户管理每页数量记忆：记住用户管理页每页显示数量，并与使用记录页、账号管理页、分组管理页独立保存。
- 账号使用记录快捷入口：在账号管理页每个账号行增加使用记录入口，打开管理端使用记录并自动按该账号筛选；自动选中失败时提供重试/关闭提示。
- 账号缓存命中率：在账号管理页的「今日统计」列增加第三行，并排展示今天与昨天的缓存命中率（`缓存读取 / (输入 + 缓存创建 + 缓存读取)`）；悬停或点击按需查询，也可将账号标记为监控账户错峰定时自动获取（数量不限，每个监控账户在间隔窗口内随机错开时刻查询）。该列默认隐藏在列设置中，需要先打开「今日统计」列。
- 使用记录自动刷新：在使用记录页的刷新按钮旁添加自动刷新控制和倒计时。
- 仪表盘日期范围记忆：记住仪表盘日期范围，并在仪表盘趋势请求中同步改写日期参数。
- 仪表盘粒度记忆：记住仪表盘粒度选择。
- 设置面板：在 Tampermonkey 菜单中提供 `Sub2API Helper 设置`，并在已识别的 Sub2API 页面右下角添加 `设置` 小按钮。
- 功能开关：每个功能都有 `全局` 和 `当前页` 两级开关，默认开启。
- 站点排除与彻底静默：针对魔改或冲突的 Sub2API 站点，支持在油猴扩展菜单（`🚫 排除当前网站`）或设置面板状态卡片中一键排除；排除后脚本在该站点彻底静默（零 DOM 注入、零网络拦截、零监听器），并支持在设置面板中集中查看与解禁已排除站点。
## 安装使用

1. 安装 Tampermonkey 或兼容的 userscript 管理器。
2. 从 Greasy Fork 安装 `Sub2API Helper`。
3. Tampermonkey 弹出安装页面后确认安装。
4. 访问 Sub2API 管理端页面。
5. 如需调整功能，点击页面右下角的 `设置` 按钮，或从 Tampermonkey 菜单打开 `Sub2API Helper 设置`。

脚本元数据使用 `@match *://*/*`，但功能启用前会检测当前页面是否符合 Sub2API 管理端特征。非 Sub2API 页面不会注入页面按钮，也不会应用增强逻辑。

## Greasy Fork 发布

Greasy Fork 同步 URL：

```text
https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/sub2api-helper.user.js
```

GitHub Pages 调试地址：

```text
https://skt-shinyruo.github.io/tampermonkey-scripts/sub2api-helper.user.js
```

首次发布：

1. 进入 Greasy Fork 的脚本发布页面。
2. 上传或粘贴首次构建出的 `sub2api-helper.user.js` 内容完成首次创建。
3. 在脚本设置中开启从 URL 同步，URL 填入上面的 Greasy Fork 同步 URL。
4. 在 GitHub 仓库中设置 Greasy Fork webhook。之后每次 push 到 `main`，CI 会构建并推送 `build` 分支，webhook 会触发 Greasy Fork 立即同步。

发布后，用户应从 Greasy Fork 安装脚本。GitHub Pages 地址只作为直接调试入口。

## 开发结构

```text
sub2api/
  README.md
  build-userscript.mjs
  sub2api-helper.user.test.mjs
  src/
    README.md
    parts/
      00-constants-storage.js
      01-date-utils.js
      02-dom-sidebar-selectors.js
      03-settings-ui.js
      04-range-granularity-rewrite.js
      05-auto-refresh.js
      06-usage-table-enhancements.js
      06-account-usage-links.js
      06-account-hit-rate.js
      06-enhancements-watchers.js
```

`sub2api-helper.user.js` 是生成产物，不保留在 `main` 分支。日常开发应修改 `src/parts/` 中的源码分片，再运行构建脚本生成最终 userscript。

## 构建

从仓库根目录运行：

```bash
node sub2api/build-userscript.mjs
```

检查生成文件是否和源码分片一致：

```bash
node sub2api/build-userscript.mjs --check
```

构建 Greasy Fork 同步用的 `build` 分支产物：

```bash
SUB2API_UPDATE_URL="https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/sub2api-helper.user.js" \
SUB2API_DOWNLOAD_URL="https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/sub2api-helper.user.js" \
node sub2api/build-userscript.mjs --output=dist/sub2api-helper.user.js
```

仓库中的 `.github/workflows/sub2api-pages.yml` 会在 push 到 `main` 且修改 `sub2api/**` 时自动运行测试、构建 `dist/sub2api-helper.user.js`，并把最终 userscript 推送到 `build` 分支。`pages.yml` 会在发布 workflow 成功后从 `build` 分支读取当前构建产物并发布到 GitHub Pages。workflow 使用 GitHub Actions 提供的 `GITHUB_REPOSITORY` 自动计算 raw URL，仓库改名后不需要手动改 workflow。

## 验证

运行完整测试：

```bash
node --test sub2api/sub2api-helper.user.test.mjs
```

检查生成后的 userscript 语法：

```bash
node sub2api/build-userscript.mjs
node --check dist/sub2api-helper.user.js
```

检查构建脚本语法：

```bash
node --check sub2api/build-userscript.mjs
```

推荐在提交前同时运行：

```bash
node sub2api/build-userscript.mjs
node sub2api/build-userscript.mjs --check
node --test sub2api/sub2api-helper.user.test.mjs
node --check dist/sub2api-helper.user.js
node --check sub2api/build-userscript.mjs
```

## 注意事项

- 不要在 `main` 分支直接维护 `sub2api-helper.user.js`，最终文件由 CI 构建并发布到 `build` 分支。
- 如果修改了 `src/parts/`，必须运行 `node sub2api/build-userscript.mjs`。
- 测试会先构建临时 userscript，再执行行为验证。

## 回归风险记录

- 使用记录和仪表盘都是 SPA 页面。修复日期范围、粒度、每页数量等状态恢复时，不能只在首次加载时读取控件；从相邻页面切回来时，页面 URL 可能已经变化，但 date picker、select、refresh 按钮还没有重新挂载。恢复逻辑必须等待页面指纹和目标控件出现后再执行。
- 不要用“上一次尝试恢复时的按钮文字”来跳过后续恢复。SPA 重新挂载后，旧 DOM 已经失效，新的 trigger 可能又回到默认值，例如 `/admin/promo-codes` 切回 `/admin/usage` 后重新显示 `近24小时`。
- 请求改写不能只依赖页面控件已经就绪。管理端使用记录页会在 UI 指纹完整前发请求，必须根据当前 pathname 和已保存状态改写 URL 参数。
- `/admin/usage` 需要覆盖真实管理端接口：`/api/v1/admin/usage*`，并同步覆盖页面会触发的管理端 summary/trend 类接口。新增管理端日期接口时，要检查 `ADMIN_DASHBOARD_DATE_RANGE_API_PATHS` 和使用记录改写范围。
- 普通 `/usage` 与 `/admin/usage` 的日期范围、粒度，以及 `/usage`、`/admin/usage`、`/admin/accounts`、`/admin/groups` 与 `/admin/users` 的每页数量必须独立存储和恢复；不要让一个页面的开关或保存值影响其他页面。
- 每页数量的保存必须先确认每页下拉仍处于展开状态；用户管理页的分组、API Key 分组和动态属性筛选项可能是数字，不能仅凭选择窗口内的数字选项就写入每页数量。
- 自动恢复使用 `element.click()` 时，这些非用户点击不能被当成用户正在选择日期，否则第一次打开 picker 被 SPA 切页/挂载吞掉后，后续恢复会被保护窗口挡住。date picker 打开失败也要短间隔重试，不能只点一次后长时间等待。
- 不能只用接口请求参数正确来判断日期范围恢复成功。请求可能已经被改写成保存值，但 UI trigger 仍停在页面默认值；恢复完成必须以最终 trigger 文本匹配保存范围为准，不匹配要继续重试。
- 真实浏览器复测前必须确认当前页面实际运行的 helper 脚本版本。设置面板会显示脚本版本，页面根节点也有 `data-sub2api-helper-version` 便于 DevTools 检查。
- 修改相关逻辑时，至少保留/补充这些回归场景：从优惠码页切回管理端使用记录、date picker 延迟挂载、第一次 apply 后 UI 文本仍是默认值、粒度和每页数量切回后恢复、分组管理页和用户管理页分页条重新挂载后恢复、请求在页面指纹完整前发出、用户手动选择后不被旧保存值覆盖。
- 侧边栏刷新后自动收起问题的根因可能不是 Sub2API 页面默认状态，而是 helper 的 `restoreSavedSidebarState()` 读到旧的 `sidebar-collapsed: true` 后主动调用原生 toggle 的 `element.click()`。DevTools 曾在 `0.22.21` 安装版中捕获到 `HTMLElement.click() -> restoreSavedSidebarState() -> MutationObserver` 调用栈。
- 修复侧边栏状态记忆时，状态识别应优先读取真实底部 toggle 的 `title`：`展开` 表示已收起，`收起` 表示已展开；`sidebar-link-collapsed` class 次之，按钮可见文本只能作为兜底，因为收起态可能仍显示 `收起`。
- `getSidebarToggleButton()` 不能宽泛匹配所有 sidebar 按钮，必须锁定真实收起/展开 toggle，避免把 `渠道管理`、主题按钮或其他导航按钮当成状态来源。用户点击后要延迟读取更新后的 DOM 并保存最新值，展开后必须写入 `sidebar-collapsed: false`。
- `restoreSavedSidebarState()` 必须具备幂等和 in-flight 保护。它会被 `applyPageEnhancements()` 与 `MutationObserver` 多次触发，恢复期间不能在 DOM mutation burst 中反复点击同一个 toggle；用户正在手动切换侧边栏时也不能用旧保存值覆盖用户选择。
- 侧边栏回归测试至少覆盖：保存值 `true`/`false` 各只恢复点击一次、用户从收起切到展开会保存 `false`、用户从展开切到收起会保存 `true`、非 toggle 的 sidebar 按钮不参与识别、不同 origin 的 `sidebar-collapsed` 相互隔离。
- 账号缓存命中率直接调用 `/api/v1/admin/dashboard/trend?account_id=&granularity=day`，一次请求取回今天与昨天的按日汇总；不要退回 `/admin/usage/stats`，那个接口一次只能覆盖一个区间，会让每天的请求数翻倍。该 trend 查询是单次 `GROUP BY`，没有 `GROUPING SETS`，也不返回端点明细。
- 昨天是已结束的自然日，结果按 `账号ID + 日期` 持久化，同一天不再重查；昨天已缓存时请求区间收缩为仅今天，扫描量减半。代价是迟到日志不会被修正，这是刻意的取舍。
- 今天的结果只放内存，并按解析出的日期戳记；跨过 0 点后旧值自动作废、显示 `–`，等下一次错峰刷新或悬停再查。
- 默认参数仍然保守：监控账户数量不限，但错峰刷新保证任意时刻至多一个请求在途——首轮在 `min(间隔, N×1.5s)` 窗口内随机铺开，稳态每账号每间隔一次，两次请求至少间隔 1-2 秒，间隔下限 30 分钟；单账户连续 2 次查询失败即熔断该账户（点击徽标重试恢复），401/403 只弹纯展示通知条。放宽这些常量前需要先确认目标服务器的实际负载。
- 命中率挂在「今日统计」列内，通过给上游的 `space-y-0.5` 容器加 `display:grid; grid-template-columns:auto auto` 让原有四项两两并排，命中率行用 `grid-column: 1 / -1` 独占第三行。不要移动或重新父级化上游的四个统计节点——它们由 Vue 管理，「用户扣费」还是 `v-if`，重新父级化会在节点出现/消失时错位。
- 该列在列设置里默认隐藏（`DEFAULT_HIDDEN_COLUMNS` 含 `today_stats`）。列不存在时必须移除注入并停止轮询，打开列后由 MutationObserver 自动恢复。
- 命中率错峰调度只在 `/admin/accounts` 且页面可见时生效；切到其他管理页、后台标签页或非 Sub2API 站点必须停表。`installAccountHitRateLinks()` 会被 `applyPageEnhancements()` 与 MutationObserver 反复调用，必须幂等，不能每调用一次就启动新一轮查询。
- 缓存命中率复用 `calculateUsageCacheHitRatePercent()`，分母为 0 时必须返回 `null`（渲染成 `–`），不能渲染成 `0%`。
- 命中率的渲染必须廉价：`resolveAccountHitRateDates()` 每轮注入只解析一次并向下传递，不要退回到「每个徽标各自解析」。`Intl.DateTimeFormat` 构造一次约 35µs，而缓存复用约 1.7µs，`01-date-utils.js` 按 `timeZone` 缓存了格式化器，`06-account-hit-rate.js` 另外缓存了解析出的时区。
- 每行带一个 `data-sub2api-account-hit-rate-render-key`，内容未变时整行跳过、不写任何 DOM。不要在跳过路径之前无条件赋 `className` / `style` / `aria-pressed`——一次多余的样式写入就会让整张表重新计算样式，滚动时表现为掉帧。测试会用元素级写入计数断言「未变化的行零写入」。
- 单元格会在「`-` 占位」与「stats 堆栈」之间切换。行要跟着容器走：判断依据必须是容器类名（`space-y-0.5 text-xs`），不能用 `data-sub2api-account-hit-rate-grid` 属性——那个属性正是我们之后才加上的，用它探测会永远落空。
- 命中率回归测试至少覆盖：一次请求同时渲染今天与昨天、昨天缓存后只查今天、昨天缓存跨日失效、某天无记录、失败保留旧值、跨午夜作废今天、监控账户持久化（无上限）、单账户连续 2 次失败熔断与点击重试恢复、手动成功清零计数、隐藏页停表、列隐藏时不注入也不调度、重复注入不重复请求、未变行零写入、格式化器只构造一次、无数据转有数据时行迁入网格、四档配色分级、错峰首轮随机铺开与最小请求间距、前台恢复按间距逐个排干、auth 失败纯展示通知条。
- 命中率的 observer 只监听账号表 `tbody`，不再监听整个 `documentElement`；SPA 替换表格节点后，`installAccountHitRateLinks()` 必须比较已观察节点并重新挂载，否则滚动时行变更不会触发注入。页面共用的每页数量按钮查找走缓存，失效判断要沿 `parentElement` 检查整条祖先链的 `isConnected`（只查按钮自身会在上游只移除容器时留下陈旧按钮）。
- 命中率注入必须在产生该行的同一个 mutation turn 内完成，不能退回到 `setTimeout` 延迟。账号表超过 50 行时是虚拟滚动 + `ResizeObserver` 动态测高；延迟注入会先让浏览器按旧布局绘制并测量，再改行高（把 stats 栈改成 grid 并加一行，实测行高 97px → 85px），虚拟器随后为每个新挂载行校正 `scrollTop`，向上滚动时会回拨（实测 9 次、168px）。observer 回调只渲染 records 指向的行，并在每轮结束后 `takeRecords()` 丢弃自身写入；完整 `tr` 扫描只用于安装、可见性恢复和显式刷新。回归测试要在不推进定时器的前提下断言「行被移除后调用一次 observer，行立即回来」，并覆盖自身 mutation 不触发重绘、无关行不被触碰。
- `installPageSizeWatcher` 的 cleanup/restore 套件必须合并执行：设置按钮仍然即时安装，但 `restoreSavedSidebarState`、`restoreSavedPageSize`、筛选条件恢复、`installAccountHitRateLinks` 等重活最多每 100ms 跑一轮，运行中到达的 mutation 只标记 dirty 并在结束后补跑，避免滚动时每个 mutation 都跑整套恢复。
- 侧边栏宽度和账号名称 gutter 的样式写入必须先比较当前值；值没变时不要重复 `setProperty` / `setAttribute`，否则每次 page-size watcher 或 usage-link pass 都会触发样式重算。
