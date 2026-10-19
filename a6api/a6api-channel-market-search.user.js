// ==UserScript==
// @name         A6API 渠道名称 → 市场自动搜索
// @namespace    https://a6api.com/
// @version      1.4.0
// @description  在渠道管理页提供查市场/后台查快捷按钮并自动同步渠道；在市场页提供快捷渠道抽屉面板，支持一键切换搜索渠道与自定义渠道管理
// @match        https://a6api.com/*
// @grant        GM_openInTab
// @grant        GM.openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM.setValue
// @grant        GM.getValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  var MARKET_BASE = 'https://a6api.com/';
  var STORAGE_KEY_OWNED = 'a6_owned_channels';
  var STORAGE_KEY_CUSTOM = 'a6_custom_channels';
  var STORAGE_KEY_REMARKS = 'a6_channel_remarks';
  var STORAGE_KEY_DRAWER_OPEN = 'a6_drawer_open';
  var STORAGE_KEY_DRAWER_SIDE = 'a6_drawer_side';
  /* ================= 通用本地存储 (GM API 优先，localStorage 兜底) ================= */

  function storageGet(key, fallback) {
    try {
      if (typeof GM_getValue === 'function') {
        var v = GM_getValue(key);
        if (v !== undefined && v !== null) {
          if (typeof v === 'string') {
            try {
              return JSON.parse(v);
            } catch (e) {
              return v;
            }
          }
          return v;
        }
      }
    } catch (e) {}
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        var raw = localStorage.getItem(key);
        if (raw !== null && raw !== undefined) {
          try {
            return JSON.parse(raw);
          } catch (e) {
            return raw;
          }
        }
      }
    } catch (e) {}
    return fallback;
  }

  function storageSet(key, val) {
    var payload = JSON.stringify(val);
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, payload);
        return;
      }
    } catch (e) {}
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        localStorage.setItem(key, payload);
      }
    } catch (e) {}
  }

  function getChannelRemark(id) {
    if (!id) return '';
    var remarks = storageGet(STORAGE_KEY_REMARKS, {});
    return remarks[String(id)] || '';
  }

  function setChannelRemark(id, remark) {
    if (!id) return;
    var remarks = storageGet(STORAGE_KEY_REMARKS, {});
    if (remark && remark.trim()) {
      remarks[String(id)] = remark.trim();
    } else {
      delete remarks[String(id)];
    }
    storageSet(STORAGE_KEY_REMARKS, remarks);
  }

  function fetchChannelInfo(cid, cb) {
    if (!cid) return cb(null);
    var targetId = String(cid).trim();
    // 1) 优先从已同步的商户自有渠道缓存匹配
    var owned = storageGet(STORAGE_KEY_OWNED, {});
    if (owned[targetId]) {
      var item = owned[targetId];
      return cb({
        name: item.name || '',
        desc: item.desc || '',
        remark: getChannelRemark(targetId),
      });
    }

    // 2) 检查已有的自定义渠道与备注
    var custom = storageGet(STORAGE_KEY_CUSTOM, []);
    for (var i = 0; i < custom.length; i++) {
      if (String(custom[i].id) === targetId) {
        return cb({
          name: custom[i].name || '',
          desc: custom[i].desc || '',
          remark: getChannelRemark(targetId),
        });
      }
    }

    // 3) 若在市场页，尝试从已渲染的市场卡片 DOM 中检索
    var allCards = document.querySelectorAll('.ui-card, .market-card, [class*="card"]');
    for (var k = 0; k < allCards.length; k++) {
      var card = allCards[k];
      var txt = card.textContent || '';
      if (txt.indexOf(targetId) !== -1) {
        var nameEl = card.querySelector('.name, .title, [class*="name"], [class*="title"], h3, h4');
        var descEl = card.querySelector('.desc, [class*="desc"]');
        var foundName = nameEl ? (nameEl.textContent || '').trim() : '';
        var foundDesc = descEl ? (descEl.textContent || '').trim() : '';
        if (foundName || foundDesc) {
          return cb({
            name: foundName,
            desc: foundDesc,
            remark: getChannelRemark(targetId),
          });
        }
      }
    }

    return cb({
      name: '',
      desc: '',
      remark: getChannelRemark(targetId),
    });
  }

  /* ========== 样式定义（包含渠道管理按钮与市场页快捷渠道抽屉） ========== */
  (function () {
    var st = document.getElementById('a6jump-style');
    if (!st) {
      st = document.createElement('style');
      st.id = 'a6jump-style';
      (document.head || document.documentElement).appendChild(st);
    }
    st.textContent =
      /* 渠道管理页按钮样式 */
      '.a6jump-wrap{display:inline-flex;align-items:center;vertical-align:middle;margin-left:8px;gap:6px;}' +
      '.a6jump-btn{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;' +
      'height:24px;padding:0 10px;font-size:12px;line-height:1;font-weight:500;' +
      'color:#27272a;background:#f4f4f5;border:1px solid #e4e4e7;border-radius:6px;cursor:pointer;' +
      'white-space:nowrap;user-select:none;transition:all .15s ease;}' +
      '.a6jump-btn:hover{color:#1677ff;background:rgba(22,119,255,.08);border-color:rgba(22,119,255,.45);}' +
      '.a6jump-btn:active{transform:translateY(1px);}' +

      /* 市场页快捷抽屉浮动触发按钮 */
      '.a6-drawer-trigger{position:fixed;top:50%;transform:translateY(-50%);z-index:9999;' +
      'background:#1677ff;color:#ffffff;padding:10px 8px;cursor:pointer;' +
      'font-size:13px;font-weight:500;' +
      'display:flex;align-items:center;writing-mode:vertical-rl;letter-spacing:2px;user-select:none;transition:all .2s ease;}' +
      '.a6-drawer-trigger.is-side-right{right:0;left:auto;border-radius:8px 0 0 8px;box-shadow:-2px 2px 10px rgba(22,119,255,.35);}' +
      '.a6-drawer-trigger.is-side-left{left:0;right:auto;border-radius:0 8px 8px 0;box-shadow:2px 2px 10px rgba(22,119,255,.35);}' +
      '.a6-drawer-trigger.is-side-right:hover{background:#4096ff;padding-right:11px;}' +
      '.a6-drawer-trigger.is-side-left:hover{background:#4096ff;padding-left:11px;}' +
      '.a6-drawer-trigger.is-hidden{display:none !important;}' +

      /* 抽屉面板（占据页面 80% 高度，上下各留白 10%） */
      '.a6-drawer-panel{position:fixed;top:10vh;bottom:10vh;height:80vh;width:300px;max-width:calc(100vw - 32px);' +
      'background:#ffffff;box-shadow:0 8px 30px rgba(0,0,0,.16);z-index:10000;display:flex;flex-direction:column;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;box-sizing:border-box;' +
      'border:1px solid #e4e4e7;overflow:hidden;transition:transform .25s cubic-bezier(0.16,1,0.3,1);}' +
      '.a6-drawer-panel.is-side-right{right:0;left:auto;border-radius:10px 0 0 10px;border-right:none;transform:translateX(100%);}' +
      '.a6-drawer-panel.is-side-left{left:0;right:auto;border-radius:0 10px 10px 0;border-left:none;transform:translateX(-100%);}' +
      '.a6-drawer-panel.is-open{transform:translateX(0) !important;}' +

      /* 抽屉头部与操作按钮 */
      '.a6-drawer-header{flex-shrink:0;padding:12px 14px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;justify-content:space-between;background:#fafafa;}' +
      '.a6-drawer-title-wrap{display:flex;align-items:center;gap:6px;}' +
      '.a6-drawer-title{font-size:14px;font-weight:600;color:#1f2937;}' +
      '.a6-drawer-count{font-size:11px;background:#e5e7eb;color:#4b5563;padding:1px 6px;border-radius:10px;font-weight:600;}' +
      '.a6-drawer-actions{display:flex;align-items:center;gap:6px;}' +
      '.a6-drawer-tool-btn{background:#f4f4f5;border:1px solid #e4e4e7;color:#52525b;font-size:11px;padding:2px 6px;border-radius:4px;cursor:pointer;line-height:1.2;transition:all .15s ease;}' +
      '.a6-drawer-tool-btn:hover{color:#1677ff;background:rgba(22,119,255,.08);border-color:rgba(22,119,255,.45);}' +
      '.a6-drawer-close{background:none;border:none;color:#9ca3af;font-size:16px;line-height:1;cursor:pointer;padding:2px 4px;border-radius:4px;}' +
      '.a6-drawer-close:hover{color:#374151;background:#e5e7eb;}' +
      /* 抽屉顶部快捷操作工具栏 */
      '.a6-drawer-toolbar{flex-shrink:0;display:flex;gap:8px;padding:8px 14px;background:#fafafa;border-bottom:1px solid #f0f0f0;box-sizing:border-box;}' +
      '.a6-toolbar-btn{flex:1;height:26px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:500;color:#374151;background:#ffffff;border:1px solid #d1d5db;border-radius:5px;cursor:pointer;white-space:nowrap;user-select:none;transition:all .15s ease;}' +
      '.a6-toolbar-btn:hover{color:#1677ff;border-color:rgba(22,119,255,.45);background:rgba(22,119,255,.08);}' +
      '.a6-toolbar-btn:active{transform:translateY(1px);}' +
      /* 抽屉内容区（填满 80vh 剩余高度 + 独立平滑滚动条） */
      '.a6-drawer-content{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;padding:10px 14px;}' +
      '.a6-drawer-content::-webkit-scrollbar{width:5px;}' +
      '.a6-drawer-content::-webkit-scrollbar-track{background:transparent;}' +
      '.a6-drawer-content::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px;}' +
      '.a6-drawer-content::-webkit-scrollbar-thumb:hover{background:#94a3b8;}' +
      '.a6-section-header{display:flex;align-items:center;justify-content:space-between;margin:14px 0 8px;}' +
      '.a6-section-header:first-child{margin-top:0;}' +
      '.a6-section-title{font-size:12px;font-weight:600;color:#6b7280;}' +
      '.a6-btn-link{font-size:12px;color:#1677ff;background:none;border:none;cursor:pointer;padding:0;font-weight:500;}' +
      '.a6-btn-link:hover{text-decoration:underline;}' +

      /* 渠道卡片（双行） */
      '.a6-card{background:#ffffff;border:1px solid #e5e7eb;border-radius:6px;padding:9px 12px;margin-bottom:8px;cursor:pointer;transition:all .15s ease;user-select:none;}' +
      '.a6-card:hover{background:#f8fafc;border-color:#cbd5e1;}' +
      '.a6-card.active{background:#eff6ff;border-color:#1677ff;box-shadow:0 0 0 1px #1677ff;}' +
      '.a6-card-row1{display:flex;align-items:center;justify-content:space-between;gap:8px;}' +
      '.a6-card-name{font-size:13px;font-weight:600;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.a6-card.active .a6-card-name{color:#1677ff;}' +
      '.a6-card-badges{display:inline-flex;align-items:center;gap:6px;flex-shrink:0;}' +
      '.a6-card-id{font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;background:#f1f5f9;color:#64748b;padding:2px 6px;border-radius:4px;}' +
      '.a6-card-del{background:none;border:none;color:#94a3b8;font-size:13px;line-height:1;padding:2px 4px;cursor:pointer;border-radius:3px;}' +
      '.a6-card-del:hover{color:#ef4444;background:#fee2e2;}' +
      '.a6-card-btn-icon{background:none;border:none;color:#94a3b8;font-size:12px;line-height:1;padding:2px 3px;cursor:pointer;border-radius:3px;}' +
      '.a6-card-btn-icon:hover{color:#1677ff;background:rgba(22,119,255,.1);}' +
      '.a6-card-desc{font-size:12px;color:#64748b;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.a6-card-remark{font-size:11px;color:#0284c7;background:#f0f9ff;border:1px solid #bae6fd;border-radius:4px;padding:2px 6px;margin-top:5px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.a6-card-editbox{margin-top:6px;display:flex;flex-direction:column;gap:6px;padding:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:5px;}' +
      '.a6-empty-tip{padding:12px;text-align:center;font-size:12px;color:#94a3b8;background:#f8fafc;border:1px dashed #e2e8f0;border-radius:6px;line-height:1.6;}' +
      '.a6-id-row{display:flex;gap:6px;align-items:center;}' +
      '.a6-input-sm{height:24px;font-size:11px;padding:2px 6px;}' +
      /* 添加表单 */
      '.a6-add-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px;margin-bottom:10px;display:flex;flex-direction:column;gap:8px;}' +
      '.a6-input{box-sizing:border-box;width:100%;height:28px;padding:4px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;outline:none;background:#fff;color:#1f2937;}' +
      '.a6-input:focus{border-color:#1677ff;box-shadow:0 0 0 1px #1677ff;}' +
      '.a6-form-actions{display:flex;justify-content:flex-end;gap:6px;}' +
      '.a6-btn-sm{height:24px;padding:0 10px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid transparent;}' +
      '.a6-btn-primary{background:#1677ff;color:#fff;}' +
      '.a6-btn-primary:hover{background:#4096ff;}' +
      '.a6-btn-default{background:#fff;border-color:#d1d5db;color:#374151;}' +
      '.a6-btn-default:hover{background:#f3f4f6;}' +
      /* 市场模型列表自选渠道高亮（金黄发光轮廓 + 金黄文字 + 浅金微光） */
      '.a6-market-highlight{box-shadow:0 0 0 1px #f59e0b, 0 0 8px rgba(245,158,11,.25) !important;background:rgba(245,158,11,.05) !important;position:relative;z-index:2;border-radius:6px;}' +
      '.a6-market-highlight td{background:transparent !important;}' +
      '.a6-market-highlight td:first-child, .a6-market-highlight td:first-child *{color:#f59e0b !important;}' +
      /* 暗色模式适配（同时支持系统 prefers-color-scheme 与页面 .dark / [data-theme="dark"]） */
      '@media (prefers-color-scheme:dark){' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-panel.is-side-right{background:#18181b;box-shadow:0 8px 24px rgba(0,0,0,.45);border-color:#3f3f46;border-right:none;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-panel.is-side-left{background:#18181b;box-shadow:0 8px 24px rgba(0,0,0,.45);border-color:#3f3f46;border-left:none;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-header{background:#27272a;border-color:#3f3f46;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-title{color:#fafafa;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-tool-btn{background:#27272a;border-color:#3f3f46;color:#a1a1aa;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-tool-btn:hover{color:#60a5fa;border-color:#60a5fa;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-toolbar{background:#27272a;border-color:#3f3f46;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-toolbar-btn{background:#18181b;border-color:#3f3f46;color:#d4d4d8;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-toolbar-btn:hover{background:#27272a;border-color:#60a5fa;color:#60a5fa;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-card{background:#27272a;border-color:#3f3f46;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-card:hover{background:#3f3f46;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-card.active{background:rgba(22,119,255,.18);border-color:#1677ff;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-card-name{color:#f4f4f5;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-card-desc{color:#a1a1aa;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-card-remark{background:#082f49;color:#7dd3fc;border-color:#0369a1;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-card-editbox{background:#18181b;border-color:#3f3f46;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-card-id{background:#3f3f46;color:#d4d4d8;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-input{background:#27272a;border-color:#3f3f46;color:#f4f4f5;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-add-box{background:#27272a;border-color:#3f3f46;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-empty-tip{background:#27272a;border-color:#3f3f46;color:#a1a1aa;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-content::-webkit-scrollbar-thumb{background:#52525b;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-content::-webkit-scrollbar-thumb:hover{background:#71717a;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-btn-default{background:#27272a;border-color:#3f3f46;color:#f4f4f5;}' +
      ':root:not(.light):not([data-theme="light"]) .a6jump-btn{background:#27272a;color:#f4f4f5;border-color:#3f3f46;}' +
      '}' +
      '.dark .a6-drawer-panel.is-side-right,[data-theme="dark"] .a6-drawer-panel.is-side-right{background:#18181b;box-shadow:0 8px 24px rgba(0,0,0,.45);border-color:#3f3f46;border-right:none;}' +
      '.dark .a6-drawer-panel.is-side-left,[data-theme="dark"] .a6-drawer-panel.is-side-left{background:#18181b;box-shadow:0 8px 24px rgba(0,0,0,.45);border-color:#3f3f46;border-left:none;}' +
      '.dark .a6-drawer-header,[data-theme="dark"] .a6-drawer-header{background:#27272a;border-color:#3f3f46;}' +
      '.dark .a6-drawer-title,[data-theme="dark"] .a6-drawer-title{color:#fafafa;}' +
      '.dark .a6-drawer-tool-btn,[data-theme="dark"] .a6-drawer-tool-btn{background:#27272a;border-color:#3f3f46;color:#a1a1aa;}' +
      '.dark .a6-drawer-tool-btn:hover,[data-theme="dark"] .a6-drawer-tool-btn:hover{color:#60a5fa;border-color:#60a5fa;}' +
      '.dark .a6-drawer-toolbar,[data-theme="dark"] .a6-drawer-toolbar{background:#27272a;border-color:#3f3f46;}' +
      '.dark .a6-toolbar-btn,[data-theme="dark"] .a6-toolbar-btn{background:#18181b;border-color:#3f3f46;color:#d4d4d8;}' +
      '.dark .a6-toolbar-btn:hover,[data-theme="dark"] .a6-toolbar-btn:hover{background:#27272a;border-color:#60a5fa;color:#60a5fa;}' +
      '.dark .a6-card,[data-theme="dark"] .a6-card{background:#27272a;border-color:#3f3f46;}' +
      '.dark .a6-card:hover,[data-theme="dark"] .a6-card:hover{background:#3f3f46;}' +
      '.dark .a6-card.active,[data-theme="dark"] .a6-card.active{background:rgba(22,119,255,.18);border-color:#1677ff;}' +
      '.dark .a6-card-name,[data-theme="dark"] .a6-card-name{color:#f4f4f5;}' +
      '.dark .a6-card-desc,[data-theme="dark"] .a6-card-desc{color:#a1a1aa;}' +
      '.dark .a6-card-remark,[data-theme="dark"] .a6-card-remark{background:#082f49;color:#7dd3fc;border-color:#0369a1;}' +
      '.dark .a6-card-editbox,[data-theme="dark"] .a6-card-editbox{background:#18181b;border-color:#3f3f46;}' +
      '.dark .a6-card-id,[data-theme="dark"] .a6-card-id{background:#3f3f46;color:#d4d4d8;}' +
      '.dark .a6-input,[data-theme="dark"] .a6-input{background:#27272a;border-color:#3f3f46;color:#f4f4f5;}' +
      '.dark .a6-add-box,[data-theme="dark"] .a6-add-box{background:#27272a;border-color:#3f3f46;}' +
      '.dark .a6-empty-tip,[data-theme="dark"] .a6-empty-tip{background:#27272a;border-color:#3f3f46;color:#a1a1aa;}' +
      '.dark .a6-drawer-content::-webkit-scrollbar-thumb,[data-theme="dark"] .a6-drawer-content::-webkit-scrollbar-thumb{background:#52525b;}' +
      '.dark .a6-drawer-content::-webkit-scrollbar-thumb:hover,[data-theme="dark"] .a6-drawer-content::-webkit-scrollbar-thumb:hover{background:#71717a;}' +
      '.dark .a6-btn-default,[data-theme="dark"] .a6-btn-default{background:#27272a;border-color:#3f3f46;color:#f4f4f5;}' +
      '.dark .a6jump-btn,[data-theme="dark"] .a6jump-btn{background:#27272a;color:#f4f4f5;border-color:#3f3f46;}';
  })();

  /* ================= 市场页搜索联动逻辑 ================= */

  var activeChannelId = '';

  function setReactInputValue(input, value) {
    var proto = window.HTMLInputElement ? window.HTMLInputElement.prototype : null;
    var desc = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
    if (desc && desc.set) {
      desc.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function pressEnter(el) {
    ['keydown', 'keypress', 'keyup'].forEach(function (type) {
      var ev = new KeyboardEvent(type, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
      try {
        Object.defineProperty(ev, 'keyCode', { get: function () { return 13; } });
        Object.defineProperty(ev, 'which', { get: function () { return 13; } });
      } catch (e) { }
      el.dispatchEvent(ev);
    });
  }

  function highlightActiveCard(cid) {
    var cards = document.querySelectorAll('.a6-card');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute('data-cid') === String(cid)) {
        cards[i].classList.add('active');
      } else {
        cards[i].classList.remove('active');
      }
    }
  }
  /* ================= 市场模型列表自选渠道高亮联动 ================= */

  function updateMarketHighlights() {
    if (location.hash.indexOf('#/market') !== 0) return;

    // 1) 检查是否需要抑制高亮（当且仅当切换为“渠道”维度搜索且搜索框非空）
    var isChannelSearch = false;
    var searchInput = document.querySelector('input.ui-search-field');
    var query = searchInput ? (searchInput.value || '').trim() : '';

    if (query) {
      var chips = document.querySelectorAll('button.ui-switch-tag');
      for (var c = 0; c < chips.length; c++) {
        var chip = chips[c];
        var isCurrent = (chip.className || '').indexOf('active') >= 0 || (chip.className || '').indexOf('selected') >= 0;
        if (isCurrent && (chip.textContent || '').trim() === '渠道') {
          isChannelSearch = true;
          break;
        }
      }
    }

    if (isChannelSearch) {
      var prevHighlights = document.querySelectorAll('.a6-market-highlight');
      for (var p = 0; p < prevHighlights.length; p++) {
        prevHighlights[p].classList.remove('a6-market-highlight');
      }
      return;
    }

    // 2) 收集所有快捷渠道 ID（自有 + 自定义）
    var targetIds = new Set();
    var owned = storageGet(STORAGE_KEY_OWNED, {});
    for (var oid in owned) {
      if (owned.hasOwnProperty(oid)) targetIds.add(String(oid).trim());
    }
    var custom = storageGet(STORAGE_KEY_CUSTOM, []);
    for (var ci = 0; ci < custom.length; ci++) {
      if (custom[ci] && custom[ci].id) targetIds.add(String(custom[ci].id).trim());
    }

    if (targetIds.size === 0) {
      var noIdsHighlights = document.querySelectorAll('.a6-market-highlight');
      for (var nh = 0; nh < noIdsHighlights.length; nh++) {
        noIdsHighlights[nh].classList.remove('a6-market-highlight');
      }
      return;
    }

    // 3) 扫描市场中所有行及展开项（支持 tbody tr, .market-row, [role="row"], .ant-table-row 等）
    var rows = document.querySelectorAll('tbody tr, .market-row, [role="row"], .ant-table-row, [class*="table-row"]');
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      // 提取“渠道 #ID”中的数字
      var text = row.textContent || '';
      var m = text.match(/(?:渠道\s*#?|#)\s*(\d+)/);
      var rowCid = m ? m[1] : '';

      if (!rowCid && row.getAttribute) {
        rowCid = row.getAttribute('data-cid') || row.getAttribute('data-channel-id') || '';
      }

      if (rowCid && targetIds.has(rowCid)) {
        if (!row.classList.contains('a6-market-highlight')) {
          row.classList.add('a6-market-highlight');
        }
      } else {
        if (row.classList.contains('a6-market-highlight')) {
          row.classList.remove('a6-market-highlight');
        }
      }
    }
  }

  function performMarketSearch(cid) {
    if (!cid) return;
    activeChannelId = String(cid);
    highlightActiveCard(activeChannelId);

    if (location.hash.indexOf('#/market') !== 0) return;

    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var input = document.querySelector('input.ui-search-field');
      var chips = document.querySelectorAll('button.ui-switch-tag');
      var chip = null;
      for (var i = 0; i < chips.length; i++) {
        if ((chips[i].textContent || '').trim() === '渠道') {
          chip = chips[i];
          break;
        }
      }
      if (!input || !chip) {
        if (tries > 60) clearInterval(timer);
        return;
      }
      clearInterval(timer);

      // 1) 选中“渠道”维度
      if ((chip.className || '').indexOf('active') < 0) chip.click();

      // 2) 填入渠道ID并按回车搜索
      setTimeout(function () {
        input.focus();
        setReactInputValue(input, cid);
        setTimeout(function () {
          pressEnter(input);
          setTimeout(updateMarketHighlights, 350);
        }, 300);
      }, 250);
    }, 300);
  }

  function clearMarketSearch() {
    activeChannelId = '';
    highlightActiveCard('');
    var input = document.querySelector('input.ui-search-field');
    if (input) {
      input.focus();
      setReactInputValue(input, '');
      setTimeout(function () {
        pressEnter(input);
        setTimeout(updateMarketHighlights, 150);
      }, 100);
    }
  }

  function resetMarketplace() {
    clearMarketSearch();

    // 1) 优先触发官方“重置所有筛选”按钮
    var allBtns = document.querySelectorAll('button');
    for (var i = 0; i < allBtns.length; i++) {
      var btnText = (allBtns[i].textContent || '').trim();
      if (btnText.indexOf('重置所有筛选') !== -1) {
        allBtns[i].click();
        break;
      }
    }

    // 2) 兜底对齐全部品牌、全部模型、综合推荐与默认维度
    setTimeout(function () {
      var tags = document.querySelectorAll('button, div[role="button"], .ui-switch-tag, .ui-filter-tag, span');
      for (var j = 0; j < tags.length; j++) {
        var el = tags[j];
        var txt = (el.textContent || '').trim();
        if (txt === '全部品牌' || txt === '全部' || txt.indexOf('综合推荐') !== -1 || txt === '模型') {
          var cls = el.className || '';
          if (cls.indexOf('active') === -1 && cls.indexOf('selected') === -1) {
            el.click();
          }
        }
      }
      setTimeout(updateMarketHighlights, 200);
    }, 150);
  }
  // 地址栏初始化渠道搜索（?cid=xxxx#/market）
  var pendingCid = (function () {
    var m = location.search.match(/[?&]cid=([^&]+)/);
    var fromHash = false;
    if (!m) {
      m = location.hash.match(/[?&]cid=([^&]+)/);
      fromHash = !!m;
    }
    if (!m) return null;
    var id = '';
    try {
      id = decodeURIComponent(m[1]);
    } catch (e) {
      id = m[1];
    }
    id = (id || '').trim();
    if (!id) return null;
    try {
      if (fromHash) {
        var cleanHash = location.hash.replace(/[?&]cid=[^&]+/, '');
        history.replaceState(null, '', location.pathname + location.search + cleanHash);
      } else {
        history.replaceState(null, '', location.pathname + location.hash);
      }
    } catch (e) { }
    return id;
  })();

  if (pendingCid) {
    performMarketSearch(pendingCid);
  }

  /* ================= 渠道列表：在名称右侧注入两个快捷按钮并同步缓存 ================= */

  var BTN_MARK = 'data-a6jump';
  var BTN_VER = '140';

  function isRowOnline(row) {
    var pill = row.querySelector('.sc-status-pill');
    if (pill) {
      if (pill.classList.contains('is-online')) return true;
      if (pill.classList.contains('is-offline')) return false;
      var text = (pill.textContent || '').trim();
      if (text === '已上架' || text.toLowerCase() === 'online') return true;
      if (text === '已下架' || text.toLowerCase() === 'offline') return false;
      if (text.indexOf('已上架') !== -1) return true;
      if (text.indexOf('下架') !== -1) return false;
    }
    if (row.querySelector('.btn-ban.is-banned')) return false;
    var btns = row.querySelectorAll('.mp-act-btn');
    for (var i = 0; i < btns.length; i++) {
      var bText = (btns[i].textContent || btns[i].getAttribute('title') || '').trim();
      if (bText === '下架' || bText === 'Take Offline') return true;
      if (bText === '恢复' || bText === 'Restore') return false;
    }
    return false;
  }

  function marketUrl(id) {
    return MARKET_BASE + '?cid=' + encodeURIComponent(id) + '#/market';
  }

  function getRowId(el) {
    var row = el.closest ? el.closest('tr') : null;
    var idBtn = row ? row.querySelector('button.sc-mono-id') : null;
    var id = idBtn ? (idBtn.getAttribute('title') || idBtn.textContent || '').trim() : '';
    if (!id) {
      var wrap = el.closest ? el.closest('[data-a6id]') : null;
      if (wrap) id = (wrap.getAttribute('data-a6id') || '').trim();
    }
    return id;
  }

  function openForeground(id) {
    var w = window.open(marketUrl(id), '_blank');
    if (!w) location.href = marketUrl(id);
  }

  function openBackground(id) {
    var url = marketUrl(id);
    try {
      if (typeof GM_openInTab === 'function') {
        GM_openInTab(url, { active: false, insert: true, setParent: true });
        return;
      }
      if (typeof GM !== 'undefined' && GM && typeof GM.openInTab === 'function') {
        GM.openInTab(url, { active: false, insert: true, setParent: true });
        return;
      }
    } catch (e) { }
    var w = window.open(url, '_blank');
    if (w) {
      setTimeout(function () {
        try { w.blur(); } catch (e) { }
        try { window.focus(); } catch (e) { }
      }, 0);
    } else {
      location.href = url;
    }
  }

  function makeButton(label, tip, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'a6jump-btn';
    b.textContent = label;
    b.title = tip;
    b.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      var id = getRowId(b);
      if (id) onClick(id);
    });
    return b;
  }

  function getCleanChannelName(nameSpan) {
    if (typeof nameSpan.cloneNode === 'function') {
      var clone = nameSpan.cloneNode(true);
      var wraps = clone.querySelectorAll ? clone.querySelectorAll('.a6jump-wrap') : [];
      for (var i = 0; i < wraps.length; i++) wraps[i].remove();
      return (clone.textContent || '').trim();
    }
    var fullText = (nameSpan.textContent || '').trim();
    return fullText.replace(/查市场|后台查/g, '').trim();
  }

  function getRowDesc(row, cleanName) {
    var descEl = null;
    var selectors = ['.sc-channel-desc', '.sc-channel-description', '.sc-channel-sub', '.channel-desc', '[class*="desc"]'];
    if (row.querySelector) {
      for (var s = 0; s < selectors.length; s++) {
        descEl = row.querySelector(selectors[s]);
        if (descEl) break;
      }
    }
    if (descEl) {
      var dt = (descEl.textContent || '').trim();
      if (dt) return dt;
    }
    var nameSpan = row.querySelector('.sc-channel-name');
    if (nameSpan) {
      var title = nameSpan.getAttribute('title');
      if (title && title.trim() && title.trim() !== cleanName) {
        return title.trim();
      }
      var td = nameSpan.closest ? nameSpan.closest('td') : (nameSpan.parentNode && nameSpan.parentNode.tagName === 'TD' ? nameSpan.parentNode : null);
      if (td) {
        var subEls = td.querySelectorAll('div, p, span, small');
        for (var i = 0; i < subEls.length; i++) {
          var el = subEls[i];
          if (el !== nameSpan && !el.classList.contains('sc-channel-name') && !el.classList.contains('a6jump-wrap')) {
            var txt = (el.textContent || '').trim();
            if (txt && txt !== cleanName) return txt;
          }
        }
      }
    }
    return '';
  }

  function scanRows() {
    if (location.hash.indexOf('#/merchant/channels') !== 0) return;
    var rows = document.querySelectorAll('tbody tr');
    var ownedMap = storageGet(STORAGE_KEY_OWNED, {});
    var changed = false;

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var nameSpan = row.querySelector('.sc-channel-name');
      if (!nameSpan) continue;

      var idBtn = row.querySelector('button.sc-mono-id');
      var id = idBtn ? (idBtn.getAttribute('title') || idBtn.textContent || '').trim() : '';
      if (!id) continue;

      var online = isRowOnline(row);
      var stale = nameSpan.querySelectorAll('[' + BTN_MARK + ']');

      if (!online) {
        for (var j = 0; j < stale.length; j++) stale[j].remove();
        if (ownedMap[id]) {
          delete ownedMap[id];
          changed = true;
        }
        continue;
      }

      var cleanName = getCleanChannelName(nameSpan);
      var desc = getRowDesc(row, cleanName);
      var existing = ownedMap[id];
      if (!existing || existing.name !== cleanName || existing.desc !== desc) {
        ownedMap[id] = { id: id, name: cleanName || id, desc: desc, updatedAt: Date.now() };
        changed = true;
      }

      if (nameSpan.querySelector('[' + BTN_MARK + '="' + BTN_VER + '"]')) continue;
      for (var k = 0; k < stale.length; k++) stale[k].remove();

      var wrap = document.createElement('span');
      wrap.className = 'a6jump-wrap';
      wrap.setAttribute(BTN_MARK, BTN_VER);
      wrap.setAttribute('data-a6id', id);
      wrap.appendChild(makeButton('查市场', '在新标签页打开市场，并以“渠道”维度搜索该渠道ID', openForeground));
      wrap.appendChild(makeButton('后台查', '在后台新标签页打开市场并搜索该渠道ID（不切换当前页面）', openBackground));
      nameSpan.appendChild(wrap);
    }

    if (changed) {
      storageSet(STORAGE_KEY_OWNED, ownedMap);
    }
  }

  /* ================= 市场页：快捷渠道抽屉面板 (Quick Channel Drawer) ================= */

  function renderMarketDrawer(force) {
    var isMarket = location.hash.indexOf('#/market') === 0;
    var container = document.getElementById('a6-drawer-container');

    if (!isMarket) {
      if (container) container.style.display = 'none';
      return;
    }

    if (!force && container && document.getElementById('a6-drawer-panel') && container.style.display !== 'none') {
      return;
    }

    if (!container) {
      container = document.createElement('div');
      container.id = 'a6-drawer-container';
      (document.body || document.documentElement).appendChild(container);
    }
    container.style.display = '';

    var oldContent = container.querySelector('.a6-drawer-content');
    var savedScrollTop = oldContent ? oldContent.scrollTop : 0;

    var rawOpen = storageGet(STORAGE_KEY_DRAWER_OPEN, true);
    var isOpen = rawOpen !== false && rawOpen !== 'false';
    var currentSide = storageGet(STORAGE_KEY_DRAWER_SIDE, 'right');
    if (currentSide !== 'left' && currentSide !== 'right') currentSide = 'right';

    var ownedMap = storageGet(STORAGE_KEY_OWNED, {});
    var customList = storageGet(STORAGE_KEY_CUSTOM, []);
    var ownedList = Object.keys(ownedMap).map(function (k) { return ownedMap[k]; });

    container.innerHTML = '';

    // 1) 触发胶囊按钮
    var trigger = document.createElement('div');
    trigger.id = 'a6-drawer-trigger';
    trigger.className = 'a6-drawer-trigger is-side-' + currentSide + (isOpen ? ' is-hidden' : '');
    trigger.title = '打开快捷渠道面板';
    trigger.innerHTML = '<span>📌 快捷渠道</span>';
    trigger.addEventListener('click', function () {
      setDrawerOpen(true);
    });
    container.appendChild(trigger);

    // 2) 抽屉面板
    var panel = document.createElement('div');
    panel.id = 'a6-drawer-panel';
    panel.className = 'a6-drawer-panel is-side-' + currentSide + (isOpen ? ' is-open' : '');

    // 头部
    var header = document.createElement('div');
    header.className = 'a6-drawer-header';
    var titleWrap = document.createElement('div');
    titleWrap.className = 'a6-drawer-title-wrap';
    var title = document.createElement('span');
    title.className = 'a6-drawer-title';
    title.textContent = '快捷渠道';
    var countBadge = document.createElement('span');
    countBadge.className = 'a6-drawer-count';
    countBadge.textContent = String(ownedList.length + customList.length);
    titleWrap.appendChild(title);
    titleWrap.appendChild(countBadge);

    var actionsWrap = document.createElement('div');
    actionsWrap.className = 'a6-drawer-actions';

    var sideBtn = document.createElement('button');
    sideBtn.type = 'button';
    sideBtn.className = 'a6-drawer-tool-btn';
    sideBtn.title = currentSide === 'right' ? '切换到左侧贴边' : '切换到右侧贴边';
    sideBtn.textContent = currentSide === 'right' ? '⇋ 靠左' : '⇋ 靠右';
    sideBtn.addEventListener('click', function () {
      currentSide = currentSide === 'right' ? 'left' : 'right';
      storageSet(STORAGE_KEY_DRAWER_SIDE, currentSide);
      renderMarketDrawer(true);
    });
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'a6-drawer-close';
    closeBtn.title = '收起面板';
    closeBtn.innerHTML = '✕';
    closeBtn.addEventListener('click', function () {
      setDrawerOpen(false);
    });

    actionsWrap.appendChild(sideBtn);
    actionsWrap.appendChild(closeBtn);
    header.appendChild(titleWrap);
    header.appendChild(actionsWrap);
    panel.appendChild(header);

    // 快捷操作工具栏
    var toolbar = document.createElement('div');
    toolbar.className = 'a6-drawer-toolbar';

    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'a6-toolbar-btn a6-btn-clear';
    clearBtn.title = '清空搜索框与渠道选择，保留其他筛选';
    clearBtn.innerHTML = '<span>🧹 清空搜索</span>';
    clearBtn.addEventListener('click', function () {
      clearMarketSearch();
    });

    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'a6-toolbar-btn a6-btn-reset';
    resetBtn.title = '还原市场至默认推荐状态（全部品牌/全部模型/综合推荐）';
    resetBtn.innerHTML = '<span>⟲ 重置市场</span>';
    resetBtn.addEventListener('click', function () {
      resetMarketplace();
    });

    toolbar.appendChild(clearBtn);
    toolbar.appendChild(resetBtn);
    panel.appendChild(toolbar);

    // 内容区
    var content = document.createElement('div');
    content.className = 'a6-drawer-content';
    content.addEventListener('wheel', function (ev) {
      var delta = ev.deltaY || (ev.detail ? ev.detail * 40 : 0);
      if (!delta) return;
      var maxScroll = content.scrollHeight - content.clientHeight;
      if (maxScroll <= 0) return;
      var canScrollDown = content.scrollTop < maxScroll - 1;
      var canScrollUp = content.scrollTop > 1;
      if ((delta > 0 && canScrollDown) || (delta < 0 && canScrollUp)) {
        content.scrollTop += delta;
        ev.stopPropagation();
        if (ev.cancelable) ev.preventDefault();
      }
    }, { passive: false });
    // 分组 1: 我的渠道
    var secOwned = document.createElement('div');
    var secOwnedHeader = document.createElement('div');
    secOwnedHeader.className = 'a6-section-header';
    var secOwnedTitle = document.createElement('span');
    secOwnedTitle.className = 'a6-section-title';
    secOwnedTitle.textContent = '我的渠道 (' + ownedList.length + ')';
    secOwnedHeader.appendChild(secOwnedTitle);
    secOwned.appendChild(secOwnedHeader);

    if (ownedList.length === 0) {
      var emptyTip = document.createElement('div');
      emptyTip.className = 'a6-empty-tip';
      emptyTip.textContent = '暂无同步数据，请访问一次「渠道管理」页自动同步';
      secOwned.appendChild(emptyTip);
    } else {
      ownedList.forEach(function (ch) {
        secOwned.appendChild(createChannelCard(ch, false));
      });
    }
    content.appendChild(secOwned);

    // 分组 2: 自定义渠道
    var secCustom = document.createElement('div');
    var secCustomHeader = document.createElement('div');
    secCustomHeader.className = 'a6-section-header';
    var secCustomTitle = document.createElement('span');
    secCustomTitle.className = 'a6-section-title';
    secCustomTitle.textContent = '自定义渠道 (' + customList.length + ')';

    var addToggleBtn = document.createElement('button');
    addToggleBtn.type = 'button';
    addToggleBtn.className = 'a6-btn-link';
    addToggleBtn.textContent = '+ 添加';
    secCustomHeader.appendChild(secCustomTitle);
    secCustomHeader.appendChild(addToggleBtn);
    secCustom.appendChild(secCustomHeader);

    // 自定义添加表单
    var addBox = document.createElement('div');
    addBox.className = 'a6-add-box';
    addBox.style.display = 'none';

    var idRow = document.createElement('div');
    idRow.className = 'a6-id-row';

    var idInput = document.createElement('input');
    idInput.className = 'a6-input';
    idInput.style.flex = '1';
    idInput.placeholder = '渠道 ID * (如 101)';

    var fetchBtn = document.createElement('button');
    fetchBtn.type = 'button';
    fetchBtn.className = 'a6-btn-sm a6-btn-default a6-btn-fetch';
    fetchBtn.title = '从已同步渠道或市场检索并自动回填名称与说明';
    fetchBtn.textContent = '🔍 获取';
    fetchBtn.addEventListener('click', function () {
      var cid = idInput.value.trim();
      if (!cid) {
        idInput.focus();
        return;
      }
      fetchChannelInfo(cid, function (info) {
        if (info) {
          if (info.name) nameInput.value = info.name;
          if (info.desc) descInput.value = info.desc;
          if (info.remark && !remarkInput.value) remarkInput.value = info.remark;
        }
      });
    });

    idRow.appendChild(idInput);
    idRow.appendChild(fetchBtn);

    var nameInput = document.createElement('input');
    nameInput.className = 'a6-input';
    nameInput.placeholder = '渠道名称 * (如 能能CC-2)';

    var descInput = document.createElement('input');
    descInput.className = 'a6-input';
    descInput.placeholder = '渠道说明 (选填，如 CC Kiro 保智商)';

    var remarkInput = document.createElement('input');
    remarkInput.className = 'a6-input';
    remarkInput.placeholder = '渠道备注 (选填，如 生产主力/低延迟)';

    var actRow = document.createElement('div');
    actRow.className = 'a6-form-actions';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'a6-btn-sm a6-btn-default';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', function () {
      addBox.style.display = 'none';
      idInput.value = '';
      nameInput.value = '';
      descInput.value = '';
      remarkInput.value = '';
    });

    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'a6-btn-sm a6-btn-primary';
    saveBtn.textContent = '保存';
    saveBtn.addEventListener('click', function () {
      var cid = idInput.value.trim();
      var cname = nameInput.value.trim();
      var cdesc = descInput.value.trim();
      var cremark = remarkInput.value.trim();
      if (!cid) {
        idInput.focus();
        return;
      }
      if (!cname) cname = cid;

      var found = false;
      for (var idx = 0; idx < customList.length; idx++) {
        if (customList[idx].id === cid) {
          customList[idx].name = cname;
          customList[idx].desc = cdesc;
          found = true;
          break;
        }
      }
      if (!found) {
        customList.push({ id: cid, name: cname, desc: cdesc });
      }
      storageSet(STORAGE_KEY_CUSTOM, customList);
      if (cremark) {
        setChannelRemark(cid, cremark);
      }
      renderMarketDrawer(true);
    });

    actRow.appendChild(cancelBtn);
    actRow.appendChild(saveBtn);

    addBox.appendChild(idRow);
    addBox.appendChild(nameInput);
    addBox.appendChild(descInput);
    addBox.appendChild(remarkInput);
    addBox.appendChild(actRow);
    secCustom.appendChild(addBox);

    addToggleBtn.addEventListener('click', function () {
      addBox.style.display = addBox.style.display === 'none' ? 'flex' : 'none';
      if (addBox.style.display !== 'none') idInput.focus();
    });

    if (customList.length === 0) {
      var emptyCustomTip = document.createElement('div');
      emptyCustomTip.className = 'a6-empty-tip';
      emptyCustomTip.textContent = '暂无自定义渠道，点击右上角 + 添加';
      secCustom.appendChild(emptyCustomTip);
    } else {
      customList.forEach(function (ch, idx) {
        secCustom.appendChild(createChannelCard(ch, true, function () {
          customList.splice(idx, 1);
          storageSet(STORAGE_KEY_CUSTOM, customList);
          renderMarketDrawer(true);
        }));
      });
    }
    content.appendChild(secCustom);

    panel.appendChild(content);
    container.appendChild(panel);
    if (savedScrollTop > 0) {
      content.scrollTop = savedScrollTop;
    }
    function setDrawerOpen(open) {
      isOpen = open;
      storageSet(STORAGE_KEY_DRAWER_OPEN, open);
      if (open) {
        panel.classList.add('is-open');
        trigger.classList.add('is-hidden');
      } else {
        panel.classList.remove('is-open');
        trigger.classList.remove('is-hidden');
      }
    }

    function createChannelCard(ch, isCustom, onDelete) {
      var card = document.createElement('div');
      card.className = 'a6-card' + (ch.id === activeChannelId ? ' active' : '');
      card.setAttribute('data-cid', ch.id);

      var row1 = document.createElement('div');
      row1.className = 'a6-card-row1';

      var nameEl = document.createElement('span');
      nameEl.className = 'a6-card-name';
      nameEl.textContent = ch.name || ch.id;
      nameEl.title = ch.name || ch.id;

      var badges = document.createElement('div');
      badges.className = 'a6-card-badges';

      var idBadge = document.createElement('span');
      idBadge.className = 'a6-card-id';
      idBadge.textContent = '#' + ch.id;
      badges.appendChild(idBadge);
      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'a6-card-btn-icon a6-card-edit-btn';
      editBtn.title = '编辑备注';
      editBtn.textContent = '✏️';
      editBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var open = editBox.style.display !== 'none';
        editBox.style.display = open ? 'none' : 'flex';
        if (!open) {
          editInput.value = getChannelRemark(ch.id);
          setTimeout(function () { editInput.focus(); }, 50);
        }
      });
      badges.appendChild(editBtn);

      if (isCustom && onDelete) {
        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'a6-card-del';
        delBtn.title = '删除此自定义渠道';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          onDelete();
        });
        badges.appendChild(delBtn);
      }

      row1.appendChild(nameEl);
      row1.appendChild(badges);
      card.appendChild(row1);

      if (ch.desc) {
        var descEl = document.createElement('div');
        descEl.className = 'a6-card-desc';
        descEl.textContent = ch.desc;
        descEl.title = ch.desc;
        card.appendChild(descEl);
      }

      var remark = getChannelRemark(ch.id);
      if (remark) {
        var remarkEl = document.createElement('div');
        remarkEl.className = 'a6-card-remark';
        remarkEl.textContent = '📝 ' + remark;
        remarkEl.title = '备注：' + remark;
        card.appendChild(remarkEl);
      }

      // 就地编辑备注输入框
      var editBox = document.createElement('div');
      editBox.className = 'a6-card-editbox';
      editBox.style.display = 'none';

      var editInput = document.createElement('input');
      editInput.className = 'a6-input a6-input-sm';
      editInput.placeholder = '输入备注（留空保存即删除）';
      editInput.value = remark || '';

      var editAct = document.createElement('div');
      editAct.className = 'a6-form-actions';

      var editCancel = document.createElement('button');
      editCancel.type = 'button';
      editCancel.className = 'a6-btn-sm a6-btn-default';
      editCancel.textContent = '取消';
      editCancel.addEventListener('click', function (ev) {
        ev.stopPropagation();
        editBox.style.display = 'none';
      });

      var editSave = document.createElement('button');
      editSave.type = 'button';
      editSave.className = 'a6-btn-sm a6-btn-primary';
      editSave.textContent = '保存';
      editSave.addEventListener('click', function (ev) {
        ev.stopPropagation();
        setChannelRemark(ch.id, editInput.value.trim());
        renderMarketDrawer(true);
      });

      editInput.addEventListener('click', function (ev) { ev.stopPropagation(); });
      editInput.addEventListener('keydown', function (ev) {
        ev.stopPropagation();
        if (ev.key === 'Enter') {
          setChannelRemark(ch.id, editInput.value.trim());
          renderMarketDrawer(true);
        } else if (ev.key === 'Escape') {
          editBox.style.display = 'none';
        }
      });

      editAct.appendChild(editCancel);
      editAct.appendChild(editSave);
      editBox.appendChild(editInput);
      editBox.appendChild(editAct);
      card.appendChild(editBox);

      card.addEventListener('click', function () {
        if (activeChannelId === String(ch.id)) {
          clearMarketSearch();
        } else {
          performMarketSearch(ch.id);
        }
      });

      return card;
    }
  }

  // 调度监听
  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () {
      scheduled = false;
      if (location.hash.indexOf('#/merchant/channels') === 0) {
        scanRows();
        var c = document.getElementById('a6-drawer-container');
        if (c) c.style.display = 'none';
      } else if (location.hash.indexOf('#/market') === 0) {
        if (!document.getElementById('a6-drawer-panel')) {
          renderMarketDrawer();
        }
        updateMarketHighlights();
      }
    }, 250);
  }

  new MutationObserver(function (mutations) {
    if (!mutations || !mutations.length) {
      schedule();
      return;
    }
    var fromOutside = false;
    for (var i = 0; i < mutations.length; i++) {
      var target = mutations[i].target;
      if (!target) continue;
      if (target.id === 'a6-drawer-container' || (target.closest && target.closest('#a6-drawer-container'))) {
        continue;
      }
      fromOutside = true;
      break;
    }
    if (fromOutside) schedule();
  }).observe(document.body, { childList: true, subtree: true });

  window.addEventListener('hashchange', function () {
    if (location.hash.indexOf('#/market') === 0) {
      renderMarketDrawer(true);
    } else {
      var c = document.getElementById('a6-drawer-container');
      if (c) c.style.display = 'none';
    }
    schedule();
  });

  document.addEventListener('input', function (ev) {
    if (location.hash.indexOf('#/market') !== 0) return;
    if (ev.target && ev.target.classList && ev.target.classList.contains('ui-search-field')) {
      updateMarketHighlights();
    }
  }, true);

  document.addEventListener('click', function (ev) {
    if (location.hash.indexOf('#/market') !== 0) return;
    var tag = ev.target && ev.target.closest ? ev.target.closest('button.ui-switch-tag') : null;
    if (tag) {
      setTimeout(updateMarketHighlights, 50);
    }
  }, true);
  schedule();
})();
