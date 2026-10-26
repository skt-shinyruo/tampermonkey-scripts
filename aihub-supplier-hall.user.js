// ==UserScript==
// @name         AIHub
// @namespace    https://aihub.top/
// @version      2.0.7
// @description  高亮 AIHub 供应商大厅中所有以 S012 开头的分组；每页数量可自定义档位与默认值；自动拆分超长监测请求；分组名完整换行展示，并显示综合分与平台排名，卡片内直接展示关键指标，点击可看完整排序拆解
// @match        https://aihub.top/*
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/aihub-supplier-hall.user.js
// @downloadURL  https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/aihub-supplier-hall.user.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /* ========== 可配置项 ========== */
  const PREFIX = 'S012';       // 要匹配的名称前缀（不区分大小写）
  const BADGE  = '';           // 名称前的小徽标文字，留空则不加；例如改成 '★'
  const HIGHLIGHT_ROW = true;  // 是否给整张卡片加边框
  const SHOW_SCORE = true;     // 是否在分组名后显示综合评分徽标

  /* 每页数量的“出厂默认值”。运行时可在页面上点齿轮按钮改，
     改完存在 localStorage，优先级高于这里 */
  const PAGE_SIZE_DEFAULTS = {
    sizes: [10, 20, 50, 100, 200],  // 可选档位
    default: 50                     // 打开页面时默认选中的档位
  };
  /* ============================== */

  const STYLE = `
    /* ===== 整张卡片：干净、四角闭合的边框（浅色模式） ===== */
    .decision-row.ledger-row.s012-row {
      box-sizing: border-box !important;
      border: 2px solid #e0a63a !important;
      border-radius: 12px !important;
      background-image: linear-gradient(rgba(224, 166, 58, .06), rgba(224, 166, 58, .06)) !important;
      box-shadow: 0 1px 2px rgba(120, 80, 10, .08) !important;
    }
    .decision-row.ledger-row.s012-row:hover {
      border-color: #cf8f1b !important;
      background-image: linear-gradient(rgba(224, 166, 58, .12), rgba(224, 166, 58, .12)) !important;
    }

    /* ===== 整张卡片：深色模式 ===== */
    html.dark .decision-row.ledger-row.s012-row {
      border-color: #d6a441 !important;
      background-image: linear-gradient(rgba(246, 193, 76, .07), rgba(246, 193, 76, .07)) !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, .35) !important;
    }
    html.dark .decision-row.ledger-row.s012-row:hover {
      border-color: #f0c76a !important;
      background-image: linear-gradient(rgba(246, 193, 76, .13), rgba(246, 193, 76, .13)) !important;
    }

    /* ===== 名称：只保留颜色，不做额外底色/描边（浅色模式） ===== */
    strong.s012-name {
      color: #92400e !important;
    }
    /* ===== 名称：深色模式 ===== */
    html.dark strong.s012-name {
      color: #f0c76a !important;
    }

    /* ===== 每页数量设置：齿轮按钮 ===== */
    .s012-ps-btn {
      flex: 0 0 auto;
      box-sizing: border-box;
      width: 30px !important;
      height: 30px !important;
      margin-left: 6px !important;
      padding: 0 !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      border: 1px solid rgba(0, 0, 0, .16) !important;
      border-radius: 8px !important;
      background: #fff !important;
      color: #6b7280 !important;
      cursor: pointer !important;
      vertical-align: middle !important;
    }
    .s012-ps-btn:hover {
      border-color: #e0a63a !important;
      color: #cf8f1b !important;
    }
    html.dark .s012-ps-btn {
      background: #1f232b !important;
      color: #cbd5e1 !important;
      border-color: rgba(255, 255, 255, .18) !important;
    }

    /* ===== 每页数量设置：弹层 ===== */
    .s012-ps-panel {
      position: fixed;
      z-index: 2147483000;
      width: 290px;
      box-sizing: border-box;
      padding: 12px;
      background: #fff;
      color: #111827;
      border: 1px solid rgba(0, 0, 0, .12);
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, .18);
      font-size: 13px;
      line-height: 1.5;
      text-align: left;
    }
    html.dark .s012-ps-panel {
      background: #1f232b;
      color: #e5e7eb;
      border-color: rgba(255, 255, 255, .14);
      box-shadow: 0 12px 32px rgba(0, 0, 0, .55);
    }
    .s012-ps-panel h4 {
      margin: 0 0 10px;
      font-size: 13px;
      font-weight: 600;
    }
    .s012-ps-row {
      margin-bottom: 10px;
    }
    .s012-ps-row label {
      display: block;
      margin-bottom: 4px;
      color: #6b7280;
      font-size: 12px;
    }
    html.dark .s012-ps-row label {
      color: #9ca3af;
    }
    .s012-ps-row input {
      width: 100%;
      box-sizing: border-box;
      height: 30px;
      padding: 0 8px;
      border: 1px solid rgba(0, 0, 0, .18);
      border-radius: 6px;
      background: #fff;
      color: inherit;
      font-size: 13px;
      outline: none;
    }
    html.dark .s012-ps-row input {
      background: #151922;
      border-color: rgba(255, 255, 255, .18);
    }
    .s012-ps-row input:focus {
      border-color: #e0a63a;
    }
    .s012-ps-hint {
      min-height: 16px;
      margin-bottom: 8px;
      color: #c2410c;
      font-size: 12px;
    }
    .s012-ps-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .s012-ps-actions button {
      height: 28px;
      padding: 0 10px;
      border: 1px solid rgba(0, 0, 0, .16);
      border-radius: 6px;
      background: #fff;
      color: #374151;
      font-size: 12px;
      cursor: pointer;
    }
    html.dark .s012-ps-actions button {
      background: #151922;
      color: #e5e7eb;
      border-color: rgba(255, 255, 255, .18);
    }
    .s012-ps-actions .s012-ps-primary {
      background: #e0a63a;
      border-color: #e0a63a;
      color: #fff;
      font-weight: 600;
    }
    .s012-ps-actions .s012-ps-primary:hover {
      background: #cf8f1b;
      border-color: #cf8f1b;
    }

    /* ===== 分组格：名称完整换行，徽标移到倍率格 ===== */
    .decision-row.ledger-row .group-cell.s012-scored {
      min-width: 0;
    }
    .decision-row.ledger-row .group-cell.s012-scored > strong {
      min-width: 0;
      /* 覆盖站点对分组名的单行省略样式，改为完整换行显示 */
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
      overflow-wrap: anywhere;
      word-break: break-word;
      line-height: 1.35;
    }
    .decision-row.ledger-row .group-cell.s012-scored > .group-description,
    .decision-row.ledger-row .group-cell.s012-scored > .s012-mini {
      min-width: 0;
    }

    /* ===== 综合分徽标：排名与分数合并为一个紧凑徽标，放在倍率数值下方 ===== */
    .s012-score {
      display: inline-flex;
      justify-self: start;
      align-items: baseline;
      gap: 2px;
      box-sizing: border-box;
      margin: 1px 0 0;
      padding: 0 2px;
      border: 1px solid transparent;
      border-radius: 4px;
      font-size: 11.5px;
      font-weight: 700;
      line-height: 1.2;
      letter-spacing: -.1px;
      font-variant-numeric: tabular-nums;
      cursor: help;
      white-space: nowrap;
    }
    .s012-score-rank {
      font-weight: 800;
    }
    .s012-score-rank[hidden],
    .s012-score-sep[hidden] {
      display: none;
    }
    .s012-score-sep {
      opacity: .45;
    }
    .s012-score-num::after {
      content: "▾";
      margin-left: 2px;
      font-size: .66em;
      line-height: 1;
      opacity: .5;
    }
    .s012-score[data-band="a"] {
      color: #15803d;
      background: rgba(34, 197, 94, .12);
      border-color: rgba(34, 197, 94, .45);
    }
    .s012-score[data-band="b"] {
      color: #0369a1;
      background: rgba(56, 189, 248, .14);
      border-color: rgba(56, 189, 248, .45);
    }
    .s012-score[data-band="c"] {
      color: #b45309;
      background: rgba(245, 158, 11, .14);
      border-color: rgba(245, 158, 11, .45);
    }
    .s012-score[data-band="d"] {
      color: #b91c1c;
      background: rgba(239, 68, 68, .12);
      border-color: rgba(239, 68, 68, .45);
    }
    html.dark .s012-score[data-band="a"] { color: #4ade80; }
    html.dark .s012-score[data-band="b"] { color: #7dd3fc; }
    html.dark .s012-score[data-band="c"] { color: #fbbf24; }
    html.dark .s012-score[data-band="d"] { color: #fca5a5; }

    /* ===== 行内简版指标条（放在分组名/描述下方的空白处） ===== */
    .decision-row.ledger-row .group-cell .s012-mini {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 2px 10px;
      margin-top: 7px;
      padding-top: 6px;
      border-top: 1px dashed rgba(15, 23, 42, .09);
      font-size: 9.5px;
      line-height: 16px;
      color: #7b8494;
      cursor: pointer;
    }
    html.dark .decision-row.ledger-row .group-cell .s012-mini {
      border-top-color: rgba(255, 255, 255, .09);
      color: #8b95a5;
    }
    .decision-row.ledger-row .group-cell .s012-mini:hover { color: #4b5563; }
    html.dark .decision-row.ledger-row .group-cell .s012-mini:hover { color: #c3c9d4; }

    .s012-mc {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      white-space: nowrap;
    }
    .s012-mc-k {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .s012-mc[data-off="1"] { opacity: .42; }
    .s012-mc b {
      margin-left: auto;
      min-width: 20px;
      text-align: right;
      color: #6f7683;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: -.1px;
      font-variant-numeric: tabular-nums;
    }
    .s012-mc[data-tone="good"] b { color: #15803d; }
    .s012-mc[data-tone="mid"] b { color: #b45309; }
    .s012-mc[data-tone="bad"] b { color: #b91c1c; }
    html.dark .s012-mc b { color: #9ca3af; }
    html.dark .s012-mc[data-tone="good"] b { color: #4ade80; }
    html.dark .s012-mc[data-tone="mid"] b { color: #fbbf24; }
    html.dark .s012-mc[data-tone="bad"] b { color: #fca5a5; }

    /* ===== 综合分详情面板 ===== */
    .s012-sp {
      position: fixed;
      z-index: 2147483100;
      width: 352px;
      box-sizing: border-box;
      padding: 13px 15px 11px;
      background: #fff;
      color: #111827;
      border: 1px solid rgba(15, 23, 42, .1);
      border-radius: 14px;
      box-shadow: 0 18px 40px -12px rgba(15, 23, 42, .28), 0 2px 6px rgba(15, 23, 42, .06);
      font-size: 11.5px;
      line-height: 1.5;
      font-family: inherit;
      -webkit-font-smoothing: antialiased;
      font-variant-numeric: tabular-nums;
    }
    html.dark .s012-sp {
      background: #1a1e26;
      color: #e8eaee;
      border-color: rgba(255, 255, 255, .12);
      box-shadow: 0 18px 40px -12px rgba(0, 0, 0, .7), 0 2px 6px rgba(0, 0, 0, .4);
    }

    /* ---- 表头：分数 + 等级 + 权重来源 ---- */
    .s012-sp-head {
      display: flex;
      align-items: center;
      gap: 9px;
    }
    .s012-sp-score {
      font-size: 25px;
      line-height: 1.1;
      font-weight: 800;
      letter-spacing: -.4px;
    }
    .s012-sp-score[data-band="a"] { color: #16a34a; }
    .s012-sp-score[data-band="b"] { color: #0284c7; }
    .s012-sp-score[data-band="c"] { color: #b45309; }
    .s012-sp-score[data-band="d"] { color: #b91c1c; }
    html.dark .s012-sp-score[data-band="a"] { color: #4ade80; }
    html.dark .s012-sp-score[data-band="b"] { color: #7dd3fc; }
    html.dark .s012-sp-score[data-band="c"] { color: #fbbf24; }
    html.dark .s012-sp-score[data-band="d"] { color: #fca5a5; }

    .s012-sp-band {
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .3px;
    }
    .s012-sp-band[data-band="a"] { color: #15803d; background: rgba(34, 197, 94, .14); }
    .s012-sp-band[data-band="b"] { color: #0369a1; background: rgba(56, 189, 248, .16); }
    .s012-sp-band[data-band="c"] { color: #b45309; background: rgba(245, 158, 11, .16); }
    .s012-sp-band[data-band="d"] { color: #b91c1c; background: rgba(239, 68, 68, .14); }
    html.dark .s012-sp-band[data-band="a"] { color: #86efac; }
    html.dark .s012-sp-band[data-band="b"] { color: #7dd3fc; }
    html.dark .s012-sp-band[data-band="c"] { color: #fcd34d; }
    html.dark .s012-sp-band[data-band="d"] { color: #fca5a5; }

    .s012-sp-rank {
      padding: 2px 7px;
      border: 1px solid rgba(224, 166, 58, .4);
      border-radius: 999px;
      background: rgba(224, 166, 58, .16);
      color: #92400e;
      font-size: 10px;
      font-weight: 700;
      white-space: nowrap;
    }
    html.dark .s012-sp-rank {
      border-color: rgba(246, 193, 76, .35);
      background: rgba(246, 193, 76, .13);
      color: #f0c76a;
    }

    .s012-sp-src {
      margin-left: auto;
      font-size: 10px;
      font-weight: 500;
      color: #7b8494;
      white-space: nowrap;
    }
    html.dark .s012-sp-src { color: #8b95a5; }

    .s012-sp-sub {
      margin-top: 3px;
      font-size: 10px;
      color: #7b8494;
      letter-spacing: .1px;
    }
    html.dark .s012-sp-sub { color: #8b95a5; }

    /* ---- 事实标签 ---- */
    .s012-sp-facts {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin: 9px 0 10px;
    }
    .s012-sp-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(15, 23, 42, .055);
      font-size: 10px;
      white-space: nowrap;
    }
    html.dark .s012-sp-tag { background: rgba(255, 255, 255, .08); }
    .s012-sp-tag i {
      color: #7b8494;
      font-style: normal;
    }
    html.dark .s012-sp-tag i { color: #8b95a5; }
    .s012-sp-tag b {
      font-weight: 700;
      color: #374151;
    }
    html.dark .s012-sp-tag b { color: #e5e7eb; }

    /* ---- 指标表 ---- */
    .s012-sp-cols,
    .s012-sp-row {
      display: grid;
      grid-template-columns: 88px 1fr 88px 42px;
      column-gap: 10px;
      align-items: center;
    }
    .s012-sp-cols {
      padding: 0 0 5px;
      border-bottom: 1px solid rgba(15, 23, 42, .08);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: .4px;
      color: #6f7683;
    }
    html.dark .s012-sp-cols {
      border-bottom-color: rgba(255, 255, 255, .1);
      color: #8b95a5;
    }
    .s012-sp-cols span:nth-child(2),
    .s012-sp-cols span:nth-child(4) { text-align: right; }

    .s012-sp-row {
      padding: 5px 0;
      border-radius: 6px;
    }
    .s012-sp-row + .s012-sp-row { border-top: 1px solid rgba(15, 23, 42, .045); }
    html.dark .s012-sp-row + .s012-sp-row { border-top-color: rgba(255, 255, 255, .05); }
    .s012-sp-off { opacity: .42; }

    .s012-sp-k {
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
    }
    .s012-sp-k b {
      font-weight: 600;
      white-space: nowrap;
    }
    .s012-sp-k i {
      margin-left: auto;
      padding: 0 5px;
      border-radius: 4px;
      background: rgba(15, 23, 42, .05);
      color: #6f7683;
      font-size: 9.5px;
      font-style: normal;
      font-weight: 600;
      line-height: 15px;
    }
    html.dark .s012-sp-k i {
      background: rgba(255, 255, 255, .08);
      color: #8b95a5;
    }

    .s012-sp-raw {
      text-align: right;
      color: #4b5563;
      white-space: nowrap;
    }
    html.dark .s012-sp-raw { color: #c3c9d4; }

    .s012-sp-meter {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 26px;
      align-items: center;
      gap: 7px;
    }
    .s012-sp-meter em {
      color: #6f7683;
      font-size: 10px;
      font-style: normal;
      text-align: right;
    }
    html.dark .s012-sp-meter em { color: #8b95a5; }

    .s012-sp-bar {
      position: relative;
      height: 6px;
      border-radius: 3px;
      background: rgba(15, 23, 42, .08);
      overflow: hidden;
    }
    html.dark .s012-sp-bar { background: rgba(255, 255, 255, .1); }
    .s012-sp-bar i {
      position: absolute;
      inset: 0 auto 0 0;
      border-radius: 3px;
      background: linear-gradient(90deg, #f0b23c, #d98b1c);
    }
    html.dark .s012-sp-bar i { background: linear-gradient(90deg, #f0c76a, #d6a441); }

    .s012-sp-contrib {
      text-align: right;
      font-weight: 700;
      color: #374151;
      letter-spacing: -.1px;
    }
    html.dark .s012-sp-contrib { color: #e5e7eb; }

    /* ---- 脚注 ---- */
    .s012-sp-foot {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid rgba(15, 23, 42, .06);
      font-size: 9.5px;
      line-height: 1.6;
      color: #7b8494;
    }
    .s012-sp-foot + .s012-sp-foot {
      margin-top: 0;
      padding-top: 0;
      border-top: 0;
    }
    html.dark .s012-sp-foot {
      border-top-color: rgba(255, 255, 255, .07);
      color: #7f8998;
    }
  ` + (BADGE ? `
    /* ===== 名称前的小徽标（仅当 BADGE 非空时生效） ===== */
    strong.s012-name::before {
      content: "${BADGE}";
      display: inline-block;
      margin-right: 5px;
      font-size: 11px;
      color: #e0a63a;
      vertical-align: middle;
    }
    html.dark strong.s012-name::before {
      color: #f0c76a;
    }
  ` : '');

  const styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  (document.head || document.documentElement).appendChild(styleEl);

  /* ======================= S012 高亮 ======================= */
  const P = PREFIX.toUpperCase();

  /* 真正带背景的卡片是 .decision-row.ledger-row（不要用 article 兜底，
     否则展开行时边框会跳到 article 上，整行高亮会错位） */
  const CARD_SELECTOR = '.decision-row.ledger-row';

  function isTarget(el) {
    return (el.textContent || '').trim().toUpperCase().startsWith(P);
  }

  /* 幂等：名称类和整行类分别判断、分别补上，
     这样 React 重渲染抹掉其中一个时也能补回来 */
  function mark() {
    const strongs = document.querySelectorAll('strong');
    for (let i = 0; i < strongs.length; i++) {
      const el = strongs[i];
      if (!isTarget(el)) continue;

      if (!el.classList.contains('s012-name')) el.classList.add('s012-name');

      if (HIGHLIGHT_ROW) {
        const card = el.closest(CARD_SELECTOR);
        if (card && !card.classList.contains('s012-row')) card.classList.add('s012-row');
      }
    }
  }

  /* ======================= 综合分徽标 ======================= */
  /* 复刻站点前端 ProviderHall 的评分逻辑：
       score = (Σ(指标归一化 × 权重) + TPS × tps权重) / (Σ权重 + tps权重)
               × (检测通过 ? 1 + detection_bonus% : 1)
     权重优先级：本地自定义 > 服务端 display_ranking > 内置默认 */
  const RANKING_KEY = 'provider-hall-display-ranking-v1';
  const RANK_METRICS = ['multiplier', 'effective_price', 'user_speed', 'cache_hit_rate', 'success_rate', 'tps'];
  const AVAILABILITY_ORDER = { healthy: 2, insufficient: 1, failed: 0 };
  const DEFAULT_RANKING = {
    weights: {
      multiplier: 0,
      effective_price: 40,
      user_speed: 20,
      cache_hit_rate: 20,
      success_rate: 40,
      tps: 20
    },
    detection_bonus_percent: 20
  };

  let providerPayload = null;     // { items, ranking, range }
  let scoreByCode = new Map();    // 分组名(code) -> { score, title, ... }
  let scoreSignature = '';
  let providerFallbackTried = false;

  function numOrNull(v) {
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  /* 与站点一致：线性归一化后再截断到 0~100，缺值返回 null */
  function norm(v, fn) {
    const n = numOrNull(v);
    return n === null ? null : clamp(fn(n), 0, 100);
  }

  function validRanking(cfg) {
    if (!cfg || typeof cfg !== 'object' || !cfg.weights || typeof cfg.weights !== 'object') return false;
    if (Object.keys(cfg.weights).length !== RANK_METRICS.length) return false;

    let positive = false;
    for (let i = 0; i < RANK_METRICS.length; i++) {
      const w = cfg.weights[RANK_METRICS[i]];
      if (!Number.isInteger(w) || w < 0 || w > 100) return false;
      if (w > 0) positive = true;
    }

    const bonus = cfg.detection_bonus_percent;
    return positive && Number.isInteger(bonus) && bonus >= 0 && bonus <= 200;
  }

  function activeRanking() {
    try {
      const local = JSON.parse(localStorage.getItem(RANKING_KEY) || 'null');
      if (validRanking(local)) return { cfg: local, custom: true };
    } catch (e) { /* localStorage 不可用时忽略 */ }

    if (providerPayload && validRanking(providerPayload.ranking)) {
      return { cfg: providerPayload.ranking, custom: false };
    }
    return { cfg: DEFAULT_RANKING, custom: false };
  }

  function isImageChart(item) {
    return !!(item.hall_metrics && item.hall_metrics.chart && item.hall_metrics.chart.image);
  }

  /* 站点 Qt()/Tn() 的简化版：按模型卡片的 health 汇总出 healthy/failed/insufficient */
  function probeStateOf(item, card) {
    if (typeof item.detections_enabled === 'boolean') {
      return item.detections_enabled ? card.probe_state : 'disabled';
    }
    const ps = item.probe_state;
    if (ps === 'disabled' || ps === 'inactive' || ps === 'unavailable') return ps;
    return card.probe_state;
  }

  function cardHealth(item, card) {
    if (item.probe_skipped === true && item.probe_state === undefined) return 'insufficient';
    const state = probeStateOf(item, card);
    if (state !== undefined && state !== 'enabled') return 'insufficient';
    return card.health;
  }

  function availabilityOf(item) {
    if (item.detections_enabled === false) return 'insufficient';
    const ps = item.probe_state;
    if (item.detections_enabled === undefined &&
      (ps === 'disabled' || ps === 'inactive' || ps === 'unavailable' || item.probe_skipped === true)) {
      return 'insufficient';
    }

    const cards = item.model_cards || [];
    const states = [];
    for (let i = 0; i < cards.length; i++) states.push(cardHealth(item, cards[i]));
    if (states.indexOf('healthy') !== -1) return 'healthy';
    if (states.indexOf('failed') !== -1) return 'failed';
    return 'insufficient';
  }

  function effectivePrice(item) {
    return item.summary_range
      ? item.effective_input_price_per_million
      : item.effective_input_price_per_million_1h;
  }

  function userSpeed(item, imageChart) {
    /* 站点在算分时对图片模式直接传 null（图片耗时与文本首字不可比），
       所以这里也不能用 user_latency_ms 顶替 */
    if (imageChart) return null;
    if (!item.runtime_trimmed_avg_has_data) return null;
    const samples = numOrNull(item.runtime_trimmed_avg_sample_count);
    if (!(samples >= 1)) return null;
    const ttft = numOrNull(item.runtime_trimmed_avg_ttft_ms);
    return ttft !== null && ttft > 0 ? ttft : null;
  }

  function cacheHitRate(item) {
    const cache = item.summary_range ? item.range_cache : item.runtime_cache_1h;
    if (!cache || !cache.ready || cache.stale) return null;
    return numOrNull(cache.cache_hit_rate);
  }

  /* 站点：1h 缺值不回退 SLA；其它区间在无 hall_metrics 时回退 SLA */
  function successRate(item, range) {
    const rates = item.success_rates || {};
    let rate = rates[range];
    if (rate === undefined || rate === null) {
      rate = (range === '1h' || item.hall_metrics) ? null : numOrNull(item.sla);
    }
    return rate;
  }

  /* 兼容“有 presentation 时看 modes”和“按目标数量推断”两种判定 */
  function hasDetectorMode(detection) {
    if (!detection) return false;

    if (detection.presentation) {
      const modes = detection.presentation.modes;
      return Array.isArray(modes) && modes.indexOf('detector') >= 0;
    }

    const targets = Array.isArray(detection.presentation_targets) ? detection.presentation_targets : [];
    const required = typeof detection.required_targets === 'number' ? detection.required_targets : 0;
    if (!(required > 0 && targets.length === required)) return true;

    const names = targets.map(function (t) { return t && t.name; });
    if (new Set(names).size !== names.length) return true;

    return targets.some(function (t) {
      return !t.presentation ||
        (Array.isArray(t.presentation.modes) && t.presentation.modes.indexOf('detector') >= 0);
    });
  }

  function isDetected(item) {
    const d = item.model_detection;
    if (item.detections_enabled === false) return false;
    if (!d || !d.applicable || d.technical_failure) return false;
    if (d.status !== 'passed') return false;
    if (!hasDetectorMode(d)) return false;
    if (!(d.presentation && d.presentation.text && d.presentation.text.result === true)) return false;

    if (d.stages) {
      return ['detection', 'text'].every(function (key) {
        const stage = d.stages[key];
        return stage && (stage.published_state || stage.state) === 'completed';
      });
    }
    return true;
  }

  function weightedScore(metrics, weights, keys) {
    let sum = 0;
    let total = 0;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      total += weights[key];
      const value = metrics[key];
      if (value !== null && Number.isFinite(value)) sum += clamp(value, 0, 100) * weights[key];
    }
    return total > 0 ? clamp(sum / total, 0, 100) : 0;
  }

  function scoreItem(item, cfg, range) {
    const imageChart = isImageChart(item);
    const price = effectivePrice(item);
    const speed = userSpeed(item, imageChart);
    const cache = cacheHitRate(item);
    const rate = successRate(item, range);
    const mult = numOrNull(item.rate_multiplier);

    const metrics = {
      multiplier: norm(mult, function (n) { return (0.3 - n) / 0.25 * 100; }),
      effective_price: norm(price, function (n) { return (0.3 - n) / 0.25 * 100; }),
      user_speed: norm(speed, function (n) { return (50000 - n) / 48000 * 100; }),
      cache_hit_rate: norm(cache, function (n) { return (n - 0.65) / 0.27 * 100; }),
      success_rate: norm(rate, function (n) { return (n * 100 - 50) / 50 * 100; })
    };

    const tps = numOrNull(item.summary_tps);
    const tpsScore = tps === null ? 0 : clamp(tps, 0, 40) / 40 * 100;
    const tpsWeight = imageChart ? 0 : cfg.weights.tps;

    const baseKeys = RANK_METRICS.filter(function (k) { return k !== 'tps'; });
    const baseTotal = baseKeys.reduce(function (sum, k) { return sum + cfg.weights[k]; }, 0);
    const total = baseTotal + tpsWeight;
    if (!(total > 0)) return null;

    let score = (weightedScore(metrics, cfg.weights, baseKeys) * baseTotal + tpsScore * tpsWeight) / total;
    const detected = isDetected(item);
    const factor = detected ? 1 + cfg.detection_bonus_percent / 100 : 1;
    score *= factor;

    /* 原始值和归一化分都存一份：详情面板要显示“原始值 → 归一化 → 权重 → 贡献” */
    const raw = {
      success_rate: rate === null ? null : rate * 100,
      effective_price: price,
      user_speed: speed,
      cache_hit_rate: cache === null ? null : cache * 100,
      tps: tps,
      multiplier: mult
    };
    const norms = {
      success_rate: metrics.success_rate,
      effective_price: metrics.effective_price,
      user_speed: metrics.user_speed,
      cache_hit_rate: metrics.cache_hit_rate,
      tps: tps === null ? null : tpsScore,
      multiplier: metrics.multiplier
    };

    return {
      score: score,
      raw: raw,
      norms: norms,
      weights: cfg.weights,
      tpsWeight: tpsWeight,
      weightsTotal: total,
      factor: factor,
      detected: detected,
      imageChart: imageChart,
      custom: false,
      availability: availabilityOf(item),
      failover: item.hall_metrics ? item.hall_metrics.automatic_failover_enabled !== false : true,
      groupId: numOrNull(item.group_id)
    };
  }

  function scoreBand(score) {
    if (score >= 90) return 'a';
    if (score >= 75) return 'b';
    if (score >= 60) return 'c';
    return 'd';
  }

  /* 站点排序链：故障转移 → 可用性 → 综合分 → group_id。
     排名按同一平台内“大厅可见”的分组计算，优先级与站点一致 */
  function rankCompare(a, b) {
    if (a.failover !== b.failover) return a.failover ? -1 : 1;

    const ar = AVAILABILITY_ORDER[a.availability] === undefined ? 1 : AVAILABILITY_ORDER[a.availability];
    const br = AVAILABILITY_ORDER[b.availability] === undefined ? 1 : AVAILABILITY_ORDER[b.availability];
    if (ar !== br) return br - ar;

    if (a.score !== b.score) return b.score - a.score;

    const ag = a.groupId === null ? Number.MAX_SAFE_INTEGER : a.groupId;
    const bg = b.groupId === null ? Number.MAX_SAFE_INTEGER : b.groupId;
    return ag - bg;
  }

  function assignRanks(infos) {
    const byPlatform = new Map();

    for (let i = 0; i < infos.length; i++) {
      const info = infos[i];
      if (!info.visible) continue;
      const platform = info.platform || '';
      if (!byPlatform.has(platform)) byPlatform.set(platform, []);
      byPlatform.get(platform).push(info);
    }

    byPlatform.forEach(function (list, platform) {
      list.sort(rankCompare);
      for (let i = 0; i < list.length; i++) {
        list[i].rank = i + 1;
        list[i].rankTotal = list.length;
        list[i].rankPlatform = platform;
      }
    });
  }

  function computeScores() {
    scoreByCode = new Map();
    if (!providerPayload) return;

    const ranking = activeRanking();
    scoreSignature = JSON.stringify(ranking.cfg) + '|' + providerPayload.range;

    const scored = [];
    const items = providerPayload.items || [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const code = item && item.code;
      if (!code) continue;

      const info = scoreItem(item, ranking.cfg, providerPayload.range);
      if (!info) continue;
      info.custom = ranking.custom;
      info.range = providerPayload.range;
      info.platform = item.platform || '';
      info.visible = item.visible_in_hall !== false;
      scoreByCode.set(String(code), info);
      scored.push(info);
    }

    assignRanks(scored);
  }

  /* 只取 strong 里的直接文本节点，避免把徽标自身也算进名称 */
  function strongName(strong) {
    let name = '';
    const nodes = strong.childNodes;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].nodeType === 3) name += nodes[i].nodeValue;
    }
    return name.trim();
  }

  /* ===== 分数详情面板：悬停 180ms 打开，点击可钉住 ===== */
  const SCORE_METRIC_ROWS = [
    ['success_rate', '成功率'],
    ['effective_price', '有效价格'],
    ['user_speed', '速度'],
    ['cache_hit_rate', '缓存命中'],
    ['tps', 'TPS'],
    ['multiplier', '倍率']
  ];
  const HEALTH_TEXT = { healthy: '可用', failed: '异常', insufficient: '待监测' };
  const BAND_TEXT = { a: '优秀', b: '良好', c: '一般', d: '偏弱' };
  const PLATFORM_TEXT = { openai: 'OpenAI', deepseek: 'DeepSeek', zhipu: '智谱', kimi: 'Kimi', grok: 'Grok' };

  function platformName(platform) {
    if (!platform) return '当前';
    return PLATFORM_TEXT[platform] || platform;
  }

  let scorePanel = null;
  let scorePanelCode = null;
  let scorePanelAnchor = null;
  let scorePanelPinned = false;
  let scoreHideTimer = null;
  let scoreShowTimer = null;

  function rawTextOf(key, value) {
    if (value === null || value === undefined || !isFinite(value)) return '—';
    if (key === 'success_rate' || key === 'cache_hit_rate') return value.toFixed(2) + '%';
    if (key === 'user_speed') return (value / 1000).toFixed(2) + 's';
    if (key === 'effective_price') return '$' + value.toFixed(3) + '/M';
    if (key === 'multiplier') return value.toFixed(2) + '×';
    return value.toFixed(1);
  }

  function buildScorePanelHtml(info, bookmark) {
    const total = info.weightsTotal;
    const band = scoreBand(info.score);
    let rows = '';

    for (let i = 0; i < SCORE_METRIC_ROWS.length; i++) {
      const key = SCORE_METRIC_ROWS[i][0];
      const label = SCORE_METRIC_ROWS[i][1];
      const weight = key === 'tps' ? info.tpsWeight : info.weights[key];
      const normValue = info.norms[key];
      const contribution = normValue === null ? 0 : normValue * weight / total * info.factor;
      const normText = normValue === null ? '—' : normValue.toFixed(0);

      rows += '<div class="s012-sp-row' + (weight > 0 ? '' : ' s012-sp-off') + '">' +
        '<span class="s012-sp-k"><b>' + label + '</b><i>×' + weight + '</i></span>' +
        '<span class="s012-sp-raw">' + rawTextOf(key, info.raw[key]) + '</span>' +
        '<span class="s012-sp-meter">' +
          '<span class="s012-sp-bar"><i style="width:' + (normValue === null ? 0 : normValue) + '%"></i></span>' +
          '<em>' + normText + '</em>' +
        '</span>' +
        '<span class="s012-sp-contrib">' + (weight > 0 ? '+' + contribution.toFixed(1) : '—') + '</span>' +
        '</div>';
    }

    const scope = platformName(info.rankPlatform);
    const rankText = info.rank ? info.rank + ' / ' + info.rankTotal : '—';
    const rankTitle = scope + ' 平台内按「故障转移 → 可用性 → 综合分 → group_id」排序';

    const facts = '<div class="s012-sp-facts">' +
      '<span class="s012-sp-tag"><i>故障转移</i><b>' + (info.failover ? '开' : '关') + '</b></span>' +
      '<span class="s012-sp-tag"><i>可用性</i><b>' + (HEALTH_TEXT[info.availability] || '待监测') + '</b></span>' +
      '<span class="s012-sp-tag"><i>ID</i><b>' + (info.groupId === null ? '—' : info.groupId) + '</b></span>' +
      '<span class="s012-sp-tag"><i>收藏</i><b>' + (bookmark ? '是' : '否') + '</b></span>' +
      '</div>';

    return '<div class="s012-sp-head">' +
        '<span class="s012-sp-score" data-band="' + band + '">' + info.score.toFixed(1) + '</span>' +
        '<span class="s012-sp-band" data-band="' + band + '">' + BAND_TEXT[band] + '</span>' +
        '<span class="s012-sp-rank" title="' + rankTitle + '">第 ' + rankText + '</span>' +
        '<span class="s012-sp-src">' + (info.custom ? '自定义权重' : '站点权重') + ' · ' +
          (info.range || '1h') + '</span>' +
      '</div>' +
      '<div class="s012-sp-sub">' + scope + ' 平台综合分排名　·　排序链　故障转移 → 可用性 → 综合分 → group_id</div>' +
      facts +
      '<div class="s012-sp-cols"><span>指标</span><span>原始值</span><span>归一化</span><span>贡献</span></div>' +
      rows +
      '<div class="s012-sp-foot">总权重 ' + total +
        (info.imageChart ? '　·　图片模式不计速度与 TPS' : '') +
        (info.detected ? '　·　检测加成 ×' + info.factor.toFixed(2) : '') +
      '</div>' +
      '<div class="s012-sp-foot">贡献 = 归一化分 × 权重 ÷ 总权重' + (info.detected ? ' × 加成' : '') + '</div>';
  }

  function positionScorePanel() {
    if (!scorePanel || !scorePanelAnchor || !scorePanelAnchor.isConnected) return;

    const r = scorePanelAnchor.getBoundingClientRect();
    const w = scorePanel.offsetWidth;
    const h = scorePanel.offsetHeight;

    let left = r.right + 8;
    if (left + w > window.innerWidth - 8) left = Math.max(8, r.left - w - 8);

    let top = r.top;
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);

    scorePanel.style.left = left + 'px';
    scorePanel.style.top = top + 'px';
  }

  function getScorePanel() {
    if (scorePanel) return scorePanel;

    scorePanel = document.createElement('div');
    scorePanel.className = 's012-sp';
    scorePanel.addEventListener('mouseenter', cancelScoreHide);
    scorePanel.addEventListener('mouseleave', scheduleScoreHide);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hideScorePanel(true);
    }, true);

    document.addEventListener('mousedown', function (e) {
      if (!scorePanel || !scorePanel.isConnected) return;
      if (scorePanel.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.s012-score')) return;
      hideScorePanel(true);
    }, true);

    window.addEventListener('scroll', function () {
      if (scorePanel && scorePanel.isConnected) positionScorePanel();
    }, true);
    window.addEventListener('resize', function () {
      if (scorePanel && scorePanel.isConnected) positionScorePanel();
    });

    return scorePanel;
  }

  function showScorePanel(code, anchor) {
    const info = code ? scoreByCode.get(code) : null;
    if (!info || !anchor) return;

    clearTimeout(scoreHideTimer);

    const row = anchor.closest(CARD_SELECTOR);
    const bookmark = !!(row && row.querySelector('.bookmark-button[aria-pressed="true"]'));
    const panel = getScorePanel();

    panel.innerHTML = buildScorePanelHtml(info, bookmark);
    if (!panel.isConnected) document.body.appendChild(panel);

    scorePanelCode = code;
    scorePanelAnchor = anchor;
    positionScorePanel();
  }

  function cancelScoreHide() {
    clearTimeout(scoreHideTimer);
  }

  function scheduleScoreHide() {
    if (scorePanelPinned) return;
    clearTimeout(scoreHideTimer);
    scoreHideTimer = setTimeout(function () { hideScorePanel(); }, 220);
  }

  function hideScorePanel(force) {
    if (!scorePanel || !scorePanel.isConnected) return;
    if (scorePanelPinned && !force) return;
    scorePanel.remove();
    scorePanelPinned = false;
    scorePanelCode = null;
    scorePanelAnchor = null;
  }

  function onBadgeEnter(e) {
    const badge = e.currentTarget;
    cancelScoreHide();
    clearTimeout(scoreShowTimer);
    scoreShowTimer = setTimeout(function () {
      if (badge.isConnected) showScorePanel(badge.dataset.code, badge);
    }, 180);
  }

  function onBadgeClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const badge = e.currentTarget;
    const code = badge.dataset.code;

    if (scorePanel && scorePanel.isConnected && scorePanelCode === code && scorePanelPinned) {
      scorePanelPinned = false;
      hideScorePanel(true);
      return;
    }
    showScorePanel(code, badge);
    scorePanelPinned = true;
  }

  function onBadgeKey(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    onBadgeClick(e);
  }

  /* ===== 行内简版指标条：铺在卡片底部空白处，点击展开完整面板 ===== */
  const MINI_METRICS = [
    ['success_rate', '成功率'],
    ['effective_price', '价格'],
    ['user_speed', '速度'],
    ['cache_hit_rate', '缓存'],
    ['tps', 'TPS'],
    ['multiplier', '倍率']
  ];

  function miniTone(normValue) {
    if (normValue === null) return 'off';
    if (normValue >= 70) return 'good';
    if (normValue >= 40) return 'mid';
    return 'bad';
  }

  function buildMiniHtml(info) {
    let out = '';
    for (let i = 0; i < MINI_METRICS.length; i++) {
      const key = MINI_METRICS[i][0];
      const label = MINI_METRICS[i][1];
      const weight = key === 'tps' ? info.tpsWeight : info.weights[key];
      const normValue = info.norms[key];
      const scoreText = normValue === null ? '—' : String(Math.round(normValue));
      const hint = label + ' 得分 ' + scoreText + '（原始值 ' + rawTextOf(key, info.raw[key]) +
        '，权重 ' + weight + '）';

      out += '<span class="s012-mc" data-tone="' + miniTone(normValue) + '"' +
        (weight > 0 ? '' : ' data-off="1"') + ' title="' + hint + '">' +
        '<span class="s012-mc-k">' + label + '</span><b>' + scoreText + '</b></span>';
    }
    return out;
  }

  function paintMini(groupCell, code, info) {
    if (!groupCell) return;
    let mini = groupCell.querySelector('.s012-mini');

    if (!info) {
      if (mini) mini.remove();
      return;
    }

    if (!mini) {
      mini = document.createElement('div');
      mini.className = 's012-mini';
      mini.setAttribute('role', 'button');
      mini.setAttribute('tabindex', '0');
      mini.title = '点击查看完整评分拆解';
      mini.addEventListener('click', onMiniClick);
      mini.addEventListener('keydown', onBadgeKey);
      groupCell.appendChild(mini);
    }

    const html = buildMiniHtml(info);
    if (mini.dataset.sig !== html) {
      mini.innerHTML = html;
      mini.dataset.sig = html;
    }
    if (mini.dataset.code !== code) mini.dataset.code = code;
  }

  function onMiniClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const mini = e.currentTarget;
    const code = mini.dataset.code;
    const card = mini.closest(CARD_SELECTOR);
    const anchor = card ? card.querySelector('.s012-score') : null;

    if (scorePanel && scorePanel.isConnected && scorePanelCode === code && scorePanelPinned) {
      scorePanelPinned = false;
      hideScorePanel(true);
      return;
    }
    showScorePanel(code, anchor || mini);
    scorePanelPinned = true;
  }

  function paintScores() {
    if (!SHOW_SCORE || !scoreByCode.size) return;

    const strongs = document.querySelectorAll('.decision-row.ledger-row .group-cell strong');
    for (let i = 0; i < strongs.length; i++) {
      const strong = strongs[i];
      const name = strongName(strong);
      const info = name ? scoreByCode.get(name) : null;
      const groupCell = strong.parentElement;
      const row = strong.closest('.decision-row.ledger-row');
      const multiplierCell = row ? row.querySelector('.multiplier-cell') : null;
      const multiplierStrong = multiplierCell ? multiplierCell.querySelector('strong') : null;
      const badgeHost = multiplierStrong ? multiplierCell : groupCell;
      const badgeAnchor = multiplierStrong || strong;
      let badge = row ? row.querySelector('.s012-score') : groupCell.querySelector('.s012-score');

      if (!info) {
        if (badge) badge.remove();
        groupCell.classList.remove('s012-scored');
        paintMini(groupCell, null, null);
        continue;
      }

      /* 徽标放在倍率数值下方，避免撑高分组的名称/描述格 */
      if (badge && !badge.querySelector('.s012-score-sep')) {
        badge.remove();
        badge = null;
      }
      if (badge && (badge.parentElement !== badgeHost || badge.previousElementSibling !== badgeAnchor)) {
        badgeAnchor.insertAdjacentElement('afterend', badge);
      }

      const text = info.score.toFixed(1);
      const band = scoreBand(info.score);
      const rankText = info.rank ? '#' + info.rank : '';
      const label = '综合分 ' + text +
        (info.rank ? '，' + platformName(info.rankPlatform) + ' 平台排名第 ' + info.rank + '（共 ' + info.rankTotal + '）' : '');

      if (!badge) {
        badge = document.createElement('span');
        badge.className = 's012-score';
        badge.setAttribute('role', 'button');
        badge.setAttribute('tabindex', '0');
        badge.addEventListener('mouseenter', onBadgeEnter);
        badge.addEventListener('mouseleave', scheduleScoreHide);
        badge.addEventListener('click', onBadgeClick);
        badge.addEventListener('keydown', onBadgeKey);

        const rankEl = document.createElement('span');
        rankEl.className = 's012-score-rank';
        const sepEl = document.createElement('span');
        sepEl.className = 's012-score-sep';
        sepEl.textContent = '·';
        const numEl = document.createElement('span');
        numEl.className = 's012-score-num';
        badge.appendChild(rankEl);
        badge.appendChild(sepEl);
        badge.appendChild(numEl);

        badgeAnchor.insertAdjacentElement('afterend', badge);
      }
      groupCell.classList.add('s012-scored');

      const rankEl = badge.querySelector('.s012-score-rank');
      const sepEl = badge.querySelector('.s012-score-sep');
      const numEl = badge.querySelector('.s012-score-num');

      if (badge.dataset.code !== name) badge.dataset.code = name;
      if (rankEl) {
        if (rankEl.textContent !== rankText) rankEl.textContent = rankText;
        if (rankEl.hidden !== !rankText) rankEl.hidden = !rankText;
      }
      if (sepEl && sepEl.hidden !== !rankText) sepEl.hidden = !rankText;
      if (numEl && numEl.textContent !== text) numEl.textContent = text;
      if (badge.getAttribute('data-band') !== band) badge.setAttribute('data-band', band);
      if (badge.getAttribute('aria-label') !== label) badge.setAttribute('aria-label', label);

      paintMini(groupCell, name, info);
    }

    /* Vue 重渲染可能换掉徽标节点，把打开中的面板重新挂到新节点上 */
    if (scorePanel && scorePanel.isConnected && scorePanelCode) {
      const fresh = document.querySelectorAll('.s012-score[data-code]');
      let anchor = null;
      for (let j = 0; j < fresh.length; j++) {
        if (fresh[j].dataset.code === scorePanelCode && fresh[j].isConnected) {
          anchor = fresh[j];
          break;
        }
      }
      if (anchor) {
        scorePanelAnchor = anchor;
        positionScorePanel();
      } else {
        hideScorePanel(true);
      }
    }
  }

  function refreshScores() {
    if (!SHOW_SCORE) return;
    if (providerPayload) {
      const signature = JSON.stringify(activeRanking().cfg) + '|' + providerPayload.range;
      if (signature !== scoreSignature) computeScores();
    }
    paintScores();
  }

  /* 只留下算分 / 详情面板需要的字段：4MB 的原始响应对象没必要整棵留着 */
  function slimItem(item) {
    const hall = item.hall_metrics;
    const cards = Array.isArray(item.model_cards) ? item.model_cards : [];
    return {
      code: item.code,
      group_id: item.group_id,
      platform: item.platform,
      visible_in_hall: item.visible_in_hall,
      rate_multiplier: item.rate_multiplier,
      summary_range: item.summary_range,
      effective_input_price_per_million: item.effective_input_price_per_million,
      effective_input_price_per_million_1h: item.effective_input_price_per_million_1h,
      runtime_trimmed_avg_has_data: item.runtime_trimmed_avg_has_data,
      runtime_trimmed_avg_sample_count: item.runtime_trimmed_avg_sample_count,
      runtime_trimmed_avg_ttft_ms: item.runtime_trimmed_avg_ttft_ms,
      runtime_cache_1h: item.runtime_cache_1h,
      range_cache: item.range_cache,
      success_rates: item.success_rates,
      sla: item.sla,
      summary_tps: item.summary_tps,
      model_detection: item.model_detection,
      detections_enabled: item.detections_enabled,
      probe_state: item.probe_state,
      probe_skipped: item.probe_skipped,
      model_cards: cards.map(function (c) {
        return { health: c && c.health, probe_state: c && c.probe_state };
      }),
      hall_metrics: hall ? {
        chart: { image: !!(hall.chart && hall.chart.image) },
        automatic_failover_enabled: hall.automatic_failover_enabled
      } : null
    };
  }

  function captureProviders(xhr, url) {
    if (!xhr || xhr.status !== 200) return;

    let json;
    try { json = JSON.parse(xhr.responseText); } catch (e) { return; }

    const data = json && json.data;
    if (!data || !Array.isArray(data.items)) return;

    providerPayload = {
      items: data.items.map(slimItem),
      ranking: data.display_ranking,
      range: (url && url.searchParams.get('range')) || '1h'
    };
    computeScores();
    paintScores();
  }

  /* 极少数情况下脚本晚于首屏请求注入，补拉一次（只在没抓到数据时才发） */
  function ensureProviderPayload() {
    if (!SHOW_SCORE || providerPayload || providerFallbackTried) return;
    if (!document.querySelector(CARD_SELECTOR)) return;
    providerFallbackTried = true;

    let timezone = 'UTC';
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { /* 忽略 */ }

    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/v2/public/providers?range=1h&include_media=false&timezone=' +
      encodeURIComponent(timezone), true);
    xhr.send();
  }

  /* ============ 监测接口分批（解决每页 >50 时报“加载监测数据失败”） ============ */
  /* 站点在拉取曲线 / 媒体时会把“当前页所有分组 id”一次性传给：
       GET /api/v2/public/providers/series?range=..&group_ids=a,b,c
       GET /api/v2/public/providers/media?group_ids=a,b,c
     服务端限制 group_ids 最多 50 个，超过直接 400，
     前端就显示“加载监测数据失败”。这里把超长请求拆成每批 50 个，
     再把多批 JSON 合并成一个响应交给页面。 */
  const MONITOR_ID_LIMIT = 50;

  function installMonitorBatcher() {
    if (window.__s012MonitorBatcher) return;
    window.__s012MonitorBatcher = true;

    const nativeOpen = XMLHttpRequest.prototype.open;
    const nativeSend = XMLHttpRequest.prototype.send;
    const nativeSetHeader = XMLHttpRequest.prototype.setRequestHeader;

    function buildBatchUrl(base, ids) {
      const u = new URL(base, location.href);
      u.searchParams.set('group_ids', ids.join(','));
      return u.toString();
    }

    function fetchBatch(url, headers, bucket, withCredentials) {
      return new Promise(function (resolve, reject) {
        const x = new XMLHttpRequest();
        bucket.push(x);
        nativeOpen.call(x, 'GET', url, true);
        for (const k in headers) {
          try { nativeSetHeader.call(x, k, headers[k]); } catch (e) { /* 忽略非法头 */ }
        }
        /* 站点 axios 实例是 withCredentials: true，分批请求必须保持一致，
           否则可能丢掉 cookie / 鉴权信息 */
        if (withCredentials) x.withCredentials = true;
        x.timeout = 30000;
        x.onload = function () {
          if (x.status >= 200 && x.status < 300) {
            try { resolve(JSON.parse(x.responseText)); }
            catch (e) { reject(e); }
          } else {
            reject(new Error('HTTP ' + x.status));
          }
        };
        x.onerror = function () { reject(new Error('network error')); };
        x.ontimeout = function () { reject(new Error('timeout')); };
        x.onabort = function () { reject(new Error('aborted')); };
        nativeSend.call(x, null);
      });
    }

    /* 各批响应结构一致：{ code, message, data: { items: [...] } }，
       合并时 items 拼起来，其余顶层字段沿用第一批，stale 取“或” */
    function mergeBatches(list) {
      const first = (list[0] || {}).data ? list[0] : { code: 0, message: 'success', data: {} };
      const merged = {
        code: first.code === undefined ? 0 : first.code,
        message: first.message || 'success',
        data: Object.assign({}, first.data || {})
      };
      const items = [];
      let stale = !!(first.data && first.data.stale);

      for (let i = 0; i < list.length; i++) {
        const data = list[i] && list[i].data;
        if (!data) continue;
        if (data.stale) stale = true;
        if (Array.isArray(data.items)) {
          for (let j = 0; j < data.items.length; j++) items.push(data.items[j]);
        }
      }

      merged.data.items = items;
      if (stale) merged.data.stale = true;
      return merged;
    }

    /* 把合并结果写成这个 XHR 的“响应”，并触发 axios 注册的 onloadend */
    function reply(xhr, status, text) {
      try {
        Object.defineProperty(xhr, 'status', { configurable: true, get: function () { return status; } });
        Object.defineProperty(xhr, 'statusText', { configurable: true, get: function () { return status === 200 ? 'OK' : 'Error'; } });
        Object.defineProperty(xhr, 'readyState', { configurable: true, get: function () { return 4; } });
        Object.defineProperty(xhr, 'responseText', { configurable: true, get: function () { return text; } });
        Object.defineProperty(xhr, 'response', {
          configurable: true,
          get: function () {
            if (xhr.responseType === 'json') {
              try { return JSON.parse(text); } catch (e) { return null; }
            }
            return text;
          }
        });
      } catch (e) {
        return;
      }

      xhr.getAllResponseHeaders = function () { return 'content-type: application/json\r\n'; };
      xhr.getResponseHeader = function (name) {
        return String(name).toLowerCase() === 'content-type' ? 'application/json' : null;
      };

      if (typeof xhr.onloadend === 'function') {
        xhr.onloadend(new Event('loadend'));
      } else if (typeof xhr.onreadystatechange === 'function') {
        xhr.onreadystatechange(new Event('readystatechange'));
      }
    }

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__s012Url = url;
      this.__s012Headers = {};
      return nativeOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
      try {
        (this.__s012Headers || (this.__s012Headers = {}))[name] = value;
      } catch (e) { /* 忽略 */ }
      return nativeSetHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      const self = this;
      const rawUrl = self.__s012Url;
      if (!rawUrl) return nativeSend.apply(self, arguments);

      let parsed;
      try { parsed = new URL(rawUrl, location.href); } catch (e) { return nativeSend.apply(self, arguments); }

      /* 分组列表接口：只旁听，用来算综合分 */
      if (/\/public\/providers$/.test(parsed.pathname)) {
        self.addEventListener('load', function () { captureProviders(self, parsed); });
        return nativeSend.apply(self, arguments);
      }

      if (!/(^|\/)public\/providers\/(series|media)$/.test(parsed.pathname)) {
        return nativeSend.apply(self, arguments);
      }

      const rawIds = parsed.searchParams.get('group_ids');
      if (!rawIds) return nativeSend.apply(self, arguments);

      const ids = rawIds.split(',').filter(function (v) { return !!v; });
      if (ids.length <= MONITOR_ID_LIMIT) return nativeSend.apply(self, arguments);

      const batches = [];
      for (let i = 0; i < ids.length; i += MONITOR_ID_LIMIT) {
        batches.push(ids.slice(i, i + MONITOR_ID_LIMIT));
      }

      const chunkXhrs = [];
      let done = false;
      let timer = null;

      function finish(status, text) {
        if (done) return;
        done = true;
        if (timer !== null) clearTimeout(timer);
        reply(self, status, text);
      }

      /* 页面取消/超时时会让 axios 调 abort()，顺手把没跑完的分批也停掉 */
      self.abort = function () {
        for (let i = 0; i < chunkXhrs.length; i++) {
          try { chunkXhrs[i].abort(); } catch (e) { /* 忽略 */ }
        }
      };

      /* 外层 XHR 没真正发出去，原生 30s 超时不会触发，这里自己兜一个 */
      timer = setTimeout(function () {
        self.abort();
        finish(500, JSON.stringify({ code: 500, message: 'monitor batch timeout' }));
      }, 30000);

      Promise.all(batches.map(function (part) {
        return fetchBatch(buildBatchUrl(parsed.toString(), part), self.__s012Headers || {}, chunkXhrs, self.withCredentials);
      })).then(function (list) {
        const first = list[0];
        if (first && first.code !== undefined && first.code !== 0) {
          finish(200, JSON.stringify(first));
          return;
        }
        finish(200, JSON.stringify(mergeBatches(list)));
      }).catch(function () {
        finish(500, JSON.stringify({ code: 500, message: 'monitor batch failed' }));
      });
    };
  }

  installMonitorBatcher();

  /* =================== 每页数量配置（/providers） =================== */
  const PAGE_SELECT_LABEL = 'Page size';
  const CONFIG_KEY = 'aihub-page-size-config';

  function normalizeSizes(list) {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const n = Math.floor(Number(list[i]));
      if (isFinite(n) && n > 0 && out.indexOf(n) === -1) out.push(n);
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  function loadConfig() {
    const fallback = {
      sizes: PAGE_SIZE_DEFAULTS.sizes.slice(),
      default: PAGE_SIZE_DEFAULTS.default
    };
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return fallback;

      const obj = JSON.parse(raw) || {};
      const sizes = normalizeSizes(obj.sizes || []);
      if (!sizes.length) return fallback;

      let def = Math.floor(Number(obj.default));
      if (!isFinite(def) || def <= 0) def = sizes[0];
      if (sizes.indexOf(def) === -1) {
        sizes.push(def);
        sizes.sort(function (a, b) { return a - b; });
      }
      return { sizes: sizes, default: def };
    } catch (e) {
      return fallback;
    }
  }

  function saveConfig(cfg) {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    } catch (e) { /* 隐私模式下 localStorage 可能不可用，忽略即可 */ }
  }

  let config = loadConfig();
  let preferredPageSize = config.default;   // 当前希望生效的每页数量

  /* 站点用的是原生 <select aria-label="Page size">。
     找不到 aria-label 时，用“数值型选项”兜底 */
  function isPageSizeSelect(el) {
    if (!el || el.tagName !== 'SELECT') return false;
    if (el.getAttribute('aria-label') === PAGE_SELECT_LABEL) return true;

    const vals = Array.prototype.map.call(el.options, function (o) { return o.value; });
    if (vals.length < 2) return false;
    for (let i = 0; i < vals.length; i++) {
      if (!/^\d+$/.test(vals[i])) return false;
    }
    return true;
  }

  function findPageSizeSelect() {
    const list = document.querySelectorAll('select');
    for (let i = 0; i < list.length; i++) {
      if (isPageSizeSelect(list[i])) return list[i];
    }
    return null;
  }

  /* 让下拉框的选项与配置完全一致（幂等）：删掉不在配置里的、补上缺的、按数字升序 */
  function syncOptions(sel) {
    const wanted = config.sizes.map(String);
    let changed = false;

    Array.prototype.slice.call(sel.options).forEach(function (o) {
      if (wanted.indexOf(o.value) === -1) {
        sel.removeChild(o);
        changed = true;
      }
    });

    for (let i = 0; i < wanted.length; i++) {
      const exists = Array.prototype.some.call(sel.options, function (o) { return o.value === wanted[i]; });
      if (!exists) {
        const opt = document.createElement('option');
        opt.value = wanted[i];
        opt.textContent = wanted[i];
        sel.appendChild(opt);
        changed = true;
      }
    }

    if (changed) {
      Array.prototype.slice.call(sel.options)
        .sort(function (a, b) { return Number(a.value) - Number(b.value); })
        .forEach(function (o) { sel.appendChild(o); });
    }
  }

  function applyPageSize(sel) {
    if (!sel) return;
    syncOptions(sel);

    const want = String(preferredPageSize);
    if (sel.value === want) return;

    sel.value = want;
    /* Vue 的 v-model 监听 change，部分实现监听 input，两个都发一遍 */
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));

    /* 兜底：如果站点自身有上限把值改了回去，就跟随站点的真实值，
       避免下拉框显示 100 而列表仍是 50 的错位 */
    setTimeout(function () {
      if (!sel.isConnected) return;
      const actual = parseInt(sel.value, 10);
      if (actual && actual !== Number(want) && config.sizes.indexOf(actual) !== -1) {
        preferredPageSize = actual;
      }
    }, 500);
  }

  function syncPageSize() {
    applyPageSize(findPageSizeSelect());
  }

  /* 记住用户自己的选择（包括手动切到 10/200），不要跟用户抢 */
  document.addEventListener('change', function (e) {
    const sel = e.target;
    if (!isPageSizeSelect(sel)) return;
    const n = parseInt(sel.value, 10);
    if (config.sizes.indexOf(n) !== -1) preferredPageSize = n;
  }, true);

  /* =================== 每页数量设置面板 =================== */
  const GEAR_SVG =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="3"></circle>' +
    '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>' +
    '</svg>';

  let panelEl = null;

  function closePanel() {
    if (!panelEl) return;
    panelEl.remove();
    panelEl = null;
    document.removeEventListener('mousedown', onDocMouseDown, true);
    document.removeEventListener('keydown', onDocKeyDown, true);
  }

  function onDocMouseDown(e) {
    if (!panelEl) return;
    if (panelEl.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.s012-ps-btn')) return;
    closePanel();
  }

  function onDocKeyDown(e) {
    if (e.key === 'Escape') closePanel();
  }

  function openPanel(anchor) {
    closePanel();

    panelEl = document.createElement('div');
    panelEl.className = 's012-ps-panel';
    panelEl.innerHTML =
      '<h4>每页数量设置</h4>' +
      '<div class="s012-ps-row">' +
      '<label>可选档位（逗号分隔）</label>' +
      '<input class="s012-ps-sizes" type="text" spellcheck="false" placeholder="10,20,50,100,200">' +
      '</div>' +
      '<div class="s012-ps-row">' +
      '<label>默认档位（打开页面时选中）</label>' +
      '<input class="s012-ps-default" type="text" inputmode="numeric" spellcheck="false" placeholder="50">' +
      '</div>' +
      '<div class="s012-ps-hint"></div>' +
      '<div class="s012-ps-actions">' +
      '<button type="button" class="s012-ps-reset">恢复默认</button>' +
      '<button type="button" class="s012-ps-cancel">取消</button>' +
      '<button type="button" class="s012-ps-primary s012-ps-save">保存</button>' +
      '</div>';

    const sizesInput = panelEl.querySelector('.s012-ps-sizes');
    const defInput = panelEl.querySelector('.s012-ps-default');
    const hint = panelEl.querySelector('.s012-ps-hint');

    sizesInput.value = config.sizes.join(',');
    defInput.value = String(config.default);

    panelEl.querySelector('.s012-ps-cancel').addEventListener('click', closePanel);

    panelEl.querySelector('.s012-ps-reset').addEventListener('click', function () {
      sizesInput.value = PAGE_SIZE_DEFAULTS.sizes.join(',');
      defInput.value = String(PAGE_SIZE_DEFAULTS.default);
      hint.textContent = '已填入默认值，点“保存”生效';
    });

    panelEl.querySelector('.s012-ps-save').addEventListener('click', function () {
      const sizes = normalizeSizes(sizesInput.value.split(/[,，\s]+/));
      if (!sizes.length) {
        hint.textContent = '至少填写一个正整数档位';
        return;
      }

      let def = Math.floor(Number(defInput.value));
      if (!isFinite(def) || def <= 0) {
        hint.textContent = '默认档位请填写正整数';
        return;
      }

      if (sizes.indexOf(def) === -1) {
        sizes.push(def);
        sizes.sort(function (a, b) { return a - b; });
      }

      config = { sizes: sizes, default: def };
      saveConfig(config);
      preferredPageSize = def;

      closePanel();
      run();
    });

    sizesInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') panelEl.querySelector('.s012-ps-save').click();
    });
    defInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') panelEl.querySelector('.s012-ps-save').click();
    });

    document.body.appendChild(panelEl);

    /* 贴着齿轮按钮弹出，空间不够就翻到上方 / 往左收 */
    const r = anchor.getBoundingClientRect();
    const w = panelEl.offsetWidth;
    const h = panelEl.offsetHeight;
    let left = Math.min(r.left, window.innerWidth - w - 8);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    panelEl.style.left = Math.max(8, left) + 'px';
    panelEl.style.top = top + 'px';

    /* 延后一拍再挂外部点击监听，避免这次点击立刻把面板关掉 */
    setTimeout(function () {
      document.addEventListener('mousedown', onDocMouseDown, true);
      document.addEventListener('keydown', onDocKeyDown, true);
    }, 0);

    sizesInput.focus();
    sizesInput.select();
  }

  /* 在下拉框后面插一个齿轮按钮；站点重渲染把按钮抹掉时会自动补回 */
  function ensureSettingsButton() {
    const sel = findPageSizeSelect();
    const existing = document.querySelector('.s012-ps-btn');

    if (!sel) {
      if (existing) existing.remove();
      return;
    }
    if (existing) {
      if (existing.parentElement === sel.parentElement) return;
      existing.remove();
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 's012-ps-btn';
    btn.title = '每页数量设置';
    btn.setAttribute('aria-label', '每页数量设置');
    btn.innerHTML = GEAR_SVG;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openPanel(btn);
    });

    sel.insertAdjacentElement('afterend', btn);
  }

  /* ======================= 启动与监听 ======================= */
  function run() {
    syncPageSize();
    ensureSettingsButton();
    mark();
    refreshScores();
  }

  /* 监听 SPA 动态渲染：翻页 / 定时刷新 / 排序 / 点击展开，
     React 可能只重置 class 属性（不改变子树），所以必须同时监听 class */
  let pending = false;
  function scheduleMark() {
    if (pending) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      run();
    }, 150);
  }

  const mo = new MutationObserver(scheduleMark);
  function start() {
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  if (document.body) {
    start();
    run();
    /* 首屏可能晚于脚本挂载，补几次，保证默认值一定生效 */
    [150, 500, 1200].forEach(function (d) { setTimeout(run, d); });
    setTimeout(ensureProviderPayload, 4000);
  } else {
    new MutationObserver(function (_, obs) {
      if (document.body) {
        obs.disconnect();
        start();
        run();
        [150, 500, 1200].forEach(function (d) { setTimeout(run, d); });
        setTimeout(ensureProviderPayload, 4000);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
