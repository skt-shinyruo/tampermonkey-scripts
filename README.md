# Tampermonkey Scripts (油猴脚本合集)

高质量 Tampermonkey / 暴力猴实用脚本集合，包含 A6API、Sub2API、Linux.do、Cursor 等站点的体验增强脚本。

本项目所有脚本均已接入 **GitHub Actions 自动化 CI 构建与发布体系**。通过在线链接安装一次后，脚本内部会自动注入更新源元数据（`@updateURL` 与 `@downloadURL`）。后续仓库更新时，油猴可在后台**全自动静默升级**，彻底告别手动复制粘贴。

---

## 📦 脚本索引与一键安装

点击下方表格中的 **「GitHub Pages」** 或 **「GitHub Raw」** 链接，浏览器将直接唤起油猴安装界面：

| 脚本名称 | 适用站点 | 功能简介 | 推荐安装 (GitHub Pages) | 备用安装 (GitHub Raw) | 源码目录 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **A6API 渠道名称 → 市场自动搜索** | `a6api.com` | 管理页快捷查市场；市场页快捷渠道抽屉、一键搜索/反选、渠道信息静默对齐、批量同步与下架标识、多维筛选联动对齐、页面宽度倍率缩放、触底自动流式加载 | [🚀 点击安装](https://skt-shinyruo.github.io/tampermonkey-scripts/a6api-channel-market-search.user.js) | [🔗 Raw 链接](https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/a6api-channel-market-search.user.js) | [`a6api/`](./a6api/) |
| **Sub2API Helper** | `*://*/*` (Sub2API 管理端) | 深色/浅色/系统主题记忆；侧边栏收起与宽度记忆（紧凑/原版/自定义）；账号页每页数量记忆；使用记录页日期范围/粒度记忆；自动刷新倒计时与行级缓存命中率分析；站点彻底静默排除 | [🚀 点击安装](https://skt-shinyruo.github.io/tampermonkey-scripts/sub2api-helper.user.js) | [🔗 Raw 链接](https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/sub2api-helper.user.js) | [`sub2api/`](./sub2api/) |
| **Linux.do 新标签页打开链接** | `linux.do` | 在 Linux.do 论坛中以新标签页（后台标签）打开帖子链接与侧边栏导航链接，保留原列表浏览位置 | [🚀 点击安装](https://skt-shinyruo.github.io/tampermonkey-scripts/linuxdo-open-links-new-tab.user.js) | [🔗 Raw 链接](https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/linuxdo-open-links-new-tab.user.js) | [`linuxdo/`](./linuxdo/) |
| **Cursor Spending 显示用量总额** | `cursor.com` | 在 Cursor Spending 页面将 "x% used" 替换为两位小数精确百分比，并内联调用官方接口计算展示真实花费金额与上限总量 | [🚀 点击安装](https://skt-shinyruo.github.io/tampermonkey-scripts/cursor-spending-total.user.js) | [🔗 Raw 链接](https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/cursor-spending-total.user.js) | [`cursor/`](./cursor/) |
| **AIHub 供应商大厅增强** | `aihub.top` | 高亮以 S012 开头的关键分组；每页数量档位与默认记忆值自定义；超长监测请求自动分片；分组名综合分直观透出与卡片指标内联、排序算法拆解 | [🚀 点击安装](https://skt-shinyruo.github.io/tampermonkey-scripts/aihub-supplier-hall.user.js) | [🔗 Raw 链接](https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/aihub-supplier-hall.user.js) | [`aihub/`](./aihub/) |

---

## ⚡ 油猴全自动静默更新配置

为实现“代码提交后油猴在后台静默自动拉取最新版，无需人工干预”，请在 Tampermonkey 中完成以下一次性设置：

1. 点击浏览器右上角油猴图标 -> 进入 **「管理面板」**；
2. 点击右上角 **「设置」**（齿轮图标）-> 在「通用」中将 **「配置模式」** 切换为 **高级**；
3. 向下滚动至 **「脚本更新」 (Script Update)** 分组，按如下推荐项配置：
   - **检查间隔**：选择 **每 6 小时**（或更短间隔）；
   - **自动安装**：☑ **勾选**；
   - **简单的脚本更新不必询问我**：☑ **勾选**；
   - **多久后隐藏提醒**：选择 **1 分钟**（或直接关闭通知）。

> 💡 **即时更新小贴士**：
> 如果刚提交完代码希望立刻同步，不必等待 6 小时定时轮询：直接在油猴「已安装脚本」列表中点击对应脚本右侧的 **「🔄 检查更新」** 按钮，几秒内即可静默升级至最新版。

---

## 🛠️ 本地高效开发与热载指引

在本地编写或调试脚本时，无需频繁 `git push` 或手动复制代码，通过 `@require` 机制可实现 **“本地保存代码 -> 浏览器按 F5 立即生效”**：

### 方式 1：本地微型 HTTP 服务（推荐，多环境与 WSL 兼容）
在项目根目录启动静态服务：
```bash
python3 -m http.server 8080
```
在油猴中新建脚本，仅写入调试外壳（以 a6api 为例）：
```javascript
// ==UserScript==
// @name         A6API 本地调试
// @match        https://a6api.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @run-at       document-idle
// @require      http://127.0.0.1:8080/a6api/a6api-channel-market-search.user.js
// ==/UserScript==
```
本地修改并保存对应脚本文件后，直接在浏览器刷新页面即可立即运行最新逻辑。

### 方式 2：油猴直接文件协议直读 (`file://`)
1. 打开浏览器扩展管理页面（`chrome://extensions`），找到 Tampermonkey，开启 **「允许访问文件网址」**；
2. 在油猴调试外壳中使用 `@require file:///<本地绝对路径>`。

---

## 📐 新脚本接入标准规范（4+1 规范）

依据架构决策 [ADR 0008](./docs/adr/0008-userscript-ci-distribution-and-auto-update-standard.md)，未来仓库新增任何用户脚本必须严格遵循 **“4+1 工程化规范”**，以保证代码质量与自动化更新生命周期的统一：

### 1. 脚本独立目录 (`<name>/` - 4 个文件)
每个脚本必须建立独立的子目录，并包含：
- **`<name>.user.js`**：脚本源码。头部元数据仅保留 `@version <major>.<minor>.0`，**严禁写死 `@updateURL` 与 `@downloadURL`**（由构建脚本动态注入）。
- **`build-userscript.mjs`**：标准化构建脚本。支持 `--output` 与 `--check` 参数，读取环境变量 `${NAME}_VERSION`，并在打包时自动注入 Pages 与 Raw 两个发布源地址。
- **`<name>.user.test.mjs`**：基于 Node.js 原生 `node:test` 编写的自动化测试，覆盖源码语法、构建产物元数据校验及核心逻辑测试。
- **`README.md`**：脚本独立说明文档，介绍特性、匹配网址及独立构建测试命令。

### 2. CI 发布流水线 (`.github/workflows/` - 1 个工作流)
- **`<name>-pages.yml`**：当 `<name>/**` 发生变更推送到 `main` 时触发。
  - 自动运行语法检查与单测；
  - 采用标准自增版本：`${NAME}_VERSION="<major>.<minor>.${GITHUB_RUN_NUMBER}"`；
  - 使用通配安全保留模式（`cp *.user.js "$publish_dir/"`）将编译产物安全推送到 `build` 分支，杜绝覆盖其他已有脚本。
- **接入 Pages 部署**：在 `.github/workflows/pages.yml` 的 `workflows` 列表中追加 `- Publish <Name> Userscript`，实现构建完成自动发布到 GitHub Pages。
- **登记根 README**：在根目录 `README.md` 的脚本索引表格中追加新脚本条目与安装链接。

---

## 🧪 常用工程命令

```bash
# 语法检查所有脚本
node --check a6api/a6api-channel-market-search.user.js
node --check sub2api/build-userscript.mjs
node --check linuxdo/linuxdo-open-links-new-tab.user.js
node --check cursor/cursor-spending-total.user.js
node --check aihub/aihub-supplier-hall.user.js

# 运行全量单测
node a6api/a6api-channel-market-search.user.test.mjs
node sub2api/sub2api-helper.user.test.mjs
node linuxdo/linuxdo-open-links-new-tab.user.test.mjs
node --test cursor/cursor-spending-total.user.test.mjs
node --test aihub/aihub-supplier-hall.user.test.mjs
```
