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
[data-sub2api-usage-latency-tps="true"] {
  display: block;
  color: #64748b;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.25;
  margin-top: 2px;
  user-select: text;
  -webkit-user-select: text;
  white-space: nowrap;
}

.dark [data-sub2api-usage-latency-tps="true"] {
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

[data-sub2api-usage-user-agent-stack="true"] {
  display: inline-block;
  line-height: 1.25;
  text-align: left;
  user-select: text;
  -webkit-user-select: text;
}

[data-sub2api-usage-user-agent-value="true"],
[data-sub2api-usage-request-id-value="true"] {
  display: block;
  user-select: text;
  -webkit-user-select: text;
}

[data-sub2api-usage-request-id-value="true"] {
  color: #64748b;
  font-size: 11px;
  font-weight: 500;
  margin-top: 2px;
  white-space: nowrap;
}

.dark [data-sub2api-usage-request-id-value="true"] {
  color: #94a3b8;
}
`;
    document.documentElement.appendChild(style);
    usageTableEnhancementStyleElement = style;
    return usageTableEnhancementStyleElement;
  }

  function enhanceUsageTable(table) {
    const columnIndexes = getUsageTableColumnIndexes(table);
    if (!columnIndexes || columnIndexes.latency < 0 || columnIndexes.cost < 0) {
      return;
    }

    for (const rowElement of table.querySelectorAll('tr')) {
      const cells = [...rowElement.children].filter((child) => child.tagName === 'TD');
      if (!cells.length) {
        continue;
      }

      const usageRow = getUsageLogRowForTableRow(rowElement);
      enhanceUsageLatencyCell({
        cell: cells[columnIndexes.latency],
        rowElement,
        typeCell: cells[columnIndexes.type],
        usageRow,
      });
      enhanceUsageCostCell({
        cell: cells[columnIndexes.cost],
        rowElement,
        usageRow,
      });
      enhanceUsageUserAgentCell({
        cell: cells[columnIndexes.userAgent],
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
      latency: findUsageColumnIndex(labels, (label) =>
        label === '延迟' || label === 'latency',
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
      userAgent: findUsageColumnIndex(labels, (label) =>
        label.includes('useragent') ||
        label.includes('user-agent') ||
        label.includes('ua'),
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

  function enhanceUsageLatencyCell({ cell, rowElement, typeCell, usageRow }) {
    if (!cell) {
      return;
    }

    cell.style.textAlign = 'left';
    const { firstTokenValue, durationValue } = getUsageLatencyElements(cell);
    const tps = durationValue
      ? calculateUsageRowTps({ firstTokenValue, rowElement, typeCell, usageRow })
      : null;
    if (tps === null) {
      removeUsageLatencyTps(durationValue || cell);
      delete cell.dataset.sub2apiUsageTpsApplied;
      return;
    }

    applyUsageLatencyTps(durationValue, tps);
    cell.dataset.sub2apiUsageTpsApplied = 'true';
  }

  function getUsageLatencyValueElement(cell, labelMatcher) {
    const label = [...cell.querySelectorAll('span')]
      .find((candidate) => labelMatcher(normalizeUsageCellText(candidate)));
    if (!label?.parentElement) {
      return null;
    }

    const siblings = [...label.parentElement.children];
    return siblings[siblings.indexOf(label) + 1] || null;
  }

  function getUsageLatencyElements(cell) {
    return {
      firstTokenValue: getUsageLatencyValueElement(cell, (text) =>
        text === '首字' || text.toLowerCase() === 'first',
      ),
      durationValue: getUsageLatencyValueElement(cell, (text) =>
        text === '总耗时' || text.toLowerCase() === 'total',
      ),
    };
  }

  function calculateUsageRowTps({ firstTokenValue, rowElement, typeCell, usageRow }) {
    if (!isStreamingUsageRow({ rowElement, typeCell, usageRow })) {
      return null;
    }

    if (!firstTokenValue || normalizeUsageCellText(firstTokenValue) === '-') {
      return null;
    }

    const outputTokens = toFiniteUsageNumber(usageRow?.output_tokens);
    const durationMs = toFiniteUsageNumber(usageRow?.duration_ms);
    const firstTokenMs = toFiniteUsageNumber(usageRow?.first_token_ms);
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

  function toFiniteUsageNumber(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  function applyUsageLatencyTps(durationValue, tps) {
    if (!durationValue) {
      return;
    }

    const tpsValues = [...durationValue.querySelectorAll('[data-sub2api-usage-latency-tps="true"]')];
    let tpsValue = tpsValues[0];
    for (const duplicate of tpsValues.slice(1)) {
      duplicate.remove();
    }

    if (!tpsValue) {
      tpsValue = document.createElement('span');
      tpsValue.dataset.sub2apiUsageLatencyTps = 'true';
      durationValue.appendChild(tpsValue);
    }

    setUsageTextIfChanged(tpsValue, `${tps.toFixed(2)} TPS`);
  }

  function setUsageTextIfChanged(element, text) {
    if (element.textContent === text) {
      return;
    }
    element.textContent = text;
  }

  function removeUsageLatencyTps(element) {
    if (!element) {
      return;
    }

    for (const tpsValue of element.querySelectorAll('[data-sub2api-usage-latency-tps="true"]')) {
      tpsValue.remove();
    }
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

  function enhanceUsageUserAgentCell({ cell, usageRow }) {
    if (!cell) {
      return;
    }

    if (!isAdminUsagePage()) {
      return;
    }

    const requestId = normalizeUsageRequestId(usageRow?.request_id);
    if (!requestId) {
      removeUsageRequestId(cell);
      return;
    }

    let stack = cell.querySelector('[data-sub2api-usage-user-agent-stack="true"]');
    let userAgentValue = cell.querySelector('[data-sub2api-usage-user-agent-value="true"]');
    let requestIdValue = cell.querySelector('[data-sub2api-usage-request-id-value="true"]');

    if (!stack || !userAgentValue || !requestIdValue) {
      const existingText = normalizeUsageCellText(cell);
      cell.textContent = '';
      stack = document.createElement('div');
      stack.dataset.sub2apiUsageUserAgentStack = 'true';
      userAgentValue = document.createElement('span');
      userAgentValue.dataset.sub2apiUsageUserAgentValue = 'true';
      requestIdValue = document.createElement('span');
      requestIdValue.dataset.sub2apiUsageRequestIdValue = 'true';
      stack.appendChild(userAgentValue);
      stack.appendChild(requestIdValue);
      cell.appendChild(stack);
      setUsageTextIfChanged(userAgentValue, existingText);
    }

    setUsageTextIfChanged(requestIdValue, `Request ID: ${requestId}`);
    cell.style.textAlign = 'left';
  }

  function removeUsageRequestId(cell) {
    const stack = cell.querySelector('[data-sub2api-usage-user-agent-stack="true"]');
    if (!stack) {
      return;
    }

    const userAgentValue = cell.querySelector('[data-sub2api-usage-user-agent-value="true"]');
    if (userAgentValue) {
      cell.textContent = userAgentValue.textContent;
    }
  }

  function normalizeUsageRequestId(value) {
    const normalizedValue = String(value || '').trim();
    return normalizedValue || null;
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
