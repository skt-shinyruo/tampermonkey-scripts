  function scheduleUsageTableEnhancement() {
    if (usageTableEnhancementScheduled) {
      return;
    }

    usageTableEnhancementScheduled = true;
    window.setTimeout(() => {
      usageTableEnhancementScheduled = false;
      enhanceUsageTables();
    }, 0);
  }

  function enhanceUsageTables() {
    if (!isUsagePage() || !shouldEnableSub2apiHelper()) {
      return;
    }

    ensureUsageTableEnhancementStyleElement();
    for (const table of document.querySelectorAll('table')) {
      enhanceUsageTable(table);
    }
  }

  function ensureUsageTableEnhancementStyleElement() {
    if (usageTableEnhancementStyleElement?.isConnected) {
      return usageTableEnhancementStyleElement;
    }

    const existingStyle = document.querySelector('[data-sub2api-usage-table-enhancement-style="true"]');
    if (existingStyle) {
      usageTableEnhancementStyleElement = existingStyle;
      return usageTableEnhancementStyleElement;
    }

    const style = document.createElement('style');
    style.dataset.sub2apiUsageTableEnhancementStyle = 'true';
    style.textContent = `
[data-sub2api-usage-duration-stack="true"] {
  align-items: flex-start;
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.25;
  text-align: left;
}

[data-sub2api-usage-tps-value="true"] {
  color: #64748b;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.dark [data-sub2api-usage-tps-value="true"] {
  color: #94a3b8;
}

[data-sub2api-usage-fast-tier-icon="true"] {
  color: #f59e0b;
  display: inline-flex;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  margin-left: 4px;
  text-shadow: 0 0 6px rgba(245, 158, 11, 0.35);
  vertical-align: middle;
}
`;
    document.documentElement.appendChild(style);
    usageTableEnhancementStyleElement = style;
    return usageTableEnhancementStyleElement;
  }

  function enhanceUsageTable(table) {
    const columnIndexes = getUsageTableColumnIndexes(table);
    if (!columnIndexes || columnIndexes.duration < 0 || columnIndexes.cost < 0) {
      return;
    }

    for (const rowElement of table.querySelectorAll('tr')) {
      const cells = [...rowElement.children].filter((child) => child.tagName === 'TD');
      if (!cells.length) {
        continue;
      }

      const usageRow = getUsageLogRowForTableRow(rowElement);
      enhanceUsageDurationCell({
        cell: cells[columnIndexes.duration],
        firstTokenCell: cells[columnIndexes.firstToken],
        rowElement,
        typeCell: cells[columnIndexes.type],
        tokensCell: cells[columnIndexes.tokens],
        usageRow,
      });
      enhanceUsageCostCell({
        cell: cells[columnIndexes.cost],
        rowElement,
        usageRow,
      });
    }
  }

  function getUsageTableColumnIndexes(table) {
    const labels = [...table.querySelectorAll('th')].map((header) => normalizeUsageColumnLabel(header.textContent));
    if (!labels.length) {
      return null;
    }

    return {
      cost: findUsageColumnIndex(labels, (label) => label.includes('费用') || label.includes('cost')),
      duration: findUsageColumnIndex(labels, (label) => label.includes('耗时') || label.includes('duration')),
      firstToken: findUsageColumnIndex(labels, (label) =>
        label.includes('首token') ||
        label.includes('首个token') ||
        label.includes('firsttoken') ||
        label.includes('firsttok'),
      ),
      tokens: findUsageColumnIndex(labels, (label) =>
        (label.includes('tokens') || label.includes('token') || label.includes('令牌')) &&
        !label.includes('first') &&
        !label.includes('首'),
      ),
      type: findUsageColumnIndex(labels, (label) =>
        label.includes('请求类型') ||
        label === '类型' ||
        label.includes('type'),
      ),
    };
  }

  function normalizeUsageColumnLabel(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  function findUsageColumnIndex(labels, predicate) {
    const index = labels.findIndex(predicate);
    return index >= 0 ? index : -1;
  }

  function getUsageLogRowForTableRow(rowElement) {
    const rowId = rowElement.getAttribute('data-row-id');
    if (rowId) {
      return usageLogRowsById.get(rowId) || usageLogRowsByRequestId.get(rowId) || null;
    }

    return null;
  }

  function enhanceUsageDurationCell({ cell, firstTokenCell, rowElement, tokensCell, typeCell, usageRow }) {
    if (!cell) {
      return;
    }

    cell.style.textAlign = 'left';
    const durationText = getUsageDurationDisplayText(cell);
    const tps = calculateUsageRowTps({ durationText, firstTokenCell, rowElement, tokensCell, typeCell, usageRow });
    if (tps === null) {
      removeUsageTps(cell, durationText);
      return;
    }

    applyUsageTps(cell, durationText, tps);
  }

  function calculateUsageRowTps({ durationText, firstTokenCell, rowElement, tokensCell, typeCell, usageRow }) {
    if (!isStreamingUsageRow({ rowElement, typeCell, usageRow })) {
      return null;
    }

    if (firstTokenCell && normalizeUsageCellText(firstTokenCell) === '-') {
      return null;
    }

    const outputTokens = getUsageRowOutputTokens(usageRow, tokensCell);
    const durationMs = getUsageRowDurationMs(usageRow, durationText);
    const firstTokenMs = getUsageRowFirstTokenMs(usageRow, firstTokenCell);
    if (outputTokens === null || durationMs === null || firstTokenMs === null) {
      return null;
    }

    const generationSeconds = (durationMs - firstTokenMs) / 1000;
    if (generationSeconds <= 0) {
      return null;
    }

    return outputTokens / generationSeconds;
  }

  function isStreamingUsageRow({ rowElement, typeCell, usageRow }) {
    const requestType = String(usageRow?.request_type || '').trim().toLowerCase();
    if (requestType === 'sync') {
      return false;
    }
    if (requestType === 'stream' || requestType === 'ws_v2' || requestType === 'cyber') {
      return true;
    }
    if (usageRow?.stream === false) {
      return false;
    }
    if (usageRow?.stream === true) {
      return true;
    }

    const typeText = normalizeUsageCellText(typeCell || rowElement).toLowerCase();
    if (/同步|sync/.test(typeText)) {
      return false;
    }
    return /流式|stream|ws|cyber/.test(typeText);
  }

  function getUsageRowOutputTokens(usageRow, tokensCell) {
    const outputTokens = toFiniteUsageNumber(usageRow?.output_tokens);
    if (outputTokens !== null) {
      return outputTokens;
    }

    const tokenNumbers = normalizeUsageCellText(tokensCell)
      .match(/\d[\d,]*/g)
      ?.map((value) => Number(value.replace(/,/g, '')))
      .filter((value) => Number.isFinite(value));
    if (!tokenNumbers?.length) {
      return null;
    }
    return tokenNumbers[tokenNumbers.length - 1];
  }

  function getUsageRowDurationMs(usageRow, durationText) {
    const durationMs = toFiniteUsageNumber(usageRow?.duration_ms);
    if (durationMs !== null) {
      return durationMs;
    }
    return parseUsageDurationMs(durationText);
  }

  function getUsageRowFirstTokenMs(usageRow, firstTokenCell) {
    const firstTokenMs = toFiniteUsageNumber(usageRow?.first_token_ms);
    if (firstTokenMs !== null) {
      return firstTokenMs;
    }
    return parseUsageDurationMs(normalizeUsageCellText(firstTokenCell));
  }

  function toFiniteUsageNumber(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  function parseUsageDurationMs(value) {
    const text = String(value || '').trim();
    if (!text || text === '-') {
      return null;
    }

    const match = text.match(/([\d.]+)\s*(ms|s)?/i);
    if (!match) {
      return null;
    }

    const numberValue = Number(match[1]);
    if (!Number.isFinite(numberValue)) {
      return null;
    }

    return match[2]?.toLowerCase() === 'ms' ? numberValue : numberValue * 1000;
  }

  function getUsageDurationDisplayText(cell) {
    const existingValue = cell.querySelector('[data-sub2api-usage-duration-value="true"]');
    if (existingValue) {
      return existingValue.textContent.trim();
    }

    return normalizeUsageCellText(cell).replace(/\s*\d+(?:\.\d+)?\s*TPS\s*$/i, '').trim();
  }

  function applyUsageTps(cell, durationText, tps) {
    let stack = cell.querySelector('[data-sub2api-usage-duration-stack="true"]');
    let durationValue = cell.querySelector('[data-sub2api-usage-duration-value="true"]');
    let tpsValue = cell.querySelector('[data-sub2api-usage-tps-value="true"]');

    if (!stack || !durationValue || !tpsValue) {
      cell.textContent = '';
      stack = document.createElement('div');
      stack.dataset.sub2apiUsageDurationStack = 'true';
      durationValue = document.createElement('span');
      durationValue.dataset.sub2apiUsageDurationValue = 'true';
      tpsValue = document.createElement('span');
      tpsValue.dataset.sub2apiUsageTpsValue = 'true';
      stack.appendChild(durationValue);
      stack.appendChild(tpsValue);
      cell.appendChild(stack);
    }

    durationValue.textContent = durationText;
    tpsValue.textContent = `${tps.toFixed(2)} TPS`;
    cell.dataset.sub2apiUsageTpsApplied = 'true';
  }

  function removeUsageTps(cell, durationText) {
    if (cell.querySelector('[data-sub2api-usage-duration-stack="true"]')) {
      cell.textContent = durationText;
    }
    delete cell.dataset.sub2apiUsageTpsApplied;
  }

  function enhanceUsageCostCell({ cell, rowElement, usageRow }) {
    if (!cell) {
      return;
    }

    if (!isFastUsageRow(usageRow, rowElement)) {
      removeUsageFastTierIcon(cell);
      return;
    }

    const icon = cell.querySelector('[data-sub2api-usage-fast-tier-icon="true"]') || document.createElement('span');
    icon.dataset.sub2apiUsageFastTierIcon = 'true';
    icon.textContent = '⚡';
    icon.title = 'Fast';
    icon.setAttribute('aria-label', 'Fast');
    icon.style.color = '#f59e0b';
    icon.style.display = 'inline-flex';
    icon.style.fontSize = '12px';
    icon.style.fontWeight = '700';
    icon.style.lineHeight = '1';
    icon.style.marginLeft = '4px';
    icon.style.verticalAlign = 'middle';

    const accountCostElement = getUsageAccountCostElement(cell);
    if (accountCostElement) {
      moveUsageFastTierIcon(icon, accountCostElement);
      return;
    }

    const amountElement = getUsageCostAmountElement(cell);
    if (amountElement && amountElement !== cell && amountElement.parentElement) {
      moveUsageFastTierIconAfter(icon, amountElement);
      return;
    }

    moveUsageFastTierIcon(icon, cell);
  }

  function removeUsageFastTierIcon(cell) {
    for (const icon of cell.querySelectorAll('[data-sub2api-usage-fast-tier-icon="true"]')) {
      icon.remove();
    }
    removeUsageFastTierStackMarkers(cell);
  }

  function isFastUsageRow(usageRow, rowElement) {
    if (hasUsageServiceTierValue(usageRow)) {
      return isFastServiceTierValue(usageRow.service_tier);
    }

    return hasFastUsageMarker(rowElement);
  }

  function hasUsageServiceTierValue(usageRow) {
    return usageRow?.service_tier !== null &&
      usageRow?.service_tier !== undefined &&
      String(usageRow.service_tier).trim() !== '';
  }

  function isFastServiceTierValue(value) {
    const normalizedValue = String(value || '').trim().toLowerCase();
    return normalizedValue === 'priority' || normalizedValue === 'fast';
  }

  function hasFastUsageMarker(element) {
    if (!element) {
      return false;
    }

    const values = [];
    collectUsageElementMarkerText(element, values);
    return values.some((value) => /(^|[^a-z])fast([^a-z]|$)|priority|快速/i.test(value));
  }

  function collectUsageElementMarkerText(element, values) {
    values.push(element.textContent || '');

    if (typeof element.getAttributeNames === 'function') {
      for (const name of element.getAttributeNames()) {
        values.push(element.getAttribute(name) || '');
      }
    } else if (element.attributes && typeof element.attributes === 'object') {
      for (const value of Object.values(element.attributes)) {
        values.push(value);
      }
    }

    for (const value of Object.values(element.dataset || {})) {
      values.push(value);
    }

    for (const child of element.children || []) {
      collectUsageElementMarkerText(child, values);
    }
  }

  function getUsageCostAmountElement(cell) {
    const candidates = [
      ...cell.querySelectorAll('span'),
      ...cell.querySelectorAll('div'),
    ];
    return candidates.find((candidate) => /\$\s*\d/.test(candidate.textContent || '')) || cell;
  }

  function getUsageAccountCostElement(cell) {
    const ownTextMatch = [...cell.querySelectorAll('div, span')]
      .filter((candidate) => candidate !== cell)
      .find((candidate) => /^A\s*\$\s*\d/i.test(getUsageElementOwnText(candidate)));
    if (ownTextMatch) {
      const parentElement = ownTextMatch.parentElement;
      if (
        parentElement &&
        parentElement !== cell &&
        cell.contains(parentElement) &&
        /^A\s*\$\s*\d/i.test(normalizeUsageCellText(parentElement))
      ) {
        return parentElement;
      }
      return ownTextMatch;
    }

    return [...cell.querySelectorAll('div, span')]
      .filter((candidate) => candidate !== cell)
      .find((candidate) => {
        const text = normalizeUsageCellText(candidate);
        if (!/^A\s*\$\s*\d/i.test(text)) {
          return false;
        }
        return ![...candidate.children || []].some((child) => /^\$\s*\d/i.test(normalizeUsageCellText(child)));
      }) || null;
  }

  function getUsageElementOwnText(element) {
    let text = element.textContent || '';
    for (const child of element.children || []) {
      text = text.replace(child.textContent || '', '');
    }
    return text.trim();
  }

  function moveUsageFastTierIcon(icon, parentElement) {
    if (icon.parentElement === parentElement) {
      return;
    }

    icon.remove();
    parentElement.appendChild(icon);
  }

  function moveUsageFastTierIconAfter(icon, amountElement) {
    const parentElement = amountElement.parentElement;
    if (!parentElement) {
      return;
    }

    if (icon.parentElement === parentElement) {
      const siblings = [...parentElement.children];
      if (siblings[siblings.indexOf(amountElement) + 1] === icon) {
        return;
      }
    }

    icon.remove();
    amountElement.insertAdjacentElement('afterend', icon);
  }

  function removeUsageFastTierStackMarkers(cell) {
    for (const stack of cell.querySelectorAll('[data-sub2api-usage-fast-tier-stack="true"]')) {
      delete stack.dataset.sub2apiUsageFastTierStack;
    }
  }

  function normalizeUsageCellText(element) {
    return String(element?.textContent || '').trim().replace(/\s+/g, ' ');
  }
