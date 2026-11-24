  const ACCOUNT_HIT_RATE_BADGE_ATTRIBUTE = 'data-sub2api-account-hit-rate';
  const ACCOUNT_HIT_RATE_ROW_ATTRIBUTE = 'data-sub2api-account-hit-rate-row';
  const ACCOUNT_HIT_RATE_RENDER_KEY_ATTRIBUTE = 'data-sub2api-account-hit-rate-render-key';
  const ACCOUNT_HIT_RATE_GRID_ATTRIBUTE = 'data-sub2api-account-hit-rate-grid';
  const ACCOUNT_HIT_RATE_LABEL_ATTRIBUTE = 'data-sub2api-account-hit-rate-original-label';
  const ACCOUNT_HIT_RATE_TRACK_ATTRIBUTE = 'data-sub2api-account-hit-rate-track';
  const ACCOUNT_HIT_RATE_NOTICE_ATTRIBUTE = 'data-sub2api-account-hit-rate-notice';
  const ACCOUNT_HIT_RATE_TICK_MS = 1000;
  const ACCOUNT_HIT_RATE_BOOTSTRAP_SPACING_MS = 1500;
  const ACCOUNT_HIT_RATE_MIN_INTERVAL_MINUTES = 30;
  const ACCOUNT_HIT_RATE_MAX_INTERVAL_MINUTES = 1440;
  const ACCOUNT_HIT_RATE_DEFAULT_INTERVAL_MINUTES = 30;
  const ACCOUNT_HIT_RATE_REQUEST_TIMEOUT_MS = 8000;
  const ACCOUNT_HIT_RATE_JITTER_MIN_MS = 1000;
  const ACCOUNT_HIT_RATE_JITTER_MAX_MS = 2000;
  const ACCOUNT_HIT_RATE_HOVER_DELAY_MS = 150;
  const ACCOUNT_HIT_RATE_INJECTION_DELAY_MS = 50;
  const ACCOUNT_HIT_RATE_FAILURE_THRESHOLD = 2;
  const ACCOUNT_HIT_RATE_QUERY_CACHE_LIMIT = 200;
  const ACCOUNT_HIT_RATE_DAY_LABELS = { yesterday: '昨', today: '今' };
  const ACCOUNT_HIT_RATE_DAYS = ['today', 'yesterday'];

  const accountHitRateTodayEntries = new Map();
  const accountHitRateInFlight = new Map();

  let accountHitRateInjectionTimer = null;
  let accountHitRateInjectionPending = false;
  let accountHitRateNotice = null;
  let accountHitRateTicker = null;
  let accountHitRateSchedulerBusy = false;
  let accountHitRateNextAllowedAt = 0;
  const accountHitRateFailures = new Map();
  const accountHitRateBroken = new Set();
  const accountHitRateNextDueAt = new Map();
  let accountHitRateVisibilityInstalled = false;
  let accountHitRateObserver = null;
  let accountHitRateObservedTableBody = null;
  let accountHitRateResolvedTimeZone = null;
  let accountHitRateTrackedCache = null;
  let accountHitRateYesterdayCache = null;

  function isAccountHitRateEnabled() {
    return isFeatureEnabled(FEATURE_IDS.ADMIN_ACCOUNTS_HIT_RATE);
  }

  function getAccountHitRateTimeZone() {
    if (accountHitRateResolvedTimeZone === null) {
      accountHitRateResolvedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    }
    return accountHitRateResolvedTimeZone;
  }

  function resolveAccountHitRateDates() {
    const timeZone = getAccountHitRateTimeZone();
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
    const now = Date.now();
    if (
      accountHitRateTrackedCache
      && now - accountHitRateTrackedCache.at < STORAGE_READ_CACHE_MS
    ) {
      return accountHitRateTrackedCache.ids;
    }

    const raw = getStorageValue(STORAGE_NAMES.ADMIN_ACCOUNTS_HIT_RATE_TRACKED, []);
    const ids = [];
    if (Array.isArray(raw)) {
      for (const value of raw) {
        const accountId = Number(value);
        if (Number.isSafeInteger(accountId) && accountId > 0 && !ids.includes(accountId)) {
          ids.push(accountId);
        }
      }
    }

    accountHitRateTrackedCache = { at: now, ids };
    return ids;
  }

  function setTrackedAccountIds(ids) {
    const normalized = (ids || [])
      .filter((id) => Number.isSafeInteger(Number(id)) && Number(id) > 0)
      .map(Number);
    setStorageValue(STORAGE_NAMES.ADMIN_ACCOUNTS_HIT_RATE_TRACKED, normalized);
    accountHitRateTrackedCache = { at: Date.now(), ids: normalized };
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
      setTrackedAccountIds([...ids, normalizedId]);
      return 'added';
    }

    if (!tracked && exists) {
      setTrackedAccountIds(ids.filter((id) => id !== normalizedId));
      accountHitRateTodayEntries.delete(normalizedId);
      accountHitRateInFlight.delete(normalizedId);
      deleteAccountHitRateYesterday(normalizedId);
      accountHitRateNextDueAt.delete(normalizedId);
      accountHitRateFailures.delete(normalizedId);
      accountHitRateBroken.delete(normalizedId);
      return 'removed';
    }

    return 'unchanged';
  }

  function loadAccountHitRateYesterdayStore() {
    const raw = getStorageValue(STORAGE_NAMES.ADMIN_ACCOUNTS_HIT_RATE_YESTERDAY, {});
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  }

  function getAccountHitRateYesterdayStore() {
    const now = Date.now();
    if (
      accountHitRateYesterdayCache
      && now - accountHitRateYesterdayCache.at < STORAGE_READ_CACHE_MS
    ) {
      return accountHitRateYesterdayCache.store;
    }

    const store = loadAccountHitRateYesterdayStore();
    accountHitRateYesterdayCache = { at: now, store };
    return store;
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
    accountHitRateYesterdayCache = { at: Date.now(), store };
  }

  function deleteAccountHitRateYesterday(accountId) {
    const store = getAccountHitRateYesterdayStore();
    if (!(String(accountId) in store)) {
      return;
    }
    delete store[String(accountId)];
    setStorageValue(STORAGE_NAMES.ADMIN_ACCOUNTS_HIT_RATE_YESTERDAY, store);
    accountHitRateYesterdayCache = { at: Date.now(), store };
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
          accountHitRateFailures.delete(normalizedId);
          accountHitRateBroken.delete(normalizedId);
        } else {
          if (result.status === 'auth') {
            showAccountHitRateNotice('缓存命中率自动获取登录态失效，请重新登录后点击账号行徽标重试。');
          }
          const failures = (accountHitRateFailures.get(normalizedId) || 0) + 1;
          accountHitRateFailures.set(normalizedId, failures);
          if (failures >= ACCOUNT_HIT_RATE_FAILURE_THRESHOLD) {
            accountHitRateBroken.add(normalizedId);
          }
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

  function getAccountHitRateDayEntry(accountId, day, dates) {
    if (!dates) {
      return null;
    }
    return day === 'today'
      ? getAccountHitRateTodayEntry(accountId, dates.today)
      : getAccountHitRateYesterday(accountId, dates.yesterday);
  }

  function buildAccountHitRateDayTitle(accountId, day, dates) {
    if (!dates) {
      return '缓存命中率：无法确定当前日期';
    }

    const dayLabel = day === 'today' ? '今天' : '昨天';
    const dateText = day === 'today' ? dates.today : dates.yesterday;
    if (day === 'today' && accountHitRateBroken.has(Number(accountId))) {
      return `缓存命中率·今天（${dateText}）：连续 ${ACCOUNT_HIT_RATE_FAILURE_THRESHOLD} 次查询失败，已停止自动获取，点击重试`;
    }
    const entry = getAccountHitRateDayEntry(accountId, day, dates);

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

  function getAccountHitRateDayState(accountId, day, dates) {
    const pending = accountHitRateInFlight.has(Number(accountId));
    const entry = getAccountHitRateDayEntry(accountId, day, dates);
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

  function getAccountHitRateRenderModel(accountId, dates) {
    const days = ACCOUNT_HIT_RATE_DAYS.map((day) => ({
      day,
      state: getAccountHitRateDayState(accountId, day, dates),
      title: buildAccountHitRateDayTitle(accountId, day, dates),
    }));

    return { days, tracked: isAccountHitRateTracked(accountId) };
  }

  // Cheap signature: primitives only, so an unchanged row never builds labels
  // or titles. The minute bucket keeps the tooltip age from freezing.
  function getAccountHitRateRenderKey(accountId, dates) {
    if (!dates) {
      return 'nodates';
    }

    const now = Date.now();
    const pending = accountHitRateInFlight.has(Number(accountId));
    const parts = [
      isAccountHitRateTracked(accountId) ? '1' : '0',
      accountHitRateBroken.has(Number(accountId)) ? 'B' : '0',
    ];

    for (const day of ACCOUNT_HIT_RATE_DAYS) {
      const entry = getAccountHitRateDayEntry(accountId, day, dates);
      if (!entry) {
        parts.push(`${day}:${pending ? 'pending' : 'none'}`);
        continue;
      }

      const hasRate = Number.isFinite(entry.hitRate);
      parts.push([
        day,
        entry.date,
        entry.status || 'ok',
        hasRate ? entry.hitRate : 'n',
        entry.fetchedAt,
        hasRate ? Math.floor(Math.max(now - entry.fetchedAt, 0) / 60000) : '',
      ].join(':'));
    }

    return parts.join('|');
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
      const normalizedId = Number(accountId);
      accountHitRateBroken.delete(normalizedId);
      accountHitRateFailures.delete(normalizedId);
      requestAccountHitRate(normalizedId, { forceToday: day === 'today' }).then(() => {
        setAccountHitRateNextDue(normalizedId, getAccountHitRateIntervalMs());
      });
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
      const normalizedId = Number(accountId);
      const nextTracked = !isAccountHitRateTracked(normalizedId);
      const outcome = setAccountHitRateTracked(normalizedId, nextTracked);

      hideAccountHitRateNotice();
      if (nextTracked && outcome === 'added') {
        requestAccountHitRate(normalizedId).then(() => {
          setAccountHitRateNextDue(normalizedId, getAccountHitRateIntervalMs());
        });
      }
      restartAccountHitRateScheduler();

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

  function getAccountHitRateTableBody() {
    const main = document.querySelector('main');
    const table = (main && main.querySelector('table')) || document.querySelector('table');
    return table ? table.querySelector('tbody') : null;
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
    const cell = row.children[columnIndex];
    return cell && cell.tagName === 'TD' ? cell : null;
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
      if (child.style.marginTop !== '0') {
        child.style.marginTop = '0';
      }
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

  function renderAccountHitRateDayBadge(line, entry) {
    const badge = line.querySelector(`[${ACCOUNT_HIT_RATE_BADGE_ATTRIBUTE}="${entry.day}"]`);
    if (!badge) {
      return;
    }

    const className = `inline-flex items-center font-medium tabular-nums whitespace-nowrap ${entry.state.textClass}`;
    if (badge.className !== className) {
      badge.className = className;
    }
    if (badge.textContent !== entry.state.label) {
      badge.textContent = entry.state.label;
    }
    if (badge.getAttribute('title') !== entry.title) {
      badge.setAttribute('title', entry.title);
      badge.setAttribute('aria-label', entry.title);
    }
  }

  const ACCOUNT_HIT_RATE_TOGGLE_CLASS_TRACKED = 'inline-flex items-center justify-center text-amber-500 hover:text-amber-600 dark:text-amber-400';
  const ACCOUNT_HIT_RATE_TOGGLE_CLASS_IDLE = 'inline-flex items-center justify-center text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400';

  function renderAccountHitRateLine(line, model) {
    for (const entry of model.days) {
      renderAccountHitRateDayBadge(line, entry);
    }

    const toggle = line.querySelector(`[${ACCOUNT_HIT_RATE_TRACK_ATTRIBUTE}="true"]`);
    if (!toggle) {
      return;
    }

    const trackClass = model.tracked
      ? ACCOUNT_HIT_RATE_TOGGLE_CLASS_TRACKED
      : ACCOUNT_HIT_RATE_TOGGLE_CLASS_IDLE;
    if (toggle.className !== trackClass) {
      toggle.className = trackClass;
    }
    const toggleTitle = model.tracked ? '停止自动获取该账号的缓存命中率' : '自动获取该账号的缓存命中率';
    if (toggle.getAttribute('title') !== toggleTitle) {
      toggle.setAttribute('title', toggleTitle);
      toggle.setAttribute('aria-label', toggleTitle);
    }
    const pressed = model.tracked ? 'true' : 'false';
    if (toggle.getAttribute('aria-pressed') !== pressed) {
      toggle.setAttribute('aria-pressed', pressed);
    }
  }

  function renderAccountHitRateRow(accountId) {
    if (!isPageVisible()) {
      return;
    }

    const { index } = getAccountHitRateTableState();
    if (index === null) {
      return;
    }

    const dates = resolveAccountHitRateDates();
    for (const row of document.querySelectorAll('tr')) {
      if (Number(row.getAttribute('data-row-id')) !== Number(accountId)) {
        continue;
      }
      renderAccountHitRateRowElement(row, index, dates);
    }
  }

  function setAccountHitRateLineStyle(line, styles) {
    for (const [property, value] of Object.entries(styles)) {
      if (line.style[property] !== value) {
        line.style[property] = value;
      }
    }
  }

  function renderAccountHitRateRowElement(row, columnIndex, dates) {
    const accountId = Number(row.getAttribute('data-row-id'));
    if (!Number.isSafeInteger(accountId) || accountId <= 0) {
      return;
    }

    const cell = getAccountHitRateCell(row, columnIndex);
    if (!cell) {
      return;
    }

    const modelKey = getAccountHitRateRenderKey(accountId, dates);
    let line = cell.querySelector(`[${ACCOUNT_HIT_RATE_ROW_ATTRIBUTE}="true"]`);

    if (line) {
      // Reading the parent's attribute is enough for the common case: the line
      // already sits inside the grid, so an unchanged row costs nothing.
      const parentIsGrid = line.parentElement
        && line.parentElement.getAttribute(ACCOUNT_HIT_RATE_GRID_ATTRIBUTE) === 'true';

      if (!parentIsGrid) {
        // The today stats cell swaps between `-` and the stats stack, so the
        // line may need to follow the stack when it appears later.
        const lateContainer = getAccountHitRateStatsContainer(cell);
        if (lateContainer) {
          if (line.parentElement !== lateContainer) {
            lateContainer.appendChild(line);
          }
          applyAccountHitRateGrid(lateContainer);
          setAccountHitRateLineStyle(line, { gridColumn: '1 / -1', marginTop: '0' });
        } else {
          const mount = cell.querySelector('div') || cell;
          if (line.parentElement !== mount) {
            mount.appendChild(line);
          }
          setAccountHitRateLineStyle(line, { gridColumn: '', marginTop: '4px' });
        }
      }

      if (line.getAttribute(ACCOUNT_HIT_RATE_RENDER_KEY_ATTRIBUTE) === modelKey) {
        return;
      }
      renderAccountHitRateLine(line, getAccountHitRateRenderModel(accountId, dates));
      line.setAttribute(ACCOUNT_HIT_RATE_RENDER_KEY_ATTRIBUTE, modelKey);
      return;
    }

    const statsContainer = getAccountHitRateStatsContainer(cell);
    const mount = statsContainer || cell.querySelector('div') || cell;

    line = createAccountHitRateLine(accountId);
    mount.appendChild(line);

    if (statsContainer) {
      applyAccountHitRateGrid(statsContainer);
      setAccountHitRateLineStyle(line, { gridColumn: '1 / -1', marginTop: '0' });
    } else {
      setAccountHitRateLineStyle(line, { gridColumn: '', marginTop: '4px' });
    }

    renderAccountHitRateLine(line, getAccountHitRateRenderModel(accountId, dates));
    line.setAttribute(ACCOUNT_HIT_RATE_RENDER_KEY_ATTRIBUTE, modelKey);
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
    if (!isAdminAccountsPage() || !isAccountHitRateEnabled() || !isPageVisible()) {
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

    const dates = resolveAccountHitRateDates();
    if (dates) {
      pruneAccountHitRateTodayEntries(dates.today);
    }

    for (const row of document.querySelectorAll('tr')) {
      const accountId = Number(row.getAttribute('data-row-id'));
      if (Number.isSafeInteger(accountId) && accountId > 0) {
        renderAccountHitRateRowElement(row, index, dates);
      }
    }

    ensureAccountHitRatePolling();
  }

  function ensureAccountHitRatePolling() {
    if (!isAdminAccountsPage() || !isAccountHitRateEnabled()) {
      return;
    }
    if (getTrackedAccountIds().length === 0) {
      stopAccountHitRateSchedule();
      return;
    }
    if (accountHitRateTicker || accountHitRateSchedulerBusy) {
      return;
    }
    if (isPageVisible()) {
      ensureAccountHitRateTicker();
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

    const closeButton = document.createElement('button');
    closeButton.setAttribute('type', 'button');
    closeButton.setAttribute('data-sub2api-account-hit-rate-notice-close', 'true');
    closeButton.textContent = '关闭';
    setStyles(closeButton, { cursor: 'pointer', marginLeft: 'auto' });
    closeButton.addEventListener('click', () => hideAccountHitRateNotice());
    notice.appendChild(closeButton);

    return notice;
  }

  function getAccountHitRateNoticeAnchor() {
    return document.querySelector('.space-y-6') || document.querySelector('main') || document.body;
  }

  function showAccountHitRateNotice(text) {
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
  }

  function hideAccountHitRateNotice() {
    accountHitRateNotice?.remove();
    accountHitRateNotice = null;
  }

  function isAccountHitRateColumnAvailable() {
    const { index, ready } = getAccountHitRateTableState();
    return !ready || index !== null;
  }

  function getAccountHitRateIntervalMs() {
    return getAccountHitRateIntervalMinutes() * 60 * 1000;
  }

  function setAccountHitRateNextDue(accountId, delayMs) {
    accountHitRateNextDueAt.set(Number(accountId), Date.now() + delayMs);
  }

  function ensureAccountHitRateTicker() {
    if (accountHitRateTicker) {
      return;
    }
    accountHitRateTicker = window.setInterval(
      runAccountHitRateSchedulerTick,
      ACCOUNT_HIT_RATE_TICK_MS,
    );
  }

  function stopAccountHitRateSchedule() {
    if (accountHitRateTicker) {
      window.clearInterval(accountHitRateTicker);
      accountHitRateTicker = null;
    }
  }

  function restartAccountHitRateScheduler() {
    if (getTrackedAccountIds().length > 0 && isPageVisible()) {
      ensureAccountHitRateTicker();
    } else {
      stopAccountHitRateSchedule();
    }
  }

  function resetAccountHitRateSchedule() {
    accountHitRateNextDueAt.clear();
    restartAccountHitRateScheduler();
  }

  function pickDueAccountHitRate(now, intervalMs) {
    const accountIds = getTrackedAccountIds();
    const bootstrapWindow = Math.min(
      intervalMs,
      accountIds.length * ACCOUNT_HIT_RATE_BOOTSTRAP_SPACING_MS,
    );
    let pick = null;
    let pickDue = Infinity;
    for (const accountId of accountIds) {
      if (accountHitRateBroken.has(accountId)) {
        continue;
      }
      if (!accountHitRateNextDueAt.has(accountId)) {
        // ponytail: bootstrap phases are in-memory only; persist per-account
        // schedules if the first-round spread ever needs to survive reloads.
        accountHitRateNextDueAt.set(accountId, now + Math.random() * bootstrapWindow);
      }
      const due = accountHitRateNextDueAt.get(accountId);
      if (due <= now && due < pickDue) {
        pick = accountId;
        pickDue = due;
      }
    }
    return pick;
  }

  function runAccountHitRateSchedulerTick() {
    if (!isAdminAccountsPage() || !isAccountHitRateEnabled() || !isPageVisible()) {
      return;
    }
    if (!isAccountHitRateColumnAvailable()) {
      stopAccountHitRateSchedule();
      return;
    }
    if (accountHitRateSchedulerBusy || Date.now() < accountHitRateNextAllowedAt) {
      return;
    }

    const intervalMs = getAccountHitRateIntervalMs();
    const accountId = pickDueAccountHitRate(Date.now(), intervalMs);
    if (accountId === null) {
      return;
    }

    accountHitRateSchedulerBusy = true;
    requestAccountHitRate(accountId, { forceToday: true })
      .then((result) => {
        setAccountHitRateNextDue(
          accountId,
          intervalMs + Math.random() * ACCOUNT_HIT_RATE_JITTER_MAX_MS,
        );
        const gapMs = ACCOUNT_HIT_RATE_JITTER_MIN_MS
          + Math.random() * (ACCOUNT_HIT_RATE_JITTER_MAX_MS - ACCOUNT_HIT_RATE_JITTER_MIN_MS);
        accountHitRateNextAllowedAt = Date.now() + Math.max(gapMs, result?.retryAfterMs || 0);
      })
      .finally(() => {
        accountHitRateSchedulerBusy = false;
      });
  }

  function installAccountHitRateVisibilityWatcher() {
    if (accountHitRateVisibilityInstalled) {
      return;
    }
    accountHitRateVisibilityInstalled = true;

    const resumeIfPending = () => {
      if (!isAdminAccountsPage() || !isAccountHitRateEnabled() || !isPageVisible()) {
        return;
      }
      if (getTrackedAccountIds().length > 0 && !accountHitRateTicker) {
        ensureAccountHitRateTicker();
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
      // Passes were skipped while the page was hidden; catch the injection up.
      scheduleAccountHitRateInjection();
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

    const tableBody = getAccountHitRateTableBody();
    if (!tableBody) {
      return;
    }
    if (accountHitRateObserver && tableBody === accountHitRateObservedTableBody) {
      return;
    }

    if (accountHitRateObserver) {
      accountHitRateObserver.disconnect();
    } else {
      accountHitRateObserver = new MutationObserver(() => {
        scheduleAccountHitRateInjection();
      });
    }
    accountHitRateObserver.observe(tableBody, {
      attributeFilter: ['data-row-id'],
      attributes: true,
      childList: true,
      subtree: true,
    });
    accountHitRateObservedTableBody = tableBody;
  }

  function cleanupAccountHitRate() {
    stopAccountHitRateSchedule();
    hideAccountHitRateNotice();

    if (accountHitRateObserver) {
      accountHitRateObserver.disconnect();
      accountHitRateObserver = null;
    }
    accountHitRateObservedTableBody = null;
    if (accountHitRateInjectionTimer) {
      window.clearTimeout(accountHitRateInjectionTimer);
      accountHitRateInjectionTimer = null;
    }
    accountHitRateInjectionPending = false;

    clearAccountHitRateRows();
  }
