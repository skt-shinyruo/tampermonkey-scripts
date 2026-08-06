// ==UserScript==
// @name         A6API Fixed 6.95 Exchange Rate
// @name:zh-CN   A6API 6.95 固定汇率倍率
// @namespace    https://github.com/skt-shinyruo/tampermonkey-scripts
// @version      0.2.0
// @description  在 A6API 模型市场的实时倍率右侧显示按固定汇率 6.95 计算的倍率。
// @match        https://a6api.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  const FIXED_EXCHANGE_RATE = 6.95;
  const INSTALL_FLAG = "__a6apiFixedExchangeRateInstalled";
  const ROW_SELECTOR = '[data-market-row="true"]';
  const VALUE_CLASS = "a6api-fixed-rate-value";
  const DUAL_RATIO_CLASS = "a6api-dual-ratio";
  const STYLE_ID = "a6api-fixed-exchange-rate-style";

  function parsePrice(text) {
    const match = String(text || "")
      .replaceAll(",", "")
      .match(/-?(?:\d+(?:\.\d+)?|\.\d+)/);
    if (!match) return null;

    const value = Number(match[0]);
    return Number.isFinite(value) ? value : null;
  }

  function calculateFixedMultiplier(merchantPrice, officialPrice) {
    if (!Number.isFinite(merchantPrice) || !Number.isFinite(officialPrice) || officialPrice <= 0) {
      return null;
    }
    return (merchantPrice / officialPrice) * FIXED_EXCHANGE_RATE;
  }

  function calculateFromDisplayedMultiplier(multiplier, exchangeRate) {
    if (!Number.isFinite(multiplier) || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      return null;
    }
    return (multiplier / exchangeRate) * FIXED_EXCHANGE_RATE;
  }

  function formatMultiplier(value) {
    if (!Number.isFinite(value)) return "--";
    return value.toFixed(4).replace(/\.?0+$/, "");
  }

  function isModelsPath(pathname) {
    return pathname === "/models" || pathname.startsWith("/models/");
  }

  if (globalThis.__A6API_FIXED_RATE_TESTING__ === true) {
    globalThis.__A6API_FIXED_RATE_INTERNALS__ = Object.freeze({
      FIXED_EXCHANGE_RATE,
      calculateFixedMultiplier,
      calculateFromDisplayedMultiplier,
      formatMultiplier,
      isModelsPath,
      parsePrice,
    });
  }

  if (typeof window !== "object" || typeof document !== "object") return;
  if (window.location.hostname !== "a6api.com") return;
  if (window[INSTALL_FLAG]) return;
  window[INSTALL_FLAG] = true;

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .marketplace-ratio-header.a6api-fixed-rate-header {
        gap: 4px;
        white-space: nowrap;
      }

      .a6api-fixed-rate-label {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px 4px;
        border: 1px solid rgba(37, 99, 235, 0.18);
        border-radius: 4px;
        background: rgba(239, 246, 255, 0.94);
        color: #2563eb;
        font-size: 10px;
        font-weight: 850;
        line-height: 1;
        letter-spacing: 0;
      }

      .marketplace-ratio-cell.${DUAL_RATIO_CLASS} {
        min-width: 0;
        gap: 6px;
        padding-right: 6px;
        padding-left: 6px;
      }

      .marketplace-ratio-cell .${VALUE_CLASS} {
        display: inline-flex;
        align-items: center;
        min-width: 0;
        padding-left: 6px;
        border-left: 1px solid rgba(37, 99, 235, 0.22);
        color: #2563eb;
        font: inherit;
        font-weight: inherit;
        line-height: 1;
        letter-spacing: 0;
        white-space: nowrap;
      }

      .marketplace-mobile-ratio .marketplace-ratio-cell.${DUAL_RATIO_CLASS} {
        align-items: center;
        text-align: center;
      }
    `;
    (document.head || document.documentElement).append(style);
  }

  function readExactInputPrices(row) {
    const compare =
      row.querySelector('.marketplace-price-compare[data-market-official-price="matched"]') ||
      row.querySelector(".marketplace-price-compare:not([data-market-official-price])");
    if (!compare) return null;

    const officialPrice = parsePrice(
      compare.querySelector(".price-compare-row.official strong")?.textContent,
    );
    const merchantPrice = parsePrice(
      compare.querySelector(".price-compare-row.merchant strong")?.textContent,
    );
    if (officialPrice === null || merchantPrice === null) return null;

    return { merchantPrice, officialPrice };
  }

  function readDisplayedMultiplier(ratioCell) {
    const nativeValue = Array.from(ratioCell.children).find(
      (child) => child.tagName === "STRONG",
    );
    const multiplier = parsePrice(nativeValue?.textContent);
    const exchangeRate = parsePrice(
      ratioCell.getAttribute("title")?.match(/当前汇率[:：]\s*([\d.]+)/)?.[1],
    );
    if (multiplier === null || exchangeRate === null) return null;

    return { exchangeRate, multiplier };
  }

  function getFixedMultiplier(row, ratioCell) {
    const exactPrices = readExactInputPrices(row);
    if (exactPrices) {
      return {
        source: "prices",
        value: calculateFixedMultiplier(exactPrices.merchantPrice, exactPrices.officialPrice),
        title: `商户输入价 ${exactPrices.merchantPrice} ÷ 官方输入价 ${exactPrices.officialPrice} × ${FIXED_EXCHANGE_RATE}`,
      };
    }

    const displayed = readDisplayedMultiplier(ratioCell);
    if (!displayed) return null;
    return {
      source: "displayed-ratio",
      value: calculateFromDisplayedMultiplier(displayed.multiplier, displayed.exchangeRate),
      title: `页面实时倍率 ${displayed.multiplier} ÷ 当前汇率 ${displayed.exchangeRate} × ${FIXED_EXCHANGE_RATE}`,
    };
  }

  function clearFixedMultiplier(ratioCell) {
    ratioCell.querySelector(`.${VALUE_CLASS}`)?.remove();
    ratioCell.classList.remove(DUAL_RATIO_CLASS);
  }

  function syncRow(row) {
    const ratioCell = row.querySelector(".marketplace-ratio-cell");
    if (!ratioCell) return;

    const fixedMultiplier = getFixedMultiplier(row, ratioCell);
    if (!Number.isFinite(fixedMultiplier?.value)) {
      clearFixedMultiplier(ratioCell);
      return;
    }

    let value = ratioCell.querySelector(`.${VALUE_CLASS}`);
    if (!value) {
      value = document.createElement("span");
      value.className = VALUE_CLASS;
      ratioCell.append(value);
    }

    const formattedValue = formatMultiplier(fixedMultiplier.value);
    if (value.textContent !== formattedValue) value.textContent = formattedValue;
    value.dataset.a6apiFixedRateSource = fixedMultiplier.source;
    const title = `${fixedMultiplier.title} = ${formattedValue}`;
    if (value.title !== title) value.title = title;
    const ariaLabel = `固定汇率 6.95 倍率：${formattedValue}`;
    if (value.getAttribute("aria-label") !== ariaLabel) value.setAttribute("aria-label", ariaLabel);
    ratioCell.classList.add(DUAL_RATIO_CLASS);
  }

  function syncHeader() {
    const header = document.querySelector(".marketplace-ratio-header");
    if (!header) return;

    let label = header.querySelector(".a6api-fixed-rate-label");
    if (!label) {
      label = document.createElement("span");
      label.className = "a6api-fixed-rate-label";
      label.textContent = "6.95";
      label.title = "右侧蓝色数值使用固定汇率 6.95";
      const help = header.querySelector(".marketplace-info-help");
      header.insertBefore(label, help || null);
    }
    header.classList.add("a6api-fixed-rate-header");
  }

  function syncAll() {
    if (!isModelsPath(window.location.pathname)) return;
    installStyles();
    syncHeader();
    document.querySelectorAll(ROW_SELECTOR).forEach(syncRow);
  }

  let animationFrame = 0;
  function scheduleSync() {
    if (animationFrame) return;
    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = 0;
      syncAll();
    });
  }

  function handleMutations(records) {
    if (records.some((record) => (
      record.type !== "attributes" || !record.target.closest?.(`.${VALUE_CLASS}`)
    ))) {
      scheduleSync();
    }
  }

  const observer = new MutationObserver(handleMutations);
  observer.observe(document.documentElement, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
    attributeFilter: ["data-market-official-price", "title"],
  });
  syncAll();
})();
