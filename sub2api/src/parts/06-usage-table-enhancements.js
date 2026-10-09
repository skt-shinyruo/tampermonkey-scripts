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

    enhanceUsageTokenSummaryCards();
    enhanceUsageCostSummaryCards();
    for (const table of document.querySelectorAll('table')) {
      enhanceUsageTable(table);
    }
  }

  function toFiniteUsageNumber(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function calculateUsageCacheHitRatePercent({
    input_tokens: inputTokens,
    cache_creation_tokens: cacheCreationTokens,
    cache_read_tokens: cacheReadTokens,
  } = {}) {
    const input = toFiniteUsageNumber(inputTokens) ?? 0;
    const creation = toFiniteUsageNumber(cacheCreationTokens) ?? 0;
    const read = toFiniteUsageNumber(cacheReadTokens) ?? 0;
    const promptTokens = input + creation + read;
    if (promptTokens <= 0 || read < 0) {
      return null;
    }

    const hitRate = (read / promptTokens) * 100;
    return Number.isFinite(hitRate) ? hitRate : null;
  }

  function isUsagePageChineseLocale() {
    const lang = String(document.documentElement?.lang || '').toLowerCase();
    if (!lang) {
      return true;
    }
    return lang.startsWith('zh');
  }

  function formatUsageCacheHitRateLabel(hitRate, isChinese) {
    return `${isChinese ? '命中率' : 'Hit Rate'}: ${hitRate.toFixed(2)}%`;
  }

  function getUsageCacheHitRateTitle(isChinese) {
    return isChinese
      ? '缓存命中率 = 缓存读取 / (输入 + 缓存创建 + 缓存读取)'
      : 'Cache hit rate = cache read / (input + cache creation + cache read)';
  }

  function isUsageImageBillingRow(row) {
    const imageCount = toFiniteUsageNumber(row?.image_count) ?? 0;
    const billingMode = String(row?.billing_mode || '');
    return imageCount > 0 && billingMode !== 'token' && billingMode !== 'video';
  }

  function enhanceUsageTable(table) {
    const columnIndexes = getUsageTableColumnIndexes(table);
    if (!columnIndexes || columnIndexes.tokens < 0) {
      return;
    }

    const enhancedCells = new Set();
    for (const rowElement of table.querySelectorAll('tr')) {
      const cells = [...rowElement.children].filter((child) => child.tagName === 'TD');
      if (!cells.length) {
        continue;
      }

      const tokensCell = cells[columnIndexes.tokens];
      if (!tokensCell) {
        continue;
      }

      enhancedCells.add(tokensCell);
      enhanceUsageTokensCell({
        cell: tokensCell,
        usageRow: getUsageLogRowForTableRow(rowElement),
      });
    }

    for (const marker of table.querySelectorAll(
      '[data-sub2api-usage-row-cache-hit-rate="true"], [data-sub2api-usage-row-cache-hit-rate-separator="true"]',
    )) {
      const cell = marker.closest('td');
      if (!cell || !enhancedCells.has(cell)) {
        marker.remove();
      }
    }
  }

  function getUsageTableColumnIndexes(table) {
    const labels = [...table.querySelectorAll('th')].map((header) => normalizeUsageColumnLabel(header.textContent));
    if (!labels.length) {
      return null;
    }

    return {
      tokens: findUsageColumnIndex(labels, (label) =>
        (label.includes('tokens') || label.includes('token') || label.includes('令牌')) &&
        !label.includes('first') &&
        !label.includes('首'),
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

  function enhanceUsageTokensCell({ cell, usageRow }) {
    if (!cell || !usageRow || isUsageImageBillingRow(usageRow)) {
      removeUsageRowCacheHitRate(cell);
      return;
    }

    const hitRate = calculateUsageCacheHitRatePercent(usageRow);
    if (hitRate === null) {
      removeUsageRowCacheHitRate(cell);
      return;
    }

    const mount = getUsageRowCacheHitRateMount(cell);
    if (!mount) {
      removeUsageRowCacheHitRate(cell);
      return;
    }

    const onCacheLine = isUsageCacheTokenLine(mount);
    const isChinese = isUsagePageChineseLocale();
    const rateElement = getOrCreateUsageRowCacheHitRateElement(cell);
    const separator = getOrCreateUsageRowCacheHitRateSeparator(cell);
    rateElement.className = 'font-medium tabular-nums text-sky-600 dark:text-sky-400 whitespace-nowrap';
    rateElement.title = getUsageCacheHitRateTitle(isChinese);
    rateElement.setAttribute('aria-label', isChinese ? '缓存命中率' : 'Cache hit rate');
    separator.className = 'text-gray-400 dark:text-gray-500';
    setUsageTextIfChanged(rateElement, formatUsageRowCacheHitRateLabel(hitRate));
    setUsageTextIfChanged(separator, onCacheLine ? '/' : '·');

    const mountChildren = [...mount.children];
    const separatorIndex = mountChildren.indexOf(separator);
    const rateIndex = mountChildren.indexOf(rateElement);
    if (
      separator.parentElement !== mount ||
      rateElement.parentElement !== mount ||
      separatorIndex < 0 ||
      rateIndex !== separatorIndex + 1
    ) {
      separator.remove();
      rateElement.remove();
      mount.appendChild(separator);
      mount.appendChild(rateElement);
    }
  }

  function formatUsageRowCacheHitRateLabel(hitRate) {
    return `${hitRate.toFixed(2)}%`;
  }

  function getUsageTokensStack(cell) {
    return cell.querySelector('.space-y-1') || null;
  }

  function isUsageRowCacheHitRateMarker(element) {
    return (
      element?.dataset?.sub2apiUsageRowCacheHitRate === 'true' ||
      element?.dataset?.sub2apiUsageRowCacheHitRateSeparator === 'true'
    );
  }

  function isUsageCacheTokenLine(line) {
    return [...line.querySelectorAll('span')].some((element) =>
      !isUsageRowCacheHitRateMarker(element) &&
      /(?:^|\s)text-(?:sky|amber)-/.test(element.className || ''),
    );
  }

  function getUsageRowCacheHitRateMount(cell) {
    const stack = getUsageTokensStack(cell);
    if (!stack) {
      return cell;
    }

    const lines = [...stack.children].filter((child) => !isUsageRowCacheHitRateMarker(child));
    if (!lines.length) {
      return stack;
    }

    const cacheLine = lines.find((line) => isUsageCacheTokenLine(line));
    return cacheLine || lines[0];
  }

  function getOrCreateUsageRowCacheHitRateSeparator(cell) {
    const existing = cell.querySelector('[data-sub2api-usage-row-cache-hit-rate-separator="true"]');
    if (existing) {
      return existing;
    }

    const separator = document.createElement('span');
    separator.dataset.sub2apiUsageRowCacheHitRateSeparator = 'true';
    return separator;
  }

  function getOrCreateUsageRowCacheHitRateElement(cell) {
    const existing = cell.querySelector('[data-sub2api-usage-row-cache-hit-rate="true"]');
    if (existing) {
      return existing;
    }

    const rateElement = document.createElement('span');
    rateElement.dataset.sub2apiUsageRowCacheHitRate = 'true';
    return rateElement;
  }

  function removeUsageRowCacheHitRate(cell) {
    if (!cell) {
      return;
    }

    for (const marker of cell.querySelectorAll(
      '[data-sub2api-usage-row-cache-hit-rate="true"], [data-sub2api-usage-row-cache-hit-rate-separator="true"]',
    )) {
      marker.remove();
    }
  }

  function enhanceUsageTokenSummaryCards() {
    const summaryLines = new Map();
    for (const candidate of document.querySelectorAll('span')) {
      if (!isUsageCacheSummaryLabel(getUsageElementOwnText(candidate))) {
        continue;
      }

      const summary = getUsageTokenSummaryLine(candidate);
      if (summary) {
        summaryLines.set(summary.line, summary);
      }
    }

    for (const summary of summaryLines.values()) {
      enhanceUsageTokenSummaryLine(summary);
    }

    for (const marker of document.querySelectorAll(
      '[data-sub2api-usage-cache-hit-rate="true"], [data-sub2api-usage-cache-hit-rate-separator="true"]',
    )) {
      if (!summaryLines.has(marker.parentElement)) {
        marker.remove();
      }
    }
  }

  function getUsageTokenSummaryLine(cacheLabel) {
    let current = cacheLabel;
    while (current?.parentElement) {
      const line = current.parentElement;
      const hasInputLabel = [...line.querySelectorAll('span')]
        .some((candidate) => isUsageInputSummaryLabel(getUsageElementOwnText(candidate)));
      if (hasInputLabel) {
        return { cacheLabel, cacheRoot: current, line };
      }
      current = line;
    }
    return null;
  }

  function enhanceUsageTokenSummaryLine({ cacheLabel, cacheRoot, line }) {
    const inputLabel = [...line.querySelectorAll('span')]
      .find((candidate) => isUsageInputSummaryLabel(getUsageElementOwnText(candidate)));
    const inputTokens = parseUsageSummaryTokenValue(getUsageElementOwnText(inputLabel));
    const displayedCacheTokens = parseUsageSummaryTokenValue(getUsageElementOwnText(cacheLabel));
    if (inputTokens === null || displayedCacheTokens === null) {
      removeUsageCacheHitRate(line);
      return;
    }

    const cacheBreakdown = getUsageCacheBreakdown(cacheRoot);
    const hasCacheBreakdown = cacheBreakdown.creation !== null || cacheBreakdown.read !== null;
    const cacheCreationTokens = hasCacheBreakdown ? (cacheBreakdown.creation || 0) : 0;
    const cacheReadTokens = hasCacheBreakdown
      ? (cacheBreakdown.read || 0)
      : displayedCacheTokens;
    const hitRate = calculateUsageCacheHitRatePercent({
      input_tokens: inputTokens,
      cache_creation_tokens: cacheCreationTokens,
      cache_read_tokens: cacheReadTokens,
    });
    if (hitRate === null) {
      removeUsageCacheHitRate(line);
      return;
    }

    const separator = getOrCreateUsageCacheHitRateSeparator(line);
    const rateElement = getOrCreateUsageCacheHitRateElement(line);
    const isChinese = /缓存/.test(getUsageElementOwnText(cacheLabel));
    separator.className = findUsageSummarySeparatorClass(line);
    rateElement.className = inputLabel?.className || '';
    rateElement.style.whiteSpace = 'nowrap';
    rateElement.title = getUsageCacheHitRateTitle(isChinese);
    rateElement.setAttribute('aria-label', isChinese ? '缓存命中率' : 'Cache hit rate');
    setUsageTextIfChanged(separator, '/');
    setUsageTextIfChanged(rateElement, formatUsageCacheHitRateLabel(hitRate, isChinese));
    placeUsageSummaryElementAfter(cacheRoot, separator);
    placeUsageSummaryElementAfter(separator, rateElement);
  }

  function getUsageCacheBreakdown(cacheRoot) {
    let creation = null;
    let read = null;
    for (const label of cacheRoot.querySelectorAll('span')) {
      const labelText = getUsageElementOwnText(label).toLowerCase();
      if (!/^(缓存创建|cache creation)$/.test(labelText) &&
        !/^(缓存读取|cache read)$/.test(labelText)) {
        continue;
      }

      const parent = label.parentElement;
      if (!parent) {
        continue;
      }
      const siblings = [...parent.children];
      const valueElement = siblings[siblings.indexOf(label) + 1];
      const value = parseUsageSummaryTokenValue(valueElement?.textContent);
      if (labelText === '缓存创建' || labelText === 'cache creation') {
        creation = value;
      } else {
        read = value;
      }
    }
    return { creation, read };
  }

  function getOrCreateUsageCacheHitRateSeparator(line) {
    const existing = [...line.querySelectorAll(
      '[data-sub2api-usage-cache-hit-rate-separator="true"]',
    )].find((element) => element.parentElement === line);
    if (existing) {
      return existing;
    }

    const separator = document.createElement('span');
    separator.dataset.sub2apiUsageCacheHitRateSeparator = 'true';
    return separator;
  }

  function getOrCreateUsageCacheHitRateElement(line) {
    const existing = [...line.querySelectorAll('[data-sub2api-usage-cache-hit-rate="true"]')]
      .find((element) => element.parentElement === line);
    if (existing) {
      return existing;
    }

    const rateElement = document.createElement('span');
    rateElement.dataset.sub2apiUsageCacheHitRate = 'true';
    return rateElement;
  }

  function findUsageSummarySeparatorClass(line) {
    return [...line.children]
      .find((element) => normalizeUsageCellText(element) === '/')
      ?.className || '';
  }

  function placeUsageSummaryElementAfter(anchor, element) {
    if (!anchor?.parentElement || anchor === element) {
      return;
    }

    element.remove();
    anchor.insertAdjacentElement('afterend', element);
  }

  function removeUsageCacheHitRate(line) {
    if (!line) {
      return;
    }

    for (const marker of line.querySelectorAll(
      '[data-sub2api-usage-cache-hit-rate="true"], [data-sub2api-usage-cache-hit-rate-separator="true"]',
    )) {
      marker.remove();
    }
  }

  function enhanceUsageCostSummaryCards() {
    const summaryLines = new Map();
    for (const candidate of document.querySelectorAll('span')) {
      if (!isUsageAccountCostSummaryLabel(getUsageElementOwnText(candidate))) {
        continue;
      }

      const summary = getUsageCostSummary(candidate);
      if (summary) {
        summaryLines.set(summary.line, summary);
      }
    }

    for (const summary of summaryLines.values()) {
      enhanceUsageCostSummaryLine(summary);
    }

    for (const marker of document.querySelectorAll(
      '[data-sub2api-usage-income="true"], [data-sub2api-usage-income-separator="true"]',
    )) {
      if (!summaryLines.has(marker.parentElement)) {
        marker.remove();
      }
    }
  }

  function getUsageCostSummary(costLabel) {
    const line = costLabel.parentElement;
    const card = line?.parentElement;
    if (!line || !card) {
      return null;
    }

    const hasTotalLabel = [...card.children].some((element) =>
      isUsageTotalCostSummaryLabel(getUsageElementOwnText(element)),
    );
    if (!hasTotalLabel) {
      return null;
    }

    const totalElement = [...card.children].find((element) =>
      element !== line && parseUsageMoneyValue(getUsageElementOwnText(element)) !== null,
    );
    if (!totalElement) {
      return null;
    }

    return { costLabel, line, totalElement };
  }

  function enhanceUsageCostSummaryLine({ costLabel, line, totalElement }) {
    const totalCost = parseUsageMoneyValue(getUsageElementOwnText(totalElement));
    const accountCost = parseUsageMoneyValue(getUsageElementOwnText(costLabel));
    if (totalCost === null || accountCost === null) {
      removeUsageIncome(line);
      return;
    }

    const income = Number((totalCost - accountCost).toFixed(4));
    if (!Number.isFinite(income)) {
      removeUsageIncome(line);
      return;
    }

    const separator = getOrCreateUsageIncomeSeparator(line);
    const incomeElement = getOrCreateUsageIncomeElement(line);
    const isChinese = /成本/.test(getUsageElementOwnText(costLabel));
    separator.className = findUsageCostSummarySeparatorClass(line);
    incomeElement.className = income < 0
      ? 'text-red-600 dark:text-red-400'
      : 'text-emerald-600 dark:text-emerald-400';
    incomeElement.style.whiteSpace = 'nowrap';
    incomeElement.title = isChinese
      ? '收入 = 总消费 - 成本'
      : 'Income = Total Cost - Cost';
    incomeElement.setAttribute('aria-label', isChinese ? '收入' : 'Income');
    setUsageTextIfChanged(separator, ' · ');
    setUsageTextIfChanged(
      incomeElement,
      `${isChinese ? '收入' : 'Income'} ${formatUsageSignedMoney(income)}`,
    );
    placeUsageSummaryElementAfter(costLabel, separator);
    placeUsageSummaryElementAfter(separator, incomeElement);
  }

  function getOrCreateUsageIncomeSeparator(line) {
    const existing = [...line.querySelectorAll('[data-sub2api-usage-income-separator="true"]')]
      .find((element) => element.parentElement === line);
    if (existing) {
      return existing;
    }

    const separator = document.createElement('span');
    separator.dataset.sub2apiUsageIncomeSeparator = 'true';
    return separator;
  }

  function getOrCreateUsageIncomeElement(line) {
    const existing = [...line.querySelectorAll('[data-sub2api-usage-income="true"]')]
      .find((element) => element.parentElement === line);
    if (existing) {
      return existing;
    }

    const incomeElement = document.createElement('span');
    incomeElement.dataset.sub2apiUsageIncome = 'true';
    return incomeElement;
  }

  function findUsageCostSummarySeparatorClass(line) {
    return [...line.children]
      .find((element) =>
        element.dataset?.sub2apiUsageIncomeSeparator !== 'true' &&
        normalizeUsageCellText(element) === '·',
      )
      ?.className || '';
  }

  function removeUsageIncome(line) {
    if (!line) {
      return;
    }

    for (const marker of line.querySelectorAll(
      '[data-sub2api-usage-income="true"], [data-sub2api-usage-income-separator="true"]',
    )) {
      marker.remove();
    }
  }

  function isUsageAccountCostSummaryLabel(text) {
    return /^(成本|cost)\s*\$\s*[0-9]/i.test(String(text || '').trim());
  }

  function isUsageTotalCostSummaryLabel(text) {
    return /^(总消费|total cost)$/i.test(String(text || '').trim());
  }

  function parseUsageMoneyValue(text) {
    const match = String(text || '').replace(/,/g, '').match(/\$\s*(-?[0-9]+(?:\.[0-9]+)?)/);
    if (!match) {
      return null;
    }

    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }

  function formatUsageSignedMoney(value) {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(4)}`;
  }

  function isUsageInputSummaryLabel(text) {
    return /^(输入|input)\s*[:：]/i.test(String(text || '').trim());
  }

  function isUsageCacheSummaryLabel(text) {
    return /^(缓存|cache)\s*[:：]/i.test(String(text || '').trim());
  }

  function parseUsageSummaryTokenValue(text) {
    const match = String(text || '').replace(/,/g, '').match(
      /([0-9]+(?:\.[0-9]+)?)\s*([KMBT])?/i,
    );
    if (!match) {
      return null;
    }

    const baseValue = Number(match[1]);
    const multiplier = {
      K: 1e3,
      M: 1e6,
      B: 1e9,
      T: 1e12,
    }[String(match[2] || '').toUpperCase()] || 1;
    const value = baseValue * multiplier;
    return Number.isFinite(value) ? value : null;
  }

  function setUsageTextIfChanged(element, text) {
    if (element.textContent === text) {
      return;
    }
    element.textContent = text;
  }

  function getUsageElementOwnText(element) {
    let text = element.textContent || '';
    for (const child of element.children || []) {
      text = text.replace(child.textContent || '', '');
    }
    return text.trim();
  }

  function normalizeUsageCellText(element) {
    return String(element?.textContent || '').trim().replace(/\s+/g, ' ');
  }
