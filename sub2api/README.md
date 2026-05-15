# Sub2API Helper

Sub2API Helper 是一个 Tampermonkey userscript，用来增强 Sub2API 管理端的日常使用体验。脚本会在所有网页中加载，但只会在识别到 Sub2API 管理端页面特征后启用功能。

生成后的安装文件是 `sub2api-helper.user.js`。源码拆分在 `src/parts/` 下，修改源码后由 GitHub Actions 构建最终 userscript，推送到 `build` 分支供 Greasy Fork webhook 同步；`pages.yml` 会把 `build` 分支发布到 GitHub Pages 作为调试入口。

## 功能

- 浏览器主题同步：根据浏览器深浅色偏好同步 Sub2API 管理端主题。
- 侧边栏状态记忆：记住侧边栏收起或展开状态，并在同一 Sub2API 站点中恢复。
- 使用记录日期范围记忆：记住使用记录页选择的日期范围，并在请求 `/api/v1/usage` 时同步改写日期参数。
- 使用记录粒度记忆：记住使用记录页的粒度选择。
- 使用记录每页数量记忆：记住使用记录页每页显示数量。
- 使用记录自动刷新：在使用记录页的刷新按钮旁添加自动刷新控制和倒计时。
- 仪表盘日期范围记忆：记住仪表盘日期范围，并在仪表盘趋势请求中同步改写日期参数。
- 仪表盘粒度记忆：记住仪表盘粒度选择。
- 设置面板：在 Tampermonkey 菜单中提供 `Sub2API Helper 设置`，并在已识别的 Sub2API 页面右下角添加 `设置` 小按钮。
- 功能开关：每个功能都有 `全局` 和 `当前页` 两级开关，默认开启。

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
- 普通 `/usage` 与 `/admin/usage` 的日期范围、粒度、每页数量必须独立存储和恢复；不要让普通用户页开关误伤管理端页。
- 自动恢复使用 `element.click()` 时，这些非用户点击不能被当成用户正在选择日期，否则第一次打开 picker 被 SPA 切页/挂载吞掉后，后续恢复会被保护窗口挡住。date picker 打开失败也要短间隔重试，不能只点一次后长时间等待。
- 不能只用接口请求参数正确来判断日期范围恢复成功。请求可能已经被改写成保存值，但 UI trigger 仍停在页面默认值；恢复完成必须以最终 trigger 文本匹配保存范围为准，不匹配要继续重试。
- 真实浏览器复测前必须确认当前页面实际运行的 helper 脚本版本。设置面板会显示脚本版本，页面根节点也有 `data-sub2api-helper-version` 便于 DevTools 检查。
- 修改相关逻辑时，至少保留/补充这些回归场景：从优惠码页切回管理端使用记录、date picker 延迟挂载、第一次 apply 后 UI 文本仍是默认值、粒度和每页数量切回后恢复、请求在页面指纹完整前发出、用户手动选择后不被旧保存值覆盖。
- 侧边栏刷新后自动收起问题的根因可能不是 Sub2API 页面默认状态，而是 helper 的 `restoreSavedSidebarState()` 读到旧的 `sidebar-collapsed: true` 后主动调用原生 toggle 的 `element.click()`。DevTools 曾在 `0.22.21` 安装版中捕获到 `HTMLElement.click() -> restoreSavedSidebarState() -> MutationObserver` 调用栈。
- 修复侧边栏状态记忆时，状态识别应优先读取真实底部 toggle 的 `title`：`展开` 表示已收起，`收起` 表示已展开；`sidebar-link-collapsed` class 次之，按钮可见文本只能作为兜底，因为收起态可能仍显示 `收起`。
- `getSidebarToggleButton()` 不能宽泛匹配所有 sidebar 按钮，必须锁定真实收起/展开 toggle，避免把 `渠道管理`、主题按钮或其他导航按钮当成状态来源。用户点击后要延迟读取更新后的 DOM 并保存最新值，展开后必须写入 `sidebar-collapsed: false`。
- `restoreSavedSidebarState()` 必须具备幂等和 in-flight 保护。它会被 `applyPageEnhancements()` 与 `MutationObserver` 多次触发，恢复期间不能在 DOM mutation burst 中反复点击同一个 toggle；用户正在手动切换侧边栏时也不能用旧保存值覆盖用户选择。
- 侧边栏回归测试至少覆盖：保存值 `true`/`false` 各只恢复点击一次、用户从收起切到展开会保存 `false`、用户从展开切到收起会保存 `true`、非 toggle 的 sidebar 按钮不参与识别、不同 origin 的 `sidebar-collapsed` 相互隔离。
