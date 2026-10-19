# A6API 渠道名称 → 市场自动搜索 (A6API Channel Market Search)

1. **渠道管理页快捷跳转与自动同步**（`#/merchant/channels`）：
   - 已上架渠道名称右侧新增「查市场」和「后台查」快捷按钮（高度 24px）。
   - 自动扫描并同步已上架渠道的 ID、渠道名称、渠道说明至本地存储，已下架渠道自动剔除。
2. **市场页快捷渠道抽屉**（`#/market`）：
   - 默认以展开状态呈现，支持点击右上角 `✕` 收起为贴边胶囊，并持久化记住展开/折叠状态。
   - **左右侧切换**：面板头部提供 `⇋ 靠左` / `⇋ 靠右` 一键切换贴边位置，记忆设置。
   - **视口居中比例**：占据页面 80% 高度（`height: 80vh`），上下各留白 10%（`top: 10vh; bottom: 10vh`），内容区自适应滚动。
   - **我的渠道**：展示已同步的渠道列表（卡片展示：名称 + ID + 渠道说明 + 备注徽标），点击直接在当前市场页就地切换搜索。
   - **自定义渠道**：支持输入渠道 ID 配合「🔍 获取」按钮自动从已同步渠道或市场检索并回填名称与说明，支持一键录入备注、覆盖查重与独立删除。
   - **选择与反选（Toggle Deselect）**：点击未选中卡片执行搜索并高亮；再次点击已激活卡片自动判定为反选，清空输入框并派发回车就地局部刷新（非整页刷新），保留其他筛选维度。
   - **渠道备注与就地编辑**：采用全局独立存储键 `a6_channel_remarks` 解耦持久化（渠道重新同步不丢失）；卡片支持展示 `📝 备注` 徽标，点击 `✏️` 即可就地编辑或清空备注。
   - **快捷工具栏**：抽屉头部下方常驻「🧹 清空搜索」与「⟲ 重置市场」两枚操作按钮：
     - **清空搜索**：清空搜索框输入、派发回车并清除卡片高亮态，保留已选的其他分类/排序条件。
     - **重置市场**：触发官方「重置所有筛选」并强制对齐「全部品牌」「全部模型」「综合推荐 (默认)」标签，全量还原初始状态。
   - **暗色模式**：原生支持跟随系统（`prefers-color-scheme: dark`）自动切换，同时兼容页面主题样式。
3. **市场模型列表自选渠道高亮**（`#/market`）：
   - **高亮触发**：在未搜索指定渠道时（包括浏览全量市场、按品牌/模型筛选、或按「模型」/「描述」维度搜索），自动提取列表行第一列商家的「`渠道 #ID`」，若命中快捷渠道（自有或自定义），该行呈现金黄色外发光轮廓（`box-shadow: 0 0 0 1px #f59e0b`）及金黄色文字醒目高亮。
   - **列表展开无缝适配**：点击模型行展开详情或多渠道供货子列表时，主行与命中的供货子行均独立精准高亮，展开不丢状态、边框不断裂。
   - **单渠道搜索互斥抑制**：当切换为「渠道」维度且搜索框输入了内容时，自动关闭行高亮，避免单渠道搜索结果全量高亮的视觉干扰。
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
