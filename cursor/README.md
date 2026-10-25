# Cursor Spending 显示用量总额 (Cursor Spending Total)

在 Cursor Spending 页面将 "x% used" 替换为两位小数精确百分比，并在右侧内联显示真实已用金额和总量。

## 功能特性

- 精确百分比：将 `80% used` 替换为保留两位小数的精确数值（如 `80.35%`）。
- 金额内联统计：从官方 `/api/usage-summary` 与 `/api/dashboard/get-aggregated-usage-events` 获取分桶真实花费，展示已用金额与上限总量。
- 适用站点：`https://cursor.com/dashboard/spending*`。

## 构建与发布

- 源码：`cursor/cursor-spending-total.user.js`
- 构建脚本：`cursor/build-userscript.mjs`
- GitHub Pages 地址：`https://skt-shinyruo.github.io/tampermonkey-scripts/cursor-spending-total.user.js`

## 验证

```bash
node --check cursor/cursor-spending-total.user.js
node --check cursor/build-userscript.mjs
node --test cursor/cursor-spending-total.user.test.mjs
```
