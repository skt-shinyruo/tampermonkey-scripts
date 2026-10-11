// ==UserScript==
// @name         A6API 渠道名称 → 市场自动搜索
// @namespace    https://a6api.com/
// @version      1.3.1
// @description  在「渠道管理」页渠道名称右侧新增「查市场」「后台查」两个按钮：分别在前台/后台新标签页打开市场页，并自动以“渠道”维度搜索该渠道ID
// @match        https://a6api.com/*
// @grant        GM_openInTab
// @grant        GM.openInTab
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  var MARKET_BASE = 'https://a6api.com/';

  /* ========== 按钮样式（启动时一次性写入，热更新时覆盖旧版本样式） ========== */
  (function () {
    var st = document.getElementById('a6jump-style');
    if (!st) {
      st = document.createElement('style');
      st.id = 'a6jump-style';
      (document.head || document.documentElement).appendChild(st);
    }
    st.textContent =
      '.a6jump-btn{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;' +
      'height:18px;padding:0 7px;margin-left:6px;font-size:11px;line-height:1;font-weight:500;' +
      'color:#27272a;background:#f4f4f5;border:1px solid #e4e4e7;border-radius:6px;cursor:pointer;' +
      'vertical-align:1.5px;white-space:nowrap;}' +
      '.a6jump-btn:hover{color:#1677ff;background:rgba(22,119,255,.08);border-color:rgba(22,119,255,.45);}';
  })();

  /* ================= 市场页：读取URL中的渠道ID并自动搜索 ================= */

  // 在脚本启动最早期读取并清理地址栏里的渠道ID（?cid=xxxx#/market）
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
    // 清理地址栏，避免刷新页面时重复触发搜索
    try {
      if (fromHash) {
        var cleanHash = location.hash.replace(/[?&]cid=[^&]+/, '');
        history.replaceState(null, '', location.pathname + location.search + cleanHash);
      } else {
        history.replaceState(null, '', location.pathname + location.hash);
      }
    } catch (e) {}
    return id;
  })();

  // 以 React 能感知的方式写入输入框的值
  function setReactInputValue(input, value) {
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // 合成回车（带 keyCode/which，兼容检查按键码的实现）
  function pressEnter(el) {
    ['keydown', 'keypress', 'keyup'].forEach(function (type) {
      var ev = new KeyboardEvent(type, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
      try {
        Object.defineProperty(ev, 'keyCode', { get: function () { return 13; } });
        Object.defineProperty(ev, 'which', { get: function () { return 13; } });
      } catch (e) {}
      el.dispatchEvent(ev);
    });
  }

  function runMarketSearch() {
    if (!pendingCid) return;
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
        if (tries > 60) clearInterval(timer); // 最多等约 18 秒（后台标签页计时有节流）
        return;
      }
      clearInterval(timer);
      var cid = pendingCid;
      pendingCid = null;

      // 1) 选中“渠道”维度
      if ((chip.className || '').indexOf('active') < 0) chip.click();

      // 2) 填入渠道ID并按回车搜索
      setTimeout(function () {
        input.focus();
        setReactInputValue(input, cid);
        setTimeout(function () {
          pressEnter(input);
        }, 300);
      }, 250);
    }, 300);
  }

  runMarketSearch();
  window.addEventListener('hashchange', function () {
    setTimeout(runMarketSearch, 300);
  });

  /* ================= 渠道列表：在名称右侧注入两个快捷按钮 ================= */

  var BTN_MARK = 'data-a6jump';
  var BTN_VER = '131';

  function marketUrl(id) {
    return MARKET_BASE + '?cid=' + encodeURIComponent(id) + '#/market';
  }

  // 点击时实时读取按钮所在行的渠道ID（避免行复用/重渲染造成旧ID）
  function getRowId(el) {
    var row = el.closest('tr');
    var idBtn = row ? row.querySelector('button.sc-mono-id') : null;
    var id = idBtn ? (idBtn.getAttribute('title') || idBtn.textContent || '').trim() : '';
    if (!id) {
      var wrap = el.closest('[data-a6id]');
      if (wrap) id = (wrap.getAttribute('data-a6id') || '').trim();
    }
    return id;
  }

  // 前台打开：新标签页并切换到它
  function openForeground(id) {
    var w = window.open(marketUrl(id), '_blank');
    if (!w) location.href = marketUrl(id); // 弹窗被拦截时的兜底
  }

  // 后台打开：优先用篡改猴原生 GM_openInTab（active:false = 后台标签页，不切换）
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
    } catch (e) {}
    // 兜底：window.open 后把焦点抢回当前页
    var w = window.open(url, '_blank');
    if (w) {
      setTimeout(function () {
        try { w.blur(); } catch (e) {}
        try { window.focus(); } catch (e) {}
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

  function scanRows() {
    if (location.hash.indexOf('#/merchant/channels') !== 0) return;
    var rows = document.querySelectorAll('tbody tr');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var nameSpan = row.querySelector('.sc-channel-name');
      if (!nameSpan) continue;
      if (nameSpan.querySelector('[' + BTN_MARK + '="' + BTN_VER + '"]')) continue; // 本版本已注入
      // 清理旧版本脚本注入的残留按钮（篡改猴热更新场景）
      var stale = nameSpan.querySelectorAll('[' + BTN_MARK + ']');
      for (var k = 0; k < stale.length; k++) stale[k].remove();
      var idBtn = row.querySelector('button.sc-mono-id');
      var id = idBtn ? (idBtn.getAttribute('title') || idBtn.textContent || '').trim() : '';
      if (!id) continue;
      var wrap = document.createElement('span');
      wrap.setAttribute(BTN_MARK, BTN_VER);
      wrap.setAttribute('data-a6id', id);
      wrap.appendChild(makeButton('查市场', '在新标签页打开市场，并以“渠道”维度搜索该渠道ID', openForeground));
      wrap.appendChild(makeButton('后台查', '在后台新标签页打开市场并搜索该渠道ID（不切换当前页面）', openBackground));
      nameSpan.appendChild(wrap);
    }
  }

  // 监听路由与 DOM 变化（React 重渲染后自动补回按钮）
  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () {
      scheduled = false;
      scanRows();
    }, 250);
  }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', schedule);
  schedule();
})();
