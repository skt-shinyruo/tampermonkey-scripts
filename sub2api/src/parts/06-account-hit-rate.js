  const ACCOUNT_HIT_RATE_BADGE_ATTRIBUTE = 'data-sub2api-account-hit-rate';
  const ACCOUNT_HIT_RATE_ROW_ATTRIBUTE = 'data-sub2api-account-hit-rate-row';
  const ACCOUNT_HIT_RATE_GRID_ATTRIBUTE = 'data-sub2api-account-hit-rate-grid';
  const ACCOUNT_HIT_RATE_LABEL_ATTRIBUTE = 'data-sub2api-account-hit-rate-original-label';
  const ACCOUNT_HIT_RATE_TRACK_ATTRIBUTE = 'data-sub2api-account-hit-rate-track';
  const ACCOUNT_HIT_RATE_NOTICE_ATTRIBUTE = 'data-sub2api-account-hit-rate-notice';
  const ACCOUNT_HIT_RATE_MAX_TRACKED = 10;
  const ACCOUNT_HIT_RATE_MIN_INTERVAL_MINUTES = 30;
  const ACCOUNT_HIT_RATE_MAX_INTERVAL_MINUTES = 1440;
  const ACCOUNT_HIT_RATE_DEFAULT_INTERVAL_MINUTES = 30;
  const ACCOUNT_HIT_RATE_REQUEST_TIMEOUT_MS = 8000;
  const ACCOUNT_HIT_RATE_JITTER_MIN_MS = 1000;
  const ACCOUNT_HIT_RATE_JITTER_MAX_MS = 2000;
  const ACCOUNT_HIT_RATE_HOVER_DELAY_MS = 150;
  const ACCOUNT_HIT_RATE_INJECTION_DELAY_MS = 50;
  const ACCOUNT_HIT_RATE_FAILURE_THRESHOLD = 3;
  const ACCOUNT_HIT_RATE_QUERY_CACHE_LIMIT = 200;
  const ACCOUNT_HIT_RATE_DAY_LABELS = { yesterday: '昨', today: '今' };

  const accountHitRateTodayEntries = new Map();
  const accountHitRateInFlight = new Map();

  let accountHitRateInjectionTimer = null;
  let accountHitRateInjectionPending = false;
  let accountHitRateNotice = null;
  let accountHitRateCycleTimer = null;
  let accountHitRateCycleToken = 0;
  let accountHitRateCycleInFlight = false;
  let accountHitRateConsecutiveFailures = 0;
  let accountHitRatePaused = false;
  let accountHitRateLastError = null;
  let accountHitRateNextRunAt = null;
  let accountHitRateVisibilityInstalled = false;
  let accountHitRateObserver = null;

  function isAccountHitRateEnabled() {
    return isFeatureEnabled(FEATURE_IDS.ADMIN_ACCOUNTS_HIT_RATE);
  }

  function resolveAccountHitRateDates() {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const today = getTodayIsoDate(timeZone);
    if (!today) {
      return null;
    }
    return { timeZone, today, yesterday: shiftIsoDate(today, -1) };
  }

  function normalizeAccountHitRateInterval(value) {
    const minutes = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(minutes)) {
      return ACCOUNT_HIT_RATE_DEFAULT_INTERVAL_MINUTES;
    }
    return Math.min(
      ACCOUNT_HIT_RATE_MAX_INTERVAL_MINUTES,
      Math.max(ACCOUNT_HIT_RATE_MIN_INTERVAL_MINUTES, minutes),
    );
  }

  function getAccountHitRateIntervalMinutes() {
    return normalizeAccountHitRateInterval(
      getStorageValue(
        STORAGE_NAMES.ADMIN_ACCOUNTS_HIT_RATE_INTERVAL,
        ACCOUNT_HIT_RATE_DEFAULT_INTERVAL_MINUTES,
      ),
    );
  }

  function setAccountHitRateIntervalMinutes(value) {
    setStorageValue(
      STORAGE_NAMES.ADMIN_ACCOUNTS_HIT_RATE_INTERVAL,
      normalizeAccountHitRateInterval(value),
    );
  }

  function getTrackedAccountIds() {
    const raw = getStorageValue(STORAGE_NAMES.ADMIN_ACCOUNTS_HIT_RATE_TRACKED, []);
    if (!Array.isArray(raw)) {
      return [];
    }

    const ids = [];
    for (const value of raw) {
      const accountId = Number(value);
      if (Number.isSafeInteger(accountId) && accountId > 0 && !ids.includes(accountId)) {
        ids.push(accountId);
      }
    }
    return ids;
  }

  function setTrackedAccountIds(ids) {
    setStorageValue(
      STORAGE_NAMES.ADMIN_ACCOUNTS_HIT_RATE_TRACKED,
      (ids || []).filter((id) => Number.isSafeInteger(Number(id)) && Number(id) > 0).map(Number),
    );
  }

  function isAccountHitRateTracked(accountId) {
    return getTrackedAccountIds().includes(Number(accountId));
  }

  function setAccountHitRateTracked(accountId, tracked) {
    const normalizedId = Number(accountId);
    if (!Number.isSafeInteger(normalizedId) || normalizedId <= 0) {
      return 'invalid';
    }

    const ids = getTrackedAccountIds();
    const exists = ids.includes(normalizedId);
    if (tracked && !exists) {
      if (ids.length >= ACCOUNT_HIT_RATE_MAX_TRACKED) {
        return 'limit';
      }
      setTrackedAccountIds([...ids, normalizedId]);
      return 'added';
    }

    if (!tracked && exists) {
      setTrackedAccountIds(ids.filter((id) => id !== normalizedId));
      accountHitRateTodayEntries.delete(normalizedId);
      accountHitRateInFlight.delete(normalizedId);
      deleteAccountHitRateYesterday(normalizedId);
      return 'removed';
    }

    return 'unchanged';
  }

  function getAccountHitRateYesterdayStore() {
    const raw = getStorageValue(STORAGE_NAMES.ADMIN_ACCOUNTS_HIT_RATE_YESTERDAY, {});
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  }

  function getAccountHitRateYesterday(accountId, yesterdayDate) {
    const entry = getAccountHitRateYesterdayStore()[String(accountId)];
    if (!entry || entry.date !== yesterdayDate) {
      return null;
    }
    return entry;
  }

  function setAccountHitRateYesterday(accountId, yesterdayDate, hitRate) {
    const store = getAccountHitRateYesterdayStore();
    for (const [key, entry] of Object.entries(store)) {
      if (!entry || entry.date !== yesterdayDate) {
        delete store[key];
      }
    }
    store[String(accountId)] = { date: yesterdayDate, fetchedAt: Date.now(), hitRate };
    setStorageValue(STORAGE_NAMES.ADMIN_ACCOUNTS_HIT_RATE_YESTERDAY, store);
  }

  function deleteAccountHitRateYesterday(accountId) {
    const store = getAccountHitRateYesterdayStore();
    if (!(String(accountId) in store)) {
      return;
    }
    delete store[String(accountId)];
    setStorageValue(STORAGE_NAMES.ADMIN_ACCOUNTS_HIT_RATE_YESTERDAY, store);
  }

  function getAccountHitRateTodayEntry(accountId, todayDate) {
    const entry = accountHitRateTodayEntries.get(Number(accountId));
    if (!entry || entry.date !== todayDate) {
      return null;
    }
    return entry;
  }

  function setAccountHitRateTodayEntry(accountId, todayDate, payload) {
    accountHitRateTodayEntries.set(Number(accountId), { date: todayDate, ...payload });
    while (accountHitRateTodayEntries.size > ACCOUNT_HIT_RATE_QUERY_CACHE_LIMIT) {
      accountHitRateTodayEntries.delete(accountHitRateTodayEntries.keys().next().value);
    }
  }

  function pruneAccountHitRateTodayEntries(todayDate) {
    for (const [accountId, entry] of [...accountHitRateTodayEntries.entries()]) {
      if (!entry || entry.date !== todayDate) {
        accountHitRateTodayEntries.delete(accountId);
      }
    }
  }

  function getAccountHitRateAuthToken() {
    try {
      return localStorage.getItem('auth_token') || '';
    } catch {
      return '';
    }
  }

  function parseAccountHitRateRetryAfter(response) {
    const raw = typeof response?.headers?.get === 'function'
      ? response.headers.get('Retry-After')
      : null;
    if (!raw) {
      return 0;
    }

    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 60 * 60 * 1000);
    }

    const retryAt = Date.parse(raw);
    if (Number.isFinite(retryAt)) {
      return Math.min(Math.max(retryAt - Date.now(), 0), 60 * 60 * 1000);
    }
    return 0;
  }

  function parseAccountHitRateTrendDays(payload) {
    const data = payload?.data || payload;
    const trend = Array.isArray(data?.trend)
      ? data.trend
      : (Array.isArray(data) ? data : null);
    if (!trend) {
      return null;
    }

    const days = {};
    for (const point of trend) {
      const date = String(point?.date || '').slice(0, 10);
      if (!date) {
        continue;
      }
      days[date] = calculateUsageCacheHitRatePercent({
        cache_creation_tokens: point.cache_creation_tokens,
        cache_read_tokens: point.cache_read_tokens,
        input_tokens: point.input_tokens,
      });
    }
    return days;
  }

  function fetchAccountHitRateTrend(accountId, request) {
    const fetchFunction = typeof window.fetch === 'function'
      ? window.fetch.bind(window)
      : (typeof fetch === 'function' ? fetch : null);
    if (!fetchFunction) {
      return Promise.resolve({ status: 'error' });
    }

    const requestUrl = new URL('/api/v1/admin/dashboard/trend', location.origin);
    requestUrl.searchParams.set('account_id', String(accountId));
    requestUrl.searchParams.set('start_date', request.start);
    requestUrl.searchParams.set('end_date', request.end);
    requestUrl.searchParams.set('granularity', 'day');
    requestUrl.searchParams.set('timezone', request.timeZone);

    const headers = {
      Accept: 'application/json',
      'X-Admin-UI-Request': '1',
    };
    const authToken = getAccountHitRateAuthToken();
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const abortTimer = controller
      ? window.setTimeout(() => controller.abort(), ACCOUNT_HIT_RATE_REQUEST_TIMEOUT_MS)
      : null;

    return Promise.resolve(
      fetchFunction(requestUrl.toString(), {
        credentials: 'same-origin',
        headers,
        signal: controller?.signal,
      }),
    )
      .then((response) => {
        if (!response) {
          return { status: 'error' };
        }
        if (response.status === 401 || response.status === 403) {
          return { status: 'auth' };
        }
        if (!response.ok) {
          return { retryAfterMs: parseAccountHitRateRetryAfter(response), status: 'error' };
        }

        return Promise.resolve(response.json())
          .then((payload) => {
            const days = parseAccountHitRateTrendDays(payload);
            if (!days) {
              return { status: 'error' };
            }
            return { days, status: 'ok' };
          })
          .catch(() => ({ status: 'error' }));
      })
      .catch(() => ({ status: 'error' }))
      .finally(() => {
        if (abortTimer) {
          window.clearTimeout(abortTimer);
        }
      });
  }

  function isAccountHitRateRefreshNeeded(accountId, dates, forceToday) {
    if (forceToday || !getAccountHitRateTodayEntry(accountId, dates.today)) {
      return true;
    }
    return !getAccountHitRateYesterday(accountId, dates.yesterday);
  }

  function requestAccountHitRate(accountId, { forceToday = false } = {}) {
    const normalizedId = Number(accountId);
    if (!Number.isSafeInteger(normalizedId) || normalizedId <= 0) {
      return Promise.resolve(null);
    }

    const dates = resolveAccountHitRateDates();
    if (!dates) {
      return Promise.resolve(null);
    }

    pruneAccountHitRateTodayEntries(dates.today);
    if (!isAccountHitRateRefreshNeeded(normalizedId, dates, forceToday)) {
      return Promise.resolve(getAccountHitRateTodayEntry(normalizedId, dates.today));
    }

    const pending = accountHitRateInFlight.get(normalizedId);
    if (pending) {
      return pending;
    }

    const needYesterday = !getAccountHitRateYesterday(normalizedId, dates.yesterday);
    const promise = fetchAccountHitRateTrend(normalizedId, {
      end: dates.today,
      start: needYesterday ? dates.yesterday : dates.today,
      timeZone: dates.timeZone,
    })
      .then((result) => {
        if (result.status === 'ok') {
          const todayRate = Object.prototype.hasOwnProperty.call(result.days, dates.today)
            ? result.days[dates.today]
            : null;
          setAccountHitRateTodayEntry(normalizedId, dates.today, {
            fetchedAt: Date.now(),
            hitRate: todayRate,
            status: 'ok',
          });
          if (needYesterday) {
            const yesterdayRate = Object.prototype.hasOwnProperty.call(result.days, dates.yesterday)
              ? result.days[dates.yesterday]
              : null;
            setAccountHitRateYesterday(normalizedId, dates.yesterday, yesterdayRate);
          }
          accountHitRateLastError = null;
          accountHitRateConsecutiveFailures = 0;
        } else {
          accountHitRateLastError = result.status === 'auth' ? '无权限或登录态失效' : '查询失败';
        }
        return { ...result, accountId: normalizedId };
      })
      .finally(() => {
        accountHitRateInFlight.delete(normalizedId);
        renderAccountHitRateRow(normalizedId);
      });

    accountHitRateInFlight.set(normalizedId, promise);
    renderAccountHitRateRow(normalizedId);
    return promise;
  }

  function formatAccountHitRateLabel(hitRate) {
    if (!Number.isFinite(hitRate)) {
      return '–';
    }
    return `${Math.round(hitRate)}%`;
  }

  function formatAccountHitRateAge(fetchedAt) {
    const minutes = Math.floor(Math.max(Date.now() - fetchedAt, 0) / 60000);
    if (minutes < 1) {
      return '刚刚';
    }
    if (minutes < 60) {
      return `${minutes} 分钟前`;
    }
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours} 小时前` : `${Math.floor(hours / 24)} 天前`;
  }

  function getAccountHitRateDayEntry(accountId, day) {
    const dates = resolveAccountHitRateDates();
    if (!dates) {
      return null;
    }
    return day === 'today'
      ? getAccountHitRateTodayEntry(accountId, dates.today)
      : getAccountHitRateYesterday(accountId, dates.yesterday);
  }

  function buildAccountHitRateDayTitle(accountId, day) {
    const dates = resolveAccountHitRateDates();
    if (!dates) {
      return '缓存命中率：无法确定当前日期';
    }

    const dayLabel = day === 'today' ? '今天' : '昨天';
    const dateText = day === 'today' ? dates.today : dates.yesterday;
    const entry = getAccountHitRateDayEntry(accountId, day);

    if (accountHitRateInFlight.has(Number(accountId)) && !entry) {
      return `正在查询${dayLabel}（${dateText}）的缓存命中率…`;
    }
    if (!entry) {
      return `缓存命中率·${dayLabel}（${dateText}）：未查询，悬停或点击刷新`;
    }
    if (entry.status === 'error' || entry.status === 'auth') {
      return `缓存命中率·${dayLabel}（${dateText}）：查询失败`;
    }
    if (entry.hitRate === null) {
      return `缓存命中率·${dayLabel}（${dateText}）：该日没有 Prompt Token`;
    }

    const fetchedAt = new Date(entry.fetchedAt);
    const clock = `${String(fetchedAt.getHours()).padStart(2, '0')}:${String(fetchedAt.getMinutes()).padStart(2, '0')}`;
    return `缓存命中率·${dayLabel}（${dateText}）：${formatAccountHitRateLabel(entry.hitRate)}，数据时间 ${clock}（${formatAccountHitRateAge(entry.fetchedAt)}）`;
  }

  function getAccountHitRateTextClass(hitRate) {
    if (!Number.isFinite(hitRate)) {
      return 'text-gray-400 dark:text-gray-500';
    }
    return USAGE_CACHE_HIT_RATE_TEXT_CLASSES[getUsageCacheHitRateSeverity(hitRate)];
  }

  function getAccountHitRateDayState(accountId, day) {
    const pending = accountHitRateInFlight.has(Number(accountId));
    const entry = getAccountHitRateDayEntry(accountId, day);
    const prefix = ACCOUNT_HIT_RATE_DAY_LABELS[day];

    if (pending && !entry) {
      return { label: `${prefix} …`, textClass: 'text-gray-400 dark:text-gray-500' };
    }
    if (entry && entry.status !== 'error' && entry.status !== 'auth') {
      return {
        label: `${prefix} ${formatAccountHitRateLabel(entry.hitRate)}`,
        textClass: getAccountHitRateTextClass(entry.hitRate),
      };
    }
    return { label: `${prefix} –`, textClass: 'text-gray-400 dark:text-gray-500' };
  }

  function createAccountHitRateBadge(accountId, day) {
    const badge = document.createElement('button');
    badge.setAttribute('type', 'button');
    badge.setAttribute(ACCOUNT_HIT_RATE_BADGE_ATTRIBUTE, day);
    badge.setAttribute('data-sub2api-account-hit-rate-id', String(accountId));
    setStyles(badge, {
      background: 'transparent',
      border: '0',
      cursor: 'pointer',
      font: 'inherit',
      padding: '0',
    });

    let hoverTimer = null;
    badge.addEventListener('mouseenter', () => {
      const dates = resolveAccountHitRateDates();
      if (!dates) {
        return;
      }
      if (!isAccountHitRateRefreshNeeded(accountId, dates, false)) {
        return;
      }
      hoverTimer = window.setTimeout(() => {
        hoverTimer = null;
        if (!badge.isConnected) {
          return;
        }
        requestAccountHitRate(accountId);
      }, ACCOUNT_HIT_RATE_HOVER_DELAY_MS);
    });
    badge.addEventListener('mouseleave', () => {
      if (hoverTimer) {
        window.clearTimeout(hoverTimer);
        hoverTimer = null;
      }
    });
    badge.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      requestAccountHitRate(accountId, { forceToday: day === 'today' });
    });

    return badge;
  }

  function createAccountHitRateTrackToggle(accountId) {
    const toggle = document.createElement('button');
    toggle.setAttribute('type', 'button');
    toggle.setAttribute(ACCOUNT_HIT_RATE_TRACK_ATTRIBUTE, 'true');
    toggle.setAttribute('data-sub2api-account-hit-rate-track-id', String(accountId));
    setStyles(toggle, {
      background: 'transparent',
      border: '0',
      cursor: 'pointer',
      height: '1em',
      lineHeight: '1',
      padding: '0',
      width: '1em',
    });

    if (typeof document.createElementNS === 'function') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.8');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M12 4l2.3 4.9 5.4.7-4 3.7 1.1 5.3-4.8-2.7-4.8 2.7 1.1-5.3-4-3.7 5.4-.7z');
      svg.appendChild(path);
      toggle.appendChild(svg);
    } else {
      toggle.textContent = '★';
    }

    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextTracked = !isAccountHitRateTracked(accountId);
      const outcome = setAccountHitRateTracked(accountId, nextTracked);

      if (outcome === 'limit') {
        showAccountHitRateNotice(
          `最多只能自动获取 ${ACCOUNT_HIT_RATE_MAX_TRACKED} 个账号，请先取消其中一个。`,
          { resumable: false },
        );
      } else {
        if (accountHitRatePaused) {
          accountHitRatePaused = false;
          accountHitRateConsecutiveFailures = 0;
        }
        hideAccountHitRateNotice();
        if (nextTracked) {
          requestAccountHitRate(accountId);
        }
        restartAccountHitRateCycle();
      }

      refreshSettingsPanel();
      scheduleAccountHitRateInjection();
    });

    return toggle;
  }

  function getAccountHitRateHeaderRow() {
    for (const row of document.querySelectorAll('tr')) {
      if (row.parentElement && row.parentElement.tagName === 'THEAD') {
        return row;
      }
    }
    return null;
  }

  function getAccountHitRateTableState() {
    const headerRow = getAccountHitRateHeaderRow();
    if (!headerRow) {
      return { index: null, ready: false };
    }

    const headers = [...headerRow.children].filter((child) => child.tagName === 'TH');
    if (!headers.length) {
      return { index: null, ready: false };
    }

    const index = headers.findIndex((header) =>
      /今日|today/i.test(String(header.textContent || '').replace(/\s+/g, ' ').trim()),
    );
    return { index: index >= 0 ? index : null, ready: true };
  }

  function getAccountHitRateCell(row, columnIndex) {
    if (columnIndex === null || columnIndex === undefined) {
      return null;
    }
    const cells = [...row.children].filter((child) => child.tagName === 'TD');
    return cells[columnIndex] || null;
  }

  function getAccountHitRateStatsContainer(cell) {
    if (!cell) {
      return null;
    }

    for (const container of cell.querySelectorAll('div')) {
      const className = String(container.className || '');
      if (className.includes('space-y-0.5') && className.includes('text-xs')) {
        return container;
      }
    }
    return null;
  }

  const ACCOUNT_HIT_RATE_SHORT_LABELS = [
    { pattern: /^(账号计费|account)/i, short: '账号' },
    { pattern: /^(用户扣费|user)/i, short: '用户' },
  ];

  function applyAccountHitRateShortLabels(container) {
    for (const line of [...container.children]) {
      if (line.getAttribute(ACCOUNT_HIT_RATE_ROW_ATTRIBUTE) === 'true') {
        continue;
      }

      const label = [...line.children].find((child) => child.tagName === 'SPAN');
      if (!label) {
        continue;
      }

      const original = String(label.textContent || '').trim();
      const matched = ACCOUNT_HIT_RATE_SHORT_LABELS.find((entry) => entry.pattern.test(original));
      if (!matched) {
        continue;
      }

      if (label.getAttribute(ACCOUNT_HIT_RATE_LABEL_ATTRIBUTE) === null) {
        label.setAttribute(ACCOUNT_HIT_RATE_LABEL_ATTRIBUTE, original);
      }

      const suffix = original.endsWith(':') || original.endsWith('：') ? original.slice(-1) : '';
      const nextText = `${matched.short}${suffix}`;
      if (label.textContent !== nextText) {
        label.textContent = nextText;
      }
    }
  }

  function resetAccountHitRateShortLabels(container) {
    for (const line of [...container.children]) {
      for (const label of [...line.children]) {
        const original = label.getAttribute(ACCOUNT_HIT_RATE_LABEL_ATTRIBUTE);
        if (original === null) {
          continue;
        }
        if (label.textContent !== original) {
          label.textContent = original;
        }
        label.removeAttribute(ACCOUNT_HIT_RATE_LABEL_ATTRIBUTE);
      }
    }
  }

  function applyAccountHitRateGrid(container) {
    if (!container) {
      return;
    }

    if (container.getAttribute(ACCOUNT_HIT_RATE_GRID_ATTRIBUTE) !== 'true') {
      container.setAttribute(ACCOUNT_HIT_RATE_GRID_ATTRIBUTE, 'true');
      setStyles(container, {
        columnGap: '0.75em',
        display: 'grid',
        gridTemplateColumns: 'auto auto',
        justifyContent: 'start',
        rowGap: '0.15em',
      });
    }

    for (const child of [...container.children]) {
      if (child.getAttribute(ACCOUNT_HIT_RATE_ROW_ATTRIBUTE) === 'true') {
        continue;
      }
      setStyles(child, { marginTop: '0' });
    }

    applyAccountHitRateShortLabels(container);
  }

  function resetAccountHitRateGrid(container) {
    if (!container || container.getAttribute(ACCOUNT_HIT_RATE_GRID_ATTRIBUTE) !== 'true') {
      return;
    }

    container.removeAttribute(ACCOUNT_HIT_RATE_GRID_ATTRIBUTE);
    setStyles(container, {
      columnGap: '',
      display: '',
      gridTemplateColumns: '',
      justifyContent: '',
      rowGap: '',
    });
    for (const child of [...container.children]) {
      setStyles(child, { marginTop: '' });
    }
    resetAccountHitRateShortLabels(container);
  }

  function createAccountHitRateLine(accountId) {
    const line = document.createElement('div');
    line.setAttribute(ACCOUNT_HIT_RATE_ROW_ATTRIBUTE, 'true');
    line.className = 'flex items-center gap-1 text-xs';
    setStyles(line, {
      alignItems: 'center',
      display: 'flex',
      gap: '4px',
      gridColumn: '1 / -1',
    });

    const label = document.createElement('span');
    label.setAttribute('data-sub2api-account-hit-rate-label', 'true');
    label.className = 'text-gray-500 dark:text-gray-400';
    label.textContent = '命中率:';
    line.appendChild(label);

    line.appendChild(createAccountHitRateBadge(accountId, 'today'));

    const separator = document.createElement('span');
    separator.setAttribute('data-sub2api-account-hit-rate-separator', 'true');
    separator.className = 'text-gray-400 dark:text-gray-500';
    separator.textContent = '·';
    line.appendChild(separator);

    line.appendChild(createAccountHitRateBadge(accountId, 'yesterday'));
    line.appendChild(createAccountHitRateTrackToggle(accountId));

    return line;
  }

  function renderAccountHitRateDayBadge(line, accountId, day) {
    const badge = line.querySelector(`[${ACCOUNT_HIT_RATE_BADGE_ATTRIBUTE}="${day}"]`);
    if (!badge) {
      return;
    }

    const state = getAccountHitRateDayState(accountId, day);
    badge.className = `inline-flex items-center font-medium tabular-nums whitespace-nowrap ${state.textClass}`;
    if (badge.textContent !== state.label) {
      badge.textContent = state.label;
    }
    const title = buildAccountHitRateDayTitle(accountId, day);
    if (badge.getAttribute('title') !== title) {
      badge.setAttribute('title', title);
      badge.setAttribute('aria-label', title);
    }
  }

  function renderAccountHitRateLine(line, accountId) {
    const tracked = isAccountHitRateTracked(accountId);

    renderAccountHitRateDayBadge(line, accountId, 'today');
    renderAccountHitRateDayBadge(line, accountId, 'yesterday');

    const toggle = line.querySelector(`[${ACCOUNT_HIT_RATE_TRACK_ATTRIBUTE}="true"]`);
    if (!toggle) {
      return;
    }

    const trackClass = tracked
      ? 'inline-flex items-center justify-center text-amber-500 hover:text-amber-600 dark:text-amber-400'
      : 'inline-flex items-center justify-center text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400';
    if (toggle.className !== trackClass) {
      toggle.className = trackClass;
    }
    const toggleTitle = tracked ? '停止自动获取该账号的缓存命中率' : '自动获取该账号的缓存命中率';
    if (toggle.getAttribute('title') !== toggleTitle) {
      toggle.setAttribute('title', toggleTitle);
      toggle.setAttribute('aria-label', toggleTitle);
    }
    toggle.setAttribute('aria-pressed', tracked ? 'true' : 'false');
  }

  function renderAccountHitRateRow(accountId) {
    const { index } = getAccountHitRateTableState();
    if (index === null) {
      return;
    }

    for (const row of document.querySelectorAll('tr')) {
      if (Number(row.getAttribute('data-row-id')) !== Number(accountId)) {
        continue;
      }
      renderAccountHitRateRowElement(row, index);
    }
  }

  function renderAccountHitRateRowElement(row, columnIndex) {
    const accountId = Number(row.getAttribute('data-row-id'));
    if (!Number.isSafeInteger(accountId) || accountId <= 0) {
      return;
    }

    const cell = getAccountHitRateCell(row, columnIndex);
    if (!cell) {
      return;
    }

    const statsContainer = getAccountHitRateStatsContainer(cell);
    const mount = statsContainer || cell.querySelector('div') || cell;
    const dates = resolveAccountHitRateDates();
    if (dates) {
      pruneAccountHitRateTodayEntries(dates.today);
    }

    let line = cell.querySelector(`[${ACCOUNT_HIT_RATE_ROW_ATTRIBUTE}="true"]`);
    if (!line) {
      line = createAccountHitRateLine(accountId);
    }

    if (line.parentElement !== mount) {
      mount.appendChild(line);
    }

    if (statsContainer) {
      applyAccountHitRateGrid(statsContainer);
      setStyles(line, { gridColumn: '1 / -1', marginTop: '0' });
    } else {
      setStyles(line, { gridColumn: '', marginTop: '4px' });
    }

    renderAccountHitRateLine(line, accountId);
  }

  function clearAccountHitRateRows() {
    for (const line of document.querySelectorAll(`[${ACCOUNT_HIT_RATE_ROW_ATTRIBUTE}="true"]`)) {
      const container = line.parentElement;
      line.remove();
      if (container) {
        resetAccountHitRateGrid(container);
      }
    }
  }

  function injectAccountHitRateRows() {
    if (!isAdminAccountsPage() || !isAccountHitRateEnabled()) {
      return;
    }

    const { index, ready } = getAccountHitRateTableState();
    if (!ready) {
      return;
    }

    if (index === null) {
      clearAccountHitRateRows();
      stopAccountHitRateSchedule();
      return;
    }

    for (const row of document.querySelectorAll('tr')) {
      const accountId = Number(row.getAttribute('data-row-id'));
      if (Number.isSafeInteger(accountId) && accountId > 0) {
        renderAccountHitRateRowElement(row, index);
      }
    }

    ensureAccountHitRatePolling();
  }

  function ensureAccountHitRatePolling() {
    if (!isAdminAccountsPage() || !isAccountHitRateEnabled()) {
      return;
    }
    if (getTrackedAccountIds().length === 0 || accountHitRatePaused) {
      return;
    }
    if (accountHitRateCycleTimer || accountHitRateCycleInFlight) {
      return;
    }
    if (isPageVisible()) {
      runAccountHitRateCycle();
    } else {
      scheduleAccountHitRateCycle();
    }
  }

  function scheduleAccountHitRateInjection() {
    if (accountHitRateInjectionPending) {
      return;
    }

    accountHitRateInjectionPending = true;
    accountHitRateInjectionTimer = window.setTimeout(() => {
      accountHitRateInjectionPending = false;
      accountHitRateInjectionTimer = null;
      injectAccountHitRateRows();
    }, ACCOUNT_HIT_RATE_INJECTION_DELAY_MS);
  }

  function createAccountHitRateNotice() {
    const notice = document.createElement('div');
    notice.setAttribute(ACCOUNT_HIT_RATE_NOTICE_ATTRIBUTE, 'true');
    setStyles(notice, {
      alignItems: 'center',
      background: 'rgba(254, 243, 199, 0.95)',
      border: '1px solid rgba(217, 119, 6, 0.45)',
      borderRadius: '8px',
      color: '#92400e',
      display: 'flex',
      flexWrap: 'wrap',
      fontSize: '13px',
      gap: '8px',
      marginBottom: '8px',
      padding: '8px 12px',
    });

    const message = document.createElement('span');
    message.setAttribute('data-sub2api-account-hit-rate-notice-text', 'true');
    notice.appendChild(message);

    const resumeButton = document.createElement('button');
    resumeButton.setAttribute('type', 'button');
    resumeButton.setAttribute('data-sub2api-account-hit-rate-notice-resume', 'true');
    resumeButton.textContent = '恢复';
    setStyles(resumeButton, { cursor: 'pointer', marginLeft: 'auto' });
    resumeButton.addEventListener('click', () => {
      accountHitRatePaused = false;
      accountHitRateConsecutiveFailures = 0;
      hideAccountHitRateNotice();
      restartAccountHitRateCycle();
      runAccountHitRateCycle();
    });
    notice.appendChild(resumeButton);

    const closeButton = document.createElement('button');
    closeButton.setAttribute('type', 'button');
    closeButton.setAttribute('data-sub2api-account-hit-rate-notice-close', 'true');
    closeButton.textContent = '关闭';
    setStyles(closeButton, { cursor: 'pointer' });
    closeButton.addEventListener('click', () => hideAccountHitRateNotice());
    notice.appendChild(closeButton);

    return notice;
  }

  function getAccountHitRateNoticeAnchor() {
    return document.querySelector('.space-y-6') || document.querySelector('main') || document.body;
  }

  function showAccountHitRateNotice(text, { resumable = true } = {}) {
    if (!accountHitRateNotice?.isConnected) {
      const anchor = getAccountHitRateNoticeAnchor();
      if (!anchor) {
        return;
      }
      accountHitRateNotice = createAccountHitRateNotice();
      anchor.insertBefore(accountHitRateNotice, anchor.firstChild || null);
    }

    const message = accountHitRateNotice.querySelector(
      '[data-sub2api-account-hit-rate-notice-text="true"]',
    );
    if (message && message.textContent !== text) {
      message.textContent = text;
    }

    const resumeButton = accountHitRateNotice.querySelector(
      '[data-sub2api-account-hit-rate-notice-resume="true"]',
    );
    if (resumeButton) {
      resumeButton.style.display = resumable ? '' : 'none';
    }
  }

  function hideAccountHitRateNotice() {
    accountHitRateNotice?.remove();
    accountHitRateNotice = null;
  }

  function isAccountHitRateColumnAvailable() {
    const { index, ready } = getAccountHitRateTableState();
    return !ready || index !== null;
  }

  function scheduleAccountHitRateCycle() {
    if (accountHitRateCycleTimer) {
      window.clearInterval(accountHitRateCycleTimer);
      accountHitRateCycleTimer = null;
    }

    const shouldRun = isAdminAccountsPage()
      && isAccountHitRateEnabled()
      && isAccountHitRateColumnAvailable()
      && !accountHitRatePaused
      && getTrackedAccountIds().length > 0;

    if (!shouldRun) {
      accountHitRateNextRunAt = null;
      return;
    }

    const intervalMs = getAccountHitRateIntervalMinutes() * 60 * 1000;
    accountHitRateNextRunAt = Date.now() + intervalMs;
    accountHitRateCycleTimer = window.setInterval(() => {
      if (!isAdminAccountsPage() || !isAccountHitRateEnabled() || !isPageVisible()) {
        return;
      }
      if (!isAccountHitRateColumnAvailable()) {
        stopAccountHitRateSchedule();
        return;
      }
      accountHitRateNextRunAt = Date.now() + intervalMs;
      runAccountHitRateCycle();
    }, intervalMs);
  }

  function restartAccountHitRateCycle() {
    scheduleAccountHitRateCycle();
  }

  function stopAccountHitRateSchedule() {
    accountHitRateCycleToken += 1;
    if (accountHitRateCycleTimer) {
      window.clearInterval(accountHitRateCycleTimer);
      accountHitRateCycleTimer = null;
    }
    accountHitRateNextRunAt = null;
  }

  async function runAccountHitRateCycle() {
    if (accountHitRateCycleInFlight || accountHitRatePaused) {
      return;
    }
    if (!isAdminAccountsPage() || !isAccountHitRateEnabled()) {
      stopAccountHitRateSchedule();
      return;
    }
    if (!isAccountHitRateColumnAvailable()) {
      stopAccountHitRateSchedule();
      return;
    }
    if (!isPageVisible()) {
      return;
    }

    const accountIds = getTrackedAccountIds().slice(0, ACCOUNT_HIT_RATE_MAX_TRACKED);
    if (accountIds.length === 0) {
      scheduleAccountHitRateCycle();
      return;
    }

    accountHitRateCycleInFlight = true;
    try {
      for (const accountId of accountIds) {
        if (!isAdminAccountsPage() || !isAccountHitRateEnabled() || !isPageVisible() || accountHitRatePaused) {
          break;
        }

        const result = await requestAccountHitRate(accountId, { forceToday: true });
        if (result?.status !== 'ok') {
          accountHitRateConsecutiveFailures += 1;
          if (accountHitRateConsecutiveFailures >= ACCOUNT_HIT_RATE_FAILURE_THRESHOLD) {
            accountHitRatePaused = true;
            showAccountHitRateNotice(
              `自动获取缓存命中率已暂停：连续 ${ACCOUNT_HIT_RATE_FAILURE_THRESHOLD} 次查询失败（${accountHitRateLastError || '未知原因'}）。`,
            );
            break;
          }
        }
        if (result?.retryAfterMs) {
          await sleep(result.retryAfterMs);
        }

        await sleep(
          ACCOUNT_HIT_RATE_JITTER_MIN_MS
            + Math.random() * (ACCOUNT_HIT_RATE_JITTER_MAX_MS - ACCOUNT_HIT_RATE_JITTER_MIN_MS),
        );
      }
    } finally {
      accountHitRateCycleInFlight = false;
      scheduleAccountHitRateCycle();
    }
  }

  function installAccountHitRateVisibilityWatcher() {
    if (accountHitRateVisibilityInstalled) {
      return;
    }
    accountHitRateVisibilityInstalled = true;

    const resumeIfPending = () => {
      if (!isAdminAccountsPage() || !isAccountHitRateEnabled() || accountHitRatePaused) {
        return;
      }
      if (!isPageVisible()) {
        return;
      }
      if (getTrackedAccountIds().length > 0 && accountHitRateNextRunAt === null) {
        runAccountHitRateCycle();
      }
    };

    document.addEventListener('visibilitychange', () => {
      if (!isAdminAccountsPage()) {
        return;
      }
      if (!isPageVisible()) {
        stopAccountHitRateSchedule();
        return;
      }
      resumeIfPending();
    });

    window.addEventListener('focus', resumeIfPending);
  }

  function installAccountHitRateLinks() {
    if (!isAdminAccountsPage() || !isAccountHitRateEnabled()) {
      cleanupAccountHitRate();
      return;
    }

    installAccountHitRateVisibilityWatcher();
    scheduleAccountHitRateInjection();

    if (accountHitRateObserver) {
      return;
    }
    accountHitRateObserver = new MutationObserver(() => {
      scheduleAccountHitRateInjection();
    });
    accountHitRateObserver.observe(document.documentElement, {
      attributeFilter: ['data-row-id'],
      attributes: true,
      childList: true,
      subtree: true,
    });
  }

  function cleanupAccountHitRate() {
    stopAccountHitRateSchedule();
    hideAccountHitRateNotice();

    if (accountHitRateObserver) {
      accountHitRateObserver.disconnect();
      accountHitRateObserver = null;
    }
    if (accountHitRateInjectionTimer) {
      window.clearTimeout(accountHitRateInjectionTimer);
      accountHitRateInjectionTimer = null;
    }
    accountHitRateInjectionPending = false;

    clearAccountHitRateRows();
  }
