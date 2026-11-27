  const ACCOUNT_USAGE_LINK_ATTRIBUTE = 'data-sub2api-account-usage-link';
  const ACCOUNT_USAGE_LINK_ID_ATTRIBUTE = 'data-sub2api-account-usage-id';
  const ACCOUNT_USAGE_GUTTER_ATTRIBUTE = 'data-sub2api-account-usage-gutter';
  const ACCOUNT_USAGE_NOTICE_ATTRIBUTE = 'data-sub2api-account-usage-notice';
  const ACCOUNT_USAGE_ACTION_GUTTER_EM = 1.6;
  const ACCOUNT_USAGE_LINK_INJECTION_DELAY_MS = 50;
  const ACCOUNT_USAGE_DEEP_LINK_TIMEOUT_MS = 8000;
  const ACCOUNT_USAGE_SELECTION_TIMEOUT_MS = 2500;
  const ACCOUNT_USAGE_NOTICE_WATCH_INTERVAL_MS = 500;

  let accountUsageLinkObserver = null;
  let accountUsageLinkInjectionTimer = null;
  let accountUsageLinkInjectionPending = false;
  let accountUsageDeepLinkToken = 0;
  let accountUsageDeepLinkRunning = false;
  let accountUsageDeepLinkActiveKey = null;
  let accountUsageDeepLinkAppliedKey = null;
  let accountUsageNoticeWatchTimer = null;

  function isAccountUsageShortcutEnabled() {
    return isFeatureEnabled(FEATURE_IDS.ADMIN_ACCOUNTS_USAGE_LINK);
  }

  function createAccountUsageLinkIcon() {
    if (typeof document.createElementNS !== 'function') {
      return null;
    }

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M7 3h7l4 4v14H7zM14 3v5h5M10 12h5M10 16h5');
    svg.appendChild(path);
    return svg;
  }

  function createAccountUsageLink(accountId) {
    const link = document.createElement('a');
    link.className = 'inline-flex items-center justify-center text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300';
    setStyles(link, {
      boxSizing: 'border-box',
      height: '1em',
      left: '0',
      lineHeight: '1',
      position: 'absolute',
      top: '0.15em',
      width: '1em',
    });
    link.setAttribute('href', `/admin/usage?account_id=${encodeURIComponent(String(accountId))}`);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    link.setAttribute('title', '查看该账号的使用记录');
    link.setAttribute('aria-label', '查看该账号的使用记录');
    link.setAttribute(ACCOUNT_USAGE_LINK_ATTRIBUTE, 'true');
    link.setAttribute(ACCOUNT_USAGE_LINK_ID_ATTRIBUTE, String(accountId));

    const icon = createAccountUsageLinkIcon();
    if (icon) {
      link.appendChild(icon);
    }

    return link;
  }

  function findAccountNameCell(row) {
    const cells = [...row.children].filter((child) => child.tagName === 'TD');
    for (const cell of cells) {
      if (cell.querySelector('.font-medium') || cell.querySelector('a')) {
        return cell;
      }
    }
    return cells[1] || null;
  }

  function applyAccountUsageGutter(container) {
    if (!container) {
      return;
    }

    if (container.getAttribute(ACCOUNT_USAGE_GUTTER_ATTRIBUTE) !== 'true') {
      container.setAttribute(ACCOUNT_USAGE_GUTTER_ATTRIBUTE, 'true');
    }

    const paddingLeft = `${ACCOUNT_USAGE_ACTION_GUTTER_EM}em`;
    if (container.style.paddingLeft !== paddingLeft) {
      container.style.paddingLeft = paddingLeft;
    }
    if (container.style.position !== 'relative') {
      container.style.position = 'relative';
    }
  }

  function resetAccountUsageGutter(container) {
    if (!container || container.getAttribute(ACCOUNT_USAGE_GUTTER_ATTRIBUTE) !== 'true') {
      return;
    }

    container.removeAttribute(ACCOUNT_USAGE_GUTTER_ATTRIBUTE);
    setStyles(container, {
      paddingLeft: '',
      position: '',
    });
  }

  function injectAccountUsageLinks() {
    if (!isAdminAccountsPage() || !isAccountUsageShortcutEnabled()) {
      return;
    }

    for (const row of document.querySelectorAll('tr')) {
      const accountId = row.getAttribute('data-row-id');
      if (!accountId || !/^\d+$/.test(accountId)) {
        continue;
      }

      const nameCell = findAccountNameCell(row);
      if (!nameCell) {
        continue;
      }

      const container = nameCell.querySelector('div') || nameCell;
      const existingLink = row.querySelector(`[${ACCOUNT_USAGE_LINK_ATTRIBUTE}="true"]`);
      if (existingLink) {
        const existingContainer = existingLink.parentElement;
        if (
          existingLink.getAttribute(ACCOUNT_USAGE_LINK_ID_ATTRIBUTE) === accountId
          && existingContainer === container
        ) {
          applyAccountUsageGutter(container);
          continue;
        }
        existingLink.remove();
        if (existingContainer && existingContainer !== container) {
          resetAccountUsageGutter(existingContainer);
        }
      }

      applyAccountUsageGutter(container);
      container.appendChild(createAccountUsageLink(accountId));
    }
  }

  function scheduleAccountUsageLinkInjection() {
    if (accountUsageLinkInjectionPending) {
      return;
    }

    accountUsageLinkInjectionPending = true;
    accountUsageLinkInjectionTimer = window.setTimeout(() => {
      accountUsageLinkInjectionPending = false;
      accountUsageLinkInjectionTimer = null;
      injectAccountUsageLinks();
    }, ACCOUNT_USAGE_LINK_INJECTION_DELAY_MS);
  }

  function isAccountUsageLinkRelevantRecord(record) {
    if (record.type === 'attributes') {
      return record.attributeName === 'data-row-id' && record.target?.tagName === 'TR';
    }

    if (record.target?.closest?.('[data-sub2api-account-hit-rate-row="true"], [data-sub2api-account-hit-rate-grid="true"]')) {
      return false;
    }

    if (record.target?.closest?.('tr')) {
      return true;
    }

    return [...(record.addedNodes || [])].some((node) => (
      typeof node?.tagName === 'string'
      && (node.tagName === 'TR' || Boolean(node.querySelector?.('tr')))
    ));
  }

  function installAccountUsageLinks() {
    if (!isAdminAccountsPage() || !isAccountUsageShortcutEnabled()) {
      cleanupAccountUsageLinks();
      return;
    }

    scheduleAccountUsageLinkInjection();
    if (accountUsageLinkObserver) {
      return;
    }

    accountUsageLinkObserver = new MutationObserver((records) => {
      if (records.length === 0 || records.some(isAccountUsageLinkRelevantRecord)) {
        scheduleAccountUsageLinkInjection();
      }
    });
    accountUsageLinkObserver.observe(document.documentElement, {
      attributeFilter: ['data-row-id'],
      attributes: true,
      childList: true,
      subtree: true,
    });
  }

  function cleanupAccountUsageLinks() {
    if (accountUsageLinkObserver) {
      accountUsageLinkObserver.disconnect();
      accountUsageLinkObserver = null;
    }

    if (accountUsageLinkInjectionTimer) {
      window.clearTimeout(accountUsageLinkInjectionTimer);
      accountUsageLinkInjectionTimer = null;
    }
    accountUsageLinkInjectionPending = false;

    for (const link of document.querySelectorAll(`[${ACCOUNT_USAGE_LINK_ATTRIBUTE}="true"]`)) {
      link.remove();
    }

    for (const container of document.querySelectorAll(`[${ACCOUNT_USAGE_GUTTER_ATTRIBUTE}="true"]`)) {
      resetAccountUsageGutter(container);
    }
  }

  function getAccountUsageDeepLinkId() {
    let requestUrl;
    try {
      requestUrl = new URL(location.href, location.origin);
    } catch {
      return null;
    }

    const rawAccountId = requestUrl.searchParams.get('account_id');
    if (!rawAccountId || !/^\d+$/.test(rawAccountId)) {
      return null;
    }

    const accountId = Number(rawAccountId);
    return Number.isSafeInteger(accountId) && accountId > 0 ? accountId : null;
  }

  function findAccountUsageFilterContainer() {
    let placeholderMatch = null;
    for (const container of document.querySelectorAll('.usage-filter-dropdown')) {
      const labelText = container.querySelector('label')?.textContent.trim() || '';
      if (/账户|账号|account/i.test(labelText)) {
        return container;
      }

      const placeholder = container.querySelector('input')?.getAttribute('placeholder') || '';
      if (!placeholderMatch && /账户|账号|account/i.test(placeholder)) {
        placeholderMatch = container;
      }
    }
    return placeholderMatch;
  }

  function findAccountUsageClearButton(container) {
    const labelledButton = container?.querySelector('button[aria-label="Clear account filter"]')
      || document.querySelector('button[aria-label="Clear account filter"]');
    if (labelledButton) {
      return labelledButton;
    }

    if (!container) {
      return null;
    }

    for (const button of container.querySelectorAll('button')) {
      if (String(button.textContent || '').trim() === '✕') {
        return button;
      }
    }
    return null;
  }

  function normalizeAccountUsageText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function findAccountUsageDropdownButton(container, accountId, accountName) {
    const candidates = [];
    const seenCandidates = new Set();
    const addCandidates = (root) => {
      if (!root) {
        return;
      }
      for (const selector of ['button', '[role="option"]']) {
        for (const element of root.querySelectorAll(selector)) {
          if (!seenCandidates.has(element)) {
            seenCandidates.add(element);
            candidates.push(element);
          }
        }
      }
    };

    addCandidates(container);
    addCandidates(document);

    const normalizedName = normalizeAccountUsageText(accountName);
    let nameMatch = null;
    let nameMatchCount = 0;

    for (const element of candidates) {
      if (element.getAttribute('aria-label') === 'Clear account filter') {
        continue;
      }

      const text = normalizeAccountUsageText(element.textContent);
      const idMatches = [...text.matchAll(/#(\d+)/g)];
      if (
        idMatches.length
        && Number(idMatches[idMatches.length - 1][1]) === accountId
      ) {
        return element;
      }

      if (normalizedName && idMatches.length && text.startsWith(normalizedName)) {
        nameMatch = element;
        nameMatchCount += 1;
      }
    }

    return nameMatchCount === 1 ? nameMatch : null;
  }

  function dispatchAccountUsageInputEvent(input, type, bubbles = false) {
    try {
      input.dispatchEvent(new Event(type, { bubbles }));
    } catch {
      // Ignore synthetic event failures on unusual host pages.
    }
  }

  function logAccountUsageDeepLinkFailure(accountId, accountName) {
    try {
      const candidates = [];
      for (const element of document.querySelectorAll('button, [role="option"]')) {
        const text = normalizeAccountUsageText(element.textContent);
        if (!text) {
          continue;
        }
        if (!text.includes(String(accountId)) && !text.includes(accountName)) {
          continue;
        }
        candidates.push({
          ariaLabel: element.getAttribute('aria-label') || '',
          tagName: element.tagName,
          text,
        });
      }

      console.warn('[Sub2API Helper] account usage shortcut failed', {
        accountId,
        accountName,
        candidates,
        version: SCRIPT_VERSION,
      });
    } catch {
      // Ignore diagnostics failures on unusual host pages.
    }
  }

  async function fetchAdminAccountName(accountId) {
    const fetchFunction = typeof window.fetch === 'function'
      ? window.fetch.bind(window)
      : (typeof fetch === 'function' ? fetch : null);
    if (!fetchFunction) {
      return { status: 'error' };
    }

    const requestUrl = new URL(`/api/v1/admin/accounts/${accountId}`, location.origin).toString();
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const abortTimer = controller
      ? window.setTimeout(() => controller.abort(), ACCOUNT_USAGE_DEEP_LINK_TIMEOUT_MS)
      : null;

    let authToken = '';
    try {
      authToken = localStorage.getItem('auth_token') || '';
    } catch {
      authToken = '';
    }

    const headers = {
      Accept: 'application/json',
      'X-Admin-UI-Request': '1',
    };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    let response;
    try {
      response = await fetchFunction(requestUrl, {
        credentials: 'same-origin',
        headers,
        signal: controller?.signal,
      });
    } catch {
      return { status: 'error' };
    } finally {
      if (abortTimer) {
        window.clearTimeout(abortTimer);
      }
    }

    if (!response) {
      return { status: 'error' };
    }
    if (response.status === 404) {
      return { status: 'missing' };
    }
    if (response.ok === false) {
      return { status: 'error' };
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      return { status: 'error' };
    }

    const account = payload?.data?.account || payload?.data || payload?.account || payload;
    const accountName = account && typeof account.name === 'string' ? account.name.trim() : '';
    if (!accountName) {
      return { status: 'missing' };
    }
    return { status: 'ok', name: accountName };
  }

  function removeAccountUsageNotice() {
    if (accountUsageNoticeWatchTimer) {
      window.clearInterval(accountUsageNoticeWatchTimer);
      accountUsageNoticeWatchTimer = null;
    }

    for (const notice of document.querySelectorAll(`[${ACCOUNT_USAGE_NOTICE_ATTRIBUTE}="true"]`)) {
      notice.remove();
    }
  }

  function createAccountUsageNoticeButton(label, onClick) {
    const button = document.createElement('button');
    button.setAttribute('type', 'button');
    button.className = 'rounded-md border border-current px-2 py-0.5 text-xs font-medium';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  function showAccountUsageNotice({ accountId, accountName = '', missing = false }) {
    if (!isAdminUsagePage() || !isAccountUsageShortcutEnabled() || !shouldEnableSub2apiHelper()) {
      return;
    }

    removeAccountUsageNotice();

    const filterContainer = findAccountUsageFilterContainer();
    const pageContainer = filterContainer?.closest('.space-y-6')
      || document.querySelector('main')
      || document.body;
    if (!pageContainer) {
      return;
    }

    const notice = document.createElement('div');
    notice.setAttribute(ACCOUNT_USAGE_NOTICE_ATTRIBUTE, 'true');
    notice.className = 'flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200';
    setStyles(notice, { marginBottom: '4px' });

    const message = document.createElement('span');
    message.className = 'min-w-0 break-all';
    const accountLabel = accountName || `#${accountId}`;
    message.textContent = missing
      ? `无法读取账号 ${accountLabel}，可能已被删除。`
      : `未能自动选中账号「${accountLabel}」(#${accountId})，请在账户筛选中手动选择。`;
    notice.appendChild(message);

    const actions = document.createElement('span');
    actions.className = 'ml-auto inline-flex items-center gap-2';

    if (!missing) {
      actions.appendChild(createAccountUsageNoticeButton('重试', () => {
        removeAccountUsageNotice();
        accountUsageDeepLinkAppliedKey = null;
        applyAccountUsageDeepLink();
      }));
    }

    actions.appendChild(createAccountUsageNoticeButton('关闭', () => {
      removeAccountUsageNotice();
    }));
    notice.appendChild(actions);

    const firstChild = pageContainer.children && pageContainer.children[0];
    if (typeof pageContainer.insertBefore === 'function') {
      pageContainer.insertBefore(notice, firstChild || null);
    } else {
      pageContainer.appendChild(notice);
    }

    accountUsageNoticeWatchTimer = window.setInterval(() => {
      if (!notice.isConnected) {
        removeAccountUsageNotice();
        return;
      }

      const currentContainer = findAccountUsageFilterContainer();
      if (currentContainer && findAccountUsageClearButton(currentContainer)) {
        removeAccountUsageNotice();
      }
    }, ACCOUNT_USAGE_NOTICE_WATCH_INTERVAL_MS);
  }

  async function runAccountUsageDeepLink(accountId, token) {
    const initialContainer = findAccountUsageFilterContainer();
    if (initialContainer && findAccountUsageClearButton(initialContainer)) {
      return;
    }

    const filterContainer = await waitFor(
      findAccountUsageFilterContainer,
      ACCOUNT_USAGE_DEEP_LINK_TIMEOUT_MS,
    );
    if (token !== accountUsageDeepLinkToken) {
      return;
    }
    if (!filterContainer) {
      showAccountUsageNotice({ accountId });
      return;
    }

    if (findAccountUsageClearButton(filterContainer)) {
      return;
    }

    const accountResult = await fetchAdminAccountName(accountId);
    if (token !== accountUsageDeepLinkToken) {
      return;
    }

    if (accountResult.status === 'missing') {
      showAccountUsageNotice({ accountId, missing: true });
      return;
    }
    if (accountResult.status !== 'ok') {
      showAccountUsageNotice({ accountId });
      return;
    }

    const accountName = accountResult.name;
    const currentFilterContainer = findAccountUsageFilterContainer() || filterContainer;
    if (findAccountUsageClearButton(currentFilterContainer)) {
      return;
    }

    const input = currentFilterContainer.querySelector('input');
    if (!input) {
      showAccountUsageNotice({ accountId, accountName });
      return;
    }

    input.value = accountName;
    dispatchAccountUsageInputEvent(input, 'input', true);
    if (typeof input.focus === 'function') {
      try {
        input.focus();
      } catch {
        // Ignore focus failures on background tabs.
      }
    }
    dispatchAccountUsageInputEvent(input, 'focus');
    const expectedInputValue = input.value;

    let selectedClearButton = null;
    for (let attempt = 0; attempt < 3 && !selectedClearButton; attempt += 1) {
      const dropdownButton = await waitFor(
        () => findAccountUsageDropdownButton(
          findAccountUsageFilterContainer(),
          accountId,
          accountName,
        ),
        attempt === 0 ? ACCOUNT_USAGE_DEEP_LINK_TIMEOUT_MS : 1000,
      );
      if (token !== accountUsageDeepLinkToken) {
        return;
      }
      if (!dropdownButton) {
        break;
      }

      const liveContainer = findAccountUsageFilterContainer();
      if (liveContainer && findAccountUsageClearButton(liveContainer)) {
        return;
      }

      const liveInput = liveContainer?.querySelector('input');
      if (liveInput && liveInput.value !== expectedInputValue) {
        return;
      }

      const clickContainer = liveContainer || findAccountUsageFilterContainer();
      const originalParent = dropdownButton.parentElement;
      const originalNextSibling = dropdownButton.nextSibling || null;
      const shouldRelocate = Boolean(
        clickContainer
        && originalParent
        && dropdownButton.tagName === 'BUTTON'
        && !clickContainer.contains(dropdownButton)
      );
      if (shouldRelocate) {
        clickContainer.appendChild(dropdownButton);
      }

      dropdownButton.click();

      if (shouldRelocate && originalParent) {
        if (originalParent.isConnected && dropdownButton.isConnected) {
          const reference = originalNextSibling
            && originalNextSibling.parentNode === originalParent
            ? originalNextSibling
            : null;
          originalParent.insertBefore(dropdownButton, reference);
        } else if (dropdownButton.parentElement === clickContainer) {
          dropdownButton.remove();
        }
      }

      selectedClearButton = await waitFor(
        () => findAccountUsageClearButton(findAccountUsageFilterContainer()),
        ACCOUNT_USAGE_SELECTION_TIMEOUT_MS,
      );
      if (token !== accountUsageDeepLinkToken) {
        return;
      }
    }

    if (!selectedClearButton) {
      logAccountUsageDeepLinkFailure(accountId, accountName);
      showAccountUsageNotice({ accountId, accountName });
      return;
    }

    removeAccountUsageNotice();
  }

  function applyAccountUsageDeepLink() {
    if (!isAdminUsagePage() || !isAccountUsageShortcutEnabled()) {
      cleanupAccountUsageDeepLink();
      return;
    }

    const accountId = getAccountUsageDeepLinkId();
    if (!accountId) {
      cleanupAccountUsageDeepLink();
      return;
    }

    const deepLinkKey = `${location.pathname}?account_id=${accountId}`;
    if (accountUsageDeepLinkActiveKey !== deepLinkKey) {
      accountUsageDeepLinkToken += 1;
      accountUsageDeepLinkRunning = false;
      accountUsageDeepLinkActiveKey = deepLinkKey;
      accountUsageDeepLinkAppliedKey = null;
      removeAccountUsageNotice();
    }

    if (accountUsageDeepLinkRunning || accountUsageDeepLinkAppliedKey === deepLinkKey) {
      return;
    }

    accountUsageDeepLinkAppliedKey = deepLinkKey;
    accountUsageDeepLinkRunning = true;
    const token = ++accountUsageDeepLinkToken;
    runAccountUsageDeepLink(accountId, token)
      .catch(() => {
        if (token === accountUsageDeepLinkToken) {
          showAccountUsageNotice({ accountId });
        }
      })
      .finally(() => {
        if (token === accountUsageDeepLinkToken) {
          accountUsageDeepLinkRunning = false;
        }
      });
  }

  function cleanupAccountUsageDeepLink() {
    accountUsageDeepLinkToken += 1;
    accountUsageDeepLinkRunning = false;
    accountUsageDeepLinkActiveKey = null;
    accountUsageDeepLinkAppliedKey = null;
    removeAccountUsageNotice();
  }
