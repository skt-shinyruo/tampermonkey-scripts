  const USAGE_TPS_THRESHOLDS = {
    good: 40,
    warn: 20,
    slow: 5,
  };

  const USAGE_TPS_TEXT_CLASSES = {
    good: 'font-medium tabular-nums text-emerald-600 dark:text-emerald-400',
    warn: 'font-medium tabular-nums text-amber-600 dark:text-amber-400',
    slow: 'font-medium tabular-nums text-orange-600 dark:text-orange-400',
    critical: 'font-medium tabular-nums text-red-600 dark:text-red-400',
  };

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
[data-sub2api-usage-latency-tps="true"],
[data-sub2api-usage-latency-tps-label="true"] {
  user-select: text;
  -webkit-user-select: text;
  white-space: nowrap;
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
    const latencyElements = getUsageLatencyElements(cell);
    const { firstTokenValue, durationValue } = latencyElements;
    const tps = durationValue
      ? calculateUsageRowTps({ firstTokenValue, rowElement, typeCell, usageRow })
      : null;
    if (tps === null) {
      removeUsageLatencyTps(latencyElements.grid || durationValue || cell);
      removeUsageLatencyBar(latencyElements.bar);
      delete cell.dataset.sub2apiUsageTpsApplied;
      return;
    }

    const tpsClassName = getUsageTpsClassName(tps);
    applyUsageLatencyTps(latencyElements, tps, tpsClassName);
    applyUsageLatencyBar({
      bar: latencyElements.bar,
      firstTokenValue,
      durationValue,
      tpsClassName,
    });
    cell.dataset.sub2apiUsageTpsApplied = 'true';
  }

  function getUsageLatencyEntry(cell, labelMatcher) {
    const label = [...cell.querySelectorAll('span')]
      .find((candidate) => labelMatcher(normalizeUsageCellText(candidate)));
    if (!label?.parentElement) {
      return null;
    }

    const siblings = [...label.parentElement.children];
    const value = siblings[siblings.indexOf(label) + 1] || null;
    return value ? { grid: label.parentElement, label, value } : null;
  }

  function getUsageLatencyElements(cell) {
    const firstToken = getUsageLatencyEntry(cell, (text) =>
      text === '首字' || text.toLowerCase() === 'first',
    );
    const duration = getUsageLatencyEntry(cell, (text) =>
      text === '总耗时' || text.toLowerCase() === 'total',
    );
    return {
      grid: duration?.grid || firstToken?.grid || null,
      bar: getUsageLatencyBarElement(duration?.grid || firstToken?.grid || null),
      firstTokenLabel: firstToken?.label || null,
      firstTokenValue: firstToken?.value || null,
      durationLabel: duration?.label || null,
      durationValue: duration?.value || null,
    };
  }

  function getUsageLatencyBarElement(grid) {
    if (!grid?.parentElement) {
      return null;
    }

    return [...grid.parentElement.children]
      .find((candidate) =>
        candidate !== grid &&
        candidate.tagName === 'SPAN' &&
        String(candidate.className || '').split(/\s+/).includes('w-1'),
      ) || null;
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

  function getUsageTpsClassName(tps) {
    if (tps > USAGE_TPS_THRESHOLDS.good) {
      return USAGE_TPS_TEXT_CLASSES.good;
    }
    if (tps > USAGE_TPS_THRESHOLDS.warn) {
      return USAGE_TPS_TEXT_CLASSES.warn;
    }
    if (tps > USAGE_TPS_THRESHOLDS.slow) {
      return USAGE_TPS_TEXT_CLASSES.slow;
    }
    return USAGE_TPS_TEXT_CLASSES.critical;
  }

  function applyUsageLatencyTps({ grid, durationLabel, durationValue }, tps, tpsClassName) {
    if (!grid || !durationValue) {
      return;
    }

    removeUsageLatencyTps(durationValue);
    const tpsValues = [...grid.querySelectorAll('[data-sub2api-usage-latency-tps="true"]')]
      .filter((element) => element.parentElement === grid);
    const tpsLabels = [...grid.querySelectorAll('[data-sub2api-usage-latency-tps-label="true"]')]
      .filter((element) => element.parentElement === grid);
    const tpsValue = tpsValues[0] || document.createElement('span');
    const tpsLabel = tpsLabels[0] || document.createElement('span');

    for (const duplicate of tpsValues.slice(1)) {
      duplicate.remove();
    }
    for (const duplicate of tpsLabels.slice(1)) {
      duplicate.remove();
    }

    tpsLabel.dataset.sub2apiUsageLatencyTpsLabel = 'true';
    tpsValue.dataset.sub2apiUsageLatencyTps = 'true';
    tpsLabel.className = durationLabel?.className || '';
    tpsValue.className = tpsClassName;
    appendUsageLatencyTpsPair(grid, tpsLabel, tpsValue);
    setUsageTextIfChanged(tpsLabel, 'TPS');
    setUsageTextIfChanged(tpsValue, `${tps.toFixed(2)} t/s`);
  }

  function applyUsageLatencyBar({ bar, firstTokenValue, durationValue, tpsClassName }) {
    if (!bar) {
      return;
    }

    const segments = [
      { className: firstTokenValue?.className || '', key: 'first-token' },
      { className: durationValue?.className || '', key: 'duration' },
      { className: tpsClassName, key: 'tps' },
    ].map(({ className, key }) => {
      const matches = [...bar.children]
        .filter((child) => child.dataset.sub2apiUsageLatencyBarSegment === key);
      const segment = matches[0] || document.createElement('span');
      for (const duplicate of matches.slice(1)) {
        duplicate.remove();
      }

      segment.dataset.sub2apiUsageLatencyBarSegment = key;
      segment.className = className;
      segment.style.backgroundColor = 'currentColor';
      if (segment.parentElement !== bar) {
        bar.appendChild(segment);
      }
      return segment;
    });

    bar.style.backgroundImage = 'none';
    bar.style.display = 'grid';
    bar.style.gridTemplateRows = 'repeat(3, minmax(0, 1fr))';
    bar.style.rowGap = '0.125rem';
    bar.dataset.sub2apiUsageLatencyTpsBar = 'true';
    return segments;
  }

  function removeUsageLatencyBar(bar) {
    if (!bar || bar.dataset.sub2apiUsageLatencyTpsBar !== 'true') {
      return;
    }

    for (const segment of [...bar.children]) {
      if (segment.dataset.sub2apiUsageLatencyBarSegment) {
        segment.remove();
      }
    }
    bar.style.backgroundImage = '';
    bar.style.display = '';
    bar.style.gridTemplateRows = '';
    bar.style.rowGap = '';
    delete bar.dataset.sub2apiUsageLatencyTpsBar;
  }

  function appendUsageLatencyTpsPair(grid, tpsLabel, tpsValue) {
    const children = [...grid.children];
    if (children[children.length - 2] === tpsLabel && children[children.length - 1] === tpsValue) {
      return;
    }

    if (tpsLabel.parentElement === grid) {
      tpsLabel.remove();
    }
    if (tpsValue.parentElement === grid) {
      tpsValue.remove();
    }
    grid.appendChild(tpsLabel);
    grid.appendChild(tpsValue);
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

    for (const tpsElement of element.querySelectorAll(
      '[data-sub2api-usage-latency-tps="true"], [data-sub2api-usage-latency-tps-label="true"]',
    )) {
      tpsElement.remove();
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
