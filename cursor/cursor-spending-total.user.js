// ==UserScript==
// @name         Cursor Spending 显示用量总额
// @namespace    https://cursor.com/
// @version      2.1.0
// @description  在 Cursor Spending 页把 "x% used" 替换为两位小数精确百分比，并在右侧内联显示已用金额和总量（数据来源 /api/usage-summary）
// @match        https://cursor.com/dashboard/spending*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const INJECTED_CLASS = 'cst-total';
  const PCT_RE = /^\d+(\.\d+)?%\s*(used|已使用|已用)/i;

  let summaryPromise = null;

  function fetchSummary() {
    summaryPromise = fetch('/api/usage-summary', {
      credentials: 'include',
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    return summaryPromise;
  }

  // 找到所有 "x% used" 的最内层元素
  function findPercentEls() {
    return [...document.querySelectorAll('body *')].filter((e) => {
      const t = (e.textContent || '').trim();
      if (!PCT_RE.test(t)) return false;
      return ![...e.children].some(
        (c) => !c.classList.contains(INJECTED_CLASS) && PCT_RE.test((c.textContent || '').trim())
      );
    });
  }

  // 向上找该进度条属于哪个桶：Cursor Models（auto）还是 Other Models（api）
  function bucketOf(el) {
    let n = el;
    for (let i = 0; i < 8 && n; i++, n = n.parentElement) {
      const t = n.textContent || '';
      const hasAuto = t.includes('Cursor Models');
      const hasApi = t.includes('Other Models');
      if (hasAuto && !hasApi) return 'auto';
      if (hasApi && !hasAuto) return 'api';
    }
    return null;
  }

  const fmt = (cents) => '$' + (cents / 100).toFixed(2);
  const fmtTotal = (cents) =>
    cents >= 10000 ? '$' + Math.round(cents / 100) : fmt(cents);

  // 解方程拆分两个桶：usedAuto+usedApi=used，totalAuto+totalApi=used/totalPct
  // 返回 { auto: {used,total}, api: {used,total} }（单位：美分；无法拆分时对应项为 null）
  function computeBuckets(plan) {
    const used = plan.used;
    const pA = plan.autoPercentUsed / 100;
    const pI = plan.apiPercentUsed / 100;
    const pT = (plan.totalPercentUsed || 0) / 100;
    const D = pT > 0 ? used / pT : null; // totalAuto + totalApi
    const out = { auto: null, api: null };
    if (pA > 0 && pI > 0 && D && Math.abs(pA - pI) > 1e-9) {
      const tA = (used - pI * D) / (pA - pI);
      const tI = D - tA;
      if (tA > 0 && tI > 0) {
        out.auto = { used: pA * tA, total: tA };
        out.api = { used: pI * tI, total: tI };
      }
    } else if (pA > 0 && pI === 0) {
      const tA = used / pA;
      out.auto = { used, total: tA };
      if (D && D > tA) out.api = { used: 0, total: D - tA };
    } else if (pI > 0 && pA === 0) {
      const tI = used / pI;
      out.api = { used, total: tI };
      if (D && D > tI) out.auto = { used: 0, total: D - tI };
    }
    return out;
  }

  function labelFor(bucket, buckets, plan) {
    const b = buckets[bucket];
    if (b && b.total > 0) {
      return {
        text: ` · ${fmt(b.used)} / ≈${fmtTotal(b.total)}`,
        title: `已用 ${fmt(b.used)}，总量 ≈ ${fmt(b.total)}（按当前占比折算）`,
      };
    }
    // 无法折算总量时，至少在 Cursor Models 条上显示合计已用
    if (bucket === 'auto' && plan.used > 0) {
      return { text: ` · ${fmt(plan.used)} used`, title: '总量暂时无法折算' };
    }
    return null;
  }

  // 把页面四舍五入的 "2% used" 改写为接口精确值 "2.36% used"
  // 注意数字和 % 可能被 React 拆成两个相邻文本节点（如 "3" + "% used"）
  function rewritePercent(el, pct) {
    const target = pct.toFixed(2);
    const texts = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE);
    for (let i = 0; i < texts.length; i++) {
      const v = texts[i].nodeValue;
      if (/\d+(\.\d+)?\s*%/.test(v)) {
        const nv = v.replace(/\d+(\.\d+)?\s*%/, target + '%');
        if (nv !== v) texts[i].nodeValue = nv;
        return;
      }
      if (/^\s*\d+(\.\d+)?\s*$/.test(v) && texts[i + 1] && /^\s*%/.test(texts[i + 1].nodeValue)) {
        if (v !== target) texts[i].nodeValue = target;
        return;
      }
    }
    // 百分比文字也可能包在一层子元素里
    for (const n of [...el.children]) {
      if (!n.classList.contains(INJECTED_CLASS) && /\d+(\.\d+)?\s*%/.test(n.textContent)) {
        rewritePercent(n, pct);
        return;
      }
    }
  }

  function upsertSpan(el, label) {
    const existing = el.querySelector(':scope > .' + INJECTED_CLASS);
    if (!label) {
      if (existing) existing.remove();
      return;
    }
    if (existing) {
      if (existing.dataset.cst === label.text) return; // 已是最新，避免 observer 死循环
      existing.remove();
    }
    const s = document.createElement('span');
    s.className = INJECTED_CLASS;
    s.dataset.cst = label.text;
    s.textContent = label.text;
    s.title = label.title || '';
    s.style.cssText = 'opacity:.65;font-weight:400;white-space:nowrap;';
    el.appendChild(s); // 注入到百分比元素内部，紧跟 "used" 文字
  }

  async function annotate() {
    if (!location.pathname.startsWith('/dashboard/spending')) return;
    const data = await (summaryPromise || fetchSummary());
    const plan = data && data.individualUsage && data.individualUsage.plan;
    if (!plan || !plan.enabled) return;
    const buckets = computeBuckets(plan);
    const pctOf = { auto: plan.autoPercentUsed, api: plan.apiPercentUsed };
    for (const el of findPercentEls()) {
      const bucket = bucketOf(el);
      if (bucket && pctOf[bucket] != null) rewritePercent(el, pctOf[bucket]);
      upsertSpan(el, labelFor(bucket, buckets, plan));
    }
  }

  // SPA 里 React 会重渲染，用 observer 维护注入内容（去抖）
  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(annotate, 300);
  }).observe(document.body, { childList: true, subtree: true });

  // SPA 路由切换时重新拉取数据
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      summaryPromise = null;
      annotate();
    }
  }, 1000);

  annotate();
})();
