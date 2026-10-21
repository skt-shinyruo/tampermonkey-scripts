# A6API 渠道名称 → 市场自动搜索 (A6API Channel Market Search)

1. **渠道管理页快捷跳转与自动同步**（`#/merchant/channels`）：
   - 已上架渠道名称右侧新增「查市场」和「后台查」快捷按钮（高度 24px）。
   - 自动扫描并同步已上架渠道的 ID、渠道名称、渠道说明至本地存储，已下架渠道自动剔除。
2. **市场页快捷渠道抽屉**（`#/market`）：
   - **双态贴边胶囊触点**：默认靠左贴边，折叠时显示蓝色实体胶囊「📌 快捷渠道」，展开时在完全相同的物理位置（`top: 10vh`，贴边 `0px` 零留白，高度 40px，等宽等热区）呈现完全对称的「✕ 快捷渠道」胶囊，用户盲点同一物理坐标即可实现 1:1 绝对零位移的展开与收起，并持久化记住展开/折叠状态。
   - **视口居中比例**：占据页面 80% 高度（`height: 80vh`），上下各留白 10%（`top: 10vh; bottom: 10vh`），中间卡片内容区自适应滚动（`overflow-y: auto`），底部设置栏独立常驻。
   - **我的渠道**：展示已同步的渠道列表（卡片展示：名称 + ID + 渠道说明 + 备注徽标），点击直接在当前市场页就地切换搜索，并自动联动将多维筛选对齐为「全部品牌」「全部」「综合推荐 (默认)」，杜绝前置狭窄筛选造成的 0 结果假象。
   - **自定义渠道**：支持输入渠道 ID 配合「🔍 获取」按钮自动从已同步渠道或市场检索并回填名称与说明，支持一键录入备注、覆盖查重与独立删除。
   - **选择与反选（Toggle Deselect）**：点击未选中卡片执行搜索、多维筛选联动重置并高亮；再次点击已激活卡片自动判定为反选，清空输入框并派发回车就地局部刷新（非整页刷新），保留当前已选的其他分类/排序现场。
   - **渠道备注与就地编辑**：采用全局独立存储键 `a6_channel_remarks` 解耦持久化（渠道重新同步不丢失）；卡片支持展示 `📝 备注` 徽标，点击 `✏️` 即可就地编辑或清空备注。
   - **快捷工具栏**：抽屉头部下方常驻两枚高频操作按钮：
     - **清空搜索**：清空搜索框输入、派发回车并清除卡片高亮态，保留已选的其他分类/排序条件。
     - **重置市场**：触发官方「重置所有筛选」并强制对齐「全部品牌」「全部模型」「综合推荐 (默认)」标签，全量还原初始状态。
   - **底部常驻设置栏**：抽屉底部独立固定设置区，不占用卡片列表滚动高度：
     - **贴边方向切换**：提供 `⇋ 靠左` / `⇋ 靠右` 一键切换贴边位置，记忆设置。
     - **触底自动加载**：提供 `[⚡ 自动加载: 开 / 关]` 胶囊切换按钮（兼备 Tampermonkey 脚本菜单命令），支持原生 IntersectionObserver 触底自动流式加载。
     - **页面宽度调节**：内置 `[原版] [1.35] [1.55] [满宽]` 胶囊预设、倍率输入框与实时滑块。
   - **暗色模式**：原生支持跟随系统（`prefers-color-scheme: dark`）自动切换，同时兼容页面主题样式。
3. **市场模型列表自选渠道高亮**（`#/market`）：
   - **高亮触发**：在未搜索指定渠道时（包括浏览全量市场、按品牌/模型筛选、或按「模型」/「描述」维度搜索），自动提取列表行第一列商家的「`渠道 #ID`」，若命中快捷渠道（自有或自定义），该行呈现金黄色内嵌发光轮廓（`box-shadow: inset ... #f59e0b`）及金黄色文字醒目高亮。
   - **首尾单元格内嵌描边**：使用基于单元格的内嵌描边（Inset Border）方案，首列 `td:first-child` 与尾列 `td:last-child` 精准呈现左右圆角与完整侧边框，彻底避免被表格外层滚动容器（`overflow: hidden`）裁切；右侧「禁用/测试/固定商家/加入路由」按钮组预留呼吸内边距并融入底色，不再悬浮截断边框。
   - **展开详情一体化大卡片**：点击模型行展开详情时，主行自动保留上、左、右边框（去底边），下属展开行（`.ant-table-expanded-row`）接续保留下、左、右边框（去顶边），两行共享浅金背景微光，视觉上缝合为一个闭合的完整大卡片，将供应商、计费模式、定价表等全部展开内容严整框住。
   - **单渠道搜索互斥抑制**：当切换为「渠道」维度且搜索框输入了内容时，自动关闭行高亮，避免单渠道搜索结果全量高亮的视觉干扰。
4. **市场页主容器宽度倍率缩放**（`#/market`）：
   - **解除窄框限制**：打破官方默认 ~1200px 的居中固定宽度约束，按倍率向外舒展容器，彻底消除 11 列数据表格的底部横向滚动条与文字挤压。
   - **快捷档位、直接输入与实时滑块**：抽屉内提供 `[原版] [1.35] [1.55] [满宽]` 胶囊按钮、倍率输入框（直接输入自定义数字如 1.45 按回车生效）与无级滑块（Slider），所见即所得平滑拉伸，持久化记忆配置。
   - **一体化舒展与路由隔离**：多维筛选标签栏与数据表格整体无缝自适应撑开；离开市场页时自动释放原版样式，保持环境纯净。
5. **市场模型列表触底自动加载更多**（`#/market`）：
   - **原生零魔数交汇检测**：利用浏览器原生 `IntersectionObserver` 监听底部「↓ 加载更多」按钮，触底时自动触发点击，流式展开下一批数据。
   - **一键开关与菜单联动**：抽屉快捷工具栏新增 `[⚡ 自动加载: 开 / 关]` 胶囊切换按钮与 `GM_registerMenuCommand` 脚本菜单命令，初次默认关闭，开启后本地持久化记忆。
   - **防频刷与生命周期自适应**：内置 600ms 点击冷却节流与按钮 loading/disabled 状态检测；全量展开或离开页面时自动休眠，切换筛选或重置市场后自动重连。
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
