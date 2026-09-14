// ==UserScript==
// @name         Cursor Spending 显示用量总额
// @namespace    https://cursor.com/
// @version      3.0.0
// @description  在 Cursor Spending 页把 "x% used" 替换为两位小数精确百分比，并在右侧内联显示真实已用金额和总量（数据来源 /api/usage-summary + /api/dashboard/get-aggregated-usage-events）
// @match        https://cursor.com/dashboard/spending*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const INJECTED_CLASS = 'cst-total';
  const PCT_RE = /^\d+(\.\d+)?%\s*(used|已使用|已用)/i;

  let dataPromise = null;

  // 一次拉取两个接口：summary 拿 plan/计费周期起点，events 拿分桶真实花费
  function fetchData() {
    dataPromise = (async () => {
      const summaryRes = await fetch('/api/usage-summary', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!summaryRes.ok) return null;
      const summary = await summaryRes.json();
      const plan = summary.individualUsage && summary.individualUsage.plan;
      if (!plan || !plan.enabled || !summary.billingCycleStart) return null;

      const startDate = new Date(summary.billingCycleStart).getTime();
      const usageRes = await fetch('/api/dashboard/get-aggregated-usage-events', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: -1, startDate }),
      });
      const agg = usageRes.ok ? await usageRes.json().catch(() => null) : null;
      return { plan, agg };
    })().catch(() => null);
    return dataPromise;
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

  // 分桶真实花费：tier 2 = Cursor Models，tier 1 = Other Models（单位：美分）
  // auto 总量按当前占比折算（0<pct<100 才有意义）；api 总量即保底额度 plan.limit
  function computeBuckets({ plan, agg }) {
    const out = { auto: null, api: null };
    if (!agg || !Array.isArray(agg.aggregations)) return out;
    let usedAuto = 0;
    let usedApi = 0;
    for (const x of agg.aggregations) {
      if (!x.modelIntent || ![1, 2].includes(x.tier)) continue;
      const c = Number(x.totalCents || 0);
      if (x.tier === 2) usedAuto += c;
      else usedApi += c;
    }
    const pA = Number(plan.autoPercentUsed || 0);
    out.auto = {
      used: usedAuto,
      total: pA > 0 && pA < 100 ? (usedAuto * 100) / pA : null,
    };
    out.api = {
      used: usedApi,
      total: Number(plan.limit || 0) || null,
    };
    return out;
  }

  function labelFor(bucket, buckets) {
    const b = buckets[bucket];
    if (!b) return null;
    if (b.total != null && b.total > 0) {
      if (bucket === 'auto') {
        return {
          text: ` · ${fmt(b.used)} / ≈${fmtTotal(b.total)}`,
          title: `已用 ${fmt(b.used)}，总量 ≈ ${fmt(b.total)}（按当前占比折算）`,
        };
      }
      return {
        text: ` · ${fmt(b.used)} / ${fmtTotal(b.total)}`,
        title: `已用 ${fmt(b.used)}，保底额度 ${fmt(b.total)}`,
      };
    }
    if (b.used > 0) {
      return { text: ` · ${fmt(b.used)} used`, title: '总量暂时无法折算' };
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
    const data = await (dataPromise || fetchData());
    if (!data) return;
    const { plan } = data;
    const buckets = computeBuckets(data);
    const pctOf = { auto: plan.autoPercentUsed, api: plan.apiPercentUsed };
    for (const el of findPercentEls()) {
      const bucket = bucketOf(el);
      if (bucket && pctOf[bucket] != null) rewritePercent(el, pctOf[bucket]);
      upsertSpan(el, labelFor(bucket, buckets));
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
      dataPromise = null;
      annotate();
    }
  }, 1000);

  annotate();
})();
