# AIHub 供应商大厅增强 (AIHub Supplier Hall Enhancer)

为 AIHub 供应商大厅提供关键分组高亮、指标直接透出与排序拆解、每页数量自定义与超长监测请求自动分片。

## 功能特性

- **分组高亮**：高亮供应商大厅中所有以 `S012` 开头的关键分组。
- **综合分与平台排名**：分组名完整换行展示，分数与同平台排名的徽标始终可见；卡片内直接展示关键性能指标。
- **排序拆解**：点击卡片可查看完整排序算法拆解与排名依据。
- **分页控制**：每页数量可自定义档位与默认记忆值。
- **请求拆分**：自动拆分超长监测请求，避免触发服务端限流或请求体截断。
- **适用站点**：`https://aihub.top/*`。

## 构建与发布

- 源码：`aihub/aihub-supplier-hall.user.js`
- 构建脚本：`aihub/build-userscript.mjs`
- GitHub Pages 地址：`https://skt-shinyruo.github.io/tampermonkey-scripts/aihub-supplier-hall.user.js`

## 验证

```bash
node --check aihub/aihub-supplier-hall.user.js
node --check aihub/build-userscript.mjs
node --test aihub/aihub-supplier-hall.user.test.mjs
```
