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
