# A6API 渠道名称 → 市场自动搜索 (A6API Channel Market Search)

在 A6API「渠道管理」页（`#/merchant/channels`）渠道名称右侧新增「查市场」和「后台查」两个按钮：
- **查市场**：在前台新标签页打开市场页，并自动以“渠道”维度搜索该渠道ID。
- **后台查**：在后台新标签页打开市场页并搜索该渠道ID（不切换当前页面，优先使用 Tampermonkey `GM_openInTab`）。

市场页（`#/market`）接收到渠道 ID 后，会自动切换至“渠道”维度并填入渠道 ID 触发回车搜索。

## Source and build output

- Source: `a6api/a6api-channel-market-search.user.js`
- Build script: `a6api/build-userscript.mjs`
- GitHub Pages artifact: `https://skt-shinyruo.github.io/tampermonkey-scripts/a6api-channel-market-search.user.js`

## Build

```bash
node a6api/build-userscript.mjs
A6API_VERSION="1.3.${GITHUB_RUN_NUMBER}" \
A6API_UPDATE_URL="https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/a6api-channel-market-search.user.js" \
A6API_DOWNLOAD_URL="https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/a6api-channel-market-search.user.js" \
node a6api/build-userscript.mjs --output=dist/a6api-channel-market-search.user.js
```

## Validation

```bash
node --check a6api/a6api-channel-market-search.user.js
node --check a6api/build-userscript.mjs
node --test a6api/a6api-channel-market-search.user.test.mjs
```
