// ==UserScript==
// @name         Sub2API Helper
// @namespace    https://github.com/skt-shinyruo/tampermonkey-scripts
// @version      0.22.25
// @description  为 Sub2API 管理端提供深色、浅色、系统主题模式和侧边栏收起状态记忆；为使用记录页增加日期范围、粒度、每页记忆与自动刷新倒计时，并为仪表盘增加时间范围和粒度记忆。
// @match        *://*/*
// @updateURL    https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/sub2api-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/sub2api-helper.user.js
// @grant        GM_deleteValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_VERSION = '0.22.25';
  const STORAGE_NAMESPACE = 'sub2api-helper';
  const STORAGE_MISSING = {};
  const LEGACY_STORAGE_ORIGIN = 'https://codex.ciii.club';
  const SETTINGS_MENU_LABEL = 'Sub2API Helper 设置';
  const STORAGE_NAMES = {
    ADMIN_ACCOUNTS_FILTER_GROUP: 'admin-accounts-filter-group',
    ADMIN_ACCOUNTS_FILTER_PLATFORM: 'admin-accounts-filter-platform',
    ADMIN_ACCOUNTS_FILTER_PRIVACY: 'admin-accounts-filter-privacy',
    ADMIN_ACCOUNTS_FILTER_STATUS: 'admin-accounts-filter-status',
    ADMIN_ACCOUNTS_FILTER_TYPE: 'admin-accounts-filter-type',
    ADMIN_DASHBOARD_DATE_RANGE: 'admin-dashboard-date-range',
    ADMIN_DASHBOARD_GRANULARITY: 'admin-dashboard-granularity',
    ADMIN_USAGE_DATE_RANGE: 'admin-usage-date-range',
    ADMIN_USAGE_GRANULARITY: 'admin-usage-granularity',
    ADMIN_USAGE_PAGE_SIZE: 'admin-usage-page-size',
    AUTO_REFRESH: 'auto-refresh-ms',
    DASHBOARD_DATE_RANGE: 'dashboard-date-range',
    DASHBOARD_GRANULARITY: 'dashboard-granularity',
    PAGE_SIZE: 'usage-page-size',
    SIDEBAR_COLLAPSED: 'sidebar-collapsed',
    USAGE_DATE_RANGE: 'usage-date-range',
    USAGE_GRANULARITY: 'usage-granularity',
  };
  const THEME_MODE_STORAGE_NAME = 'theme-mode';
  const THEME_MODE_VALUES = {
    DARK: 'dark',
    LIGHT: 'light',
    SYSTEM: 'system',
  };
  const THEME_MODE_OPTIONS = [
    {
      description: '跟随系统或浏览器的深浅色偏好。',
      label: '系统',
      value: THEME_MODE_VALUES.SYSTEM,
    },
    {
      description: '始终使用浅色界面。',
      label: '浅色模式',
      value: THEME_MODE_VALUES.LIGHT,
    },
    {
      description: '始终使用深色界面。',
      label: '深色模式',
      value: THEME_MODE_VALUES.DARK,
    },
  ];
  const SETTINGS_GROUPS = {
    ADMIN_ACCOUNTS: 'admin-accounts',
    ADMIN_DASHBOARD: 'admin-dashboard',
    ADMIN_USAGE: 'admin-usage',
    DASHBOARD: 'dashboard',
    USAGE: 'usage',
  };
  const FEATURE_IDS = {
    ADMIN_ACCOUNTS_FILTERS: 'admin-accounts-filters',
    ADMIN_DASHBOARD_DATE_RANGE: 'admin-dashboard-date-range',
    ADMIN_DASHBOARD_GRANULARITY: 'admin-dashboard-granularity',
    ADMIN_USAGE_DATE_RANGE: 'admin-usage-date-range',
    ADMIN_USAGE_GRANULARITY: 'admin-usage-granularity',
    ADMIN_USAGE_PAGE_SIZE: 'admin-usage-page-size',
    DASHBOARD_DATE_RANGE: 'dashboard-date-range',
    DASHBOARD_GRANULARITY: 'dashboard-granularity',
    SIDEBAR_STATE: 'sidebar-state',
    THEME_SYNC: 'theme-sync',
    USAGE_AUTO_REFRESH: 'usage-auto-refresh',
    USAGE_DATE_RANGE: 'usage-date-range',
    USAGE_GRANULARITY: 'usage-granularity',
    USAGE_PAGE_SIZE: 'usage-page-size',
  };
  const FEATURE_SETTINGS = [
    {
      description: '记住并恢复侧边栏收起或展开状态。',
      id: FEATURE_IDS.SIDEBAR_STATE,
      label: '侧边栏状态记忆',
    },
    {
      description: '记住 /usage tab 的日期范围，并同步改写使用记录请求。',
      groupId: SETTINGS_GROUPS.USAGE,
      id: FEATURE_IDS.USAGE_DATE_RANGE,
      label: '使用记录 tab (/usage) - 日期范围',
    },
    {
      description: '记住 /usage tab 的粒度选择。',
      groupId: SETTINGS_GROUPS.USAGE,
      id: FEATURE_IDS.USAGE_GRANULARITY,
      label: '使用记录 tab (/usage) - 粒度',
    },
    {
      description: '记住 /usage tab 每页显示数量。',
      groupId: SETTINGS_GROUPS.USAGE,
      id: FEATURE_IDS.USAGE_PAGE_SIZE,
      label: '使用记录 tab (/usage) - 每页数量',
    },
    {
      description: '在 /usage tab 增加自动刷新和倒计时控件。',
      groupId: SETTINGS_GROUPS.USAGE,
      id: FEATURE_IDS.USAGE_AUTO_REFRESH,
      label: '使用记录自动刷新 tab (/usage)',
    },
    {
      description: '记住 /admin/usage tab 的日期范围，并同步改写管理端使用记录请求。',
      groupId: SETTINGS_GROUPS.ADMIN_USAGE,
      id: FEATURE_IDS.ADMIN_USAGE_DATE_RANGE,
      label: '管理端使用记录 tab (/admin/usage) - 日期范围',
    },
    {
      description: '记住 /admin/usage tab 的粒度选择。',
      groupId: SETTINGS_GROUPS.ADMIN_USAGE,
      id: FEATURE_IDS.ADMIN_USAGE_GRANULARITY,
      label: '管理端使用记录 tab (/admin/usage) - 粒度',
    },
    {
      description: '记住 /admin/usage tab 每页显示数量。',
      groupId: SETTINGS_GROUPS.ADMIN_USAGE,
      id: FEATURE_IDS.ADMIN_USAGE_PAGE_SIZE,
      label: '管理端使用记录 tab (/admin/usage) - 每页数量',
    },
    {
      description: '记住 /admin/accounts tab 的平台、类型、状态、Privacy 和分组筛选。',
      groupId: SETTINGS_GROUPS.ADMIN_ACCOUNTS,
      id: FEATURE_IDS.ADMIN_ACCOUNTS_FILTERS,
      label: '账号管理 tab (/admin/accounts) - 筛选条件',
    },
    {
      description: '记住 /dashboard tab 的日期范围，并同步改写仪表盘趋势请求。',
      groupId: SETTINGS_GROUPS.DASHBOARD,
      id: FEATURE_IDS.DASHBOARD_DATE_RANGE,
      label: '仪表盘 tab (/dashboard) - 日期范围',
    },
    {
      description: '记住 /dashboard tab 的粒度选择。',
      groupId: SETTINGS_GROUPS.DASHBOARD,
      id: FEATURE_IDS.DASHBOARD_GRANULARITY,
      label: '仪表盘 tab (/dashboard) - 粒度',
    },
    {
      description: '记住 /admin/dashboard tab 的日期范围，并同步改写管理端仪表盘请求。',
      groupId: SETTINGS_GROUPS.ADMIN_DASHBOARD,
      id: FEATURE_IDS.ADMIN_DASHBOARD_DATE_RANGE,
      label: '管理端仪表盘 tab (/admin/dashboard) - 日期范围',
    },
    {
      description: '记住 /admin/dashboard tab 的粒度选择。',
      groupId: SETTINGS_GROUPS.ADMIN_DASHBOARD,
      id: FEATURE_IDS.ADMIN_DASHBOARD_GRANULARITY,
      label: '管理端仪表盘 tab (/admin/dashboard) - 粒度',
    },
  ];
  const LEGACY_STORAGE_KEYS = {
    [STORAGE_NAMES.AUTO_REFRESH]: 'ciii-codex-auto-refresh-ms',
    [STORAGE_NAMES.DASHBOARD_DATE_RANGE]: 'ciii-codex-dashboard-date-range',
    [STORAGE_NAMES.DASHBOARD_GRANULARITY]: 'ciii-codex-dashboard-granularity',
    [STORAGE_NAMES.PAGE_SIZE]: 'ciii-codex-usage-page-size',
    [STORAGE_NAMES.USAGE_DATE_RANGE]: 'ciii-codex-usage-date-range',
  };
  const PAGE_THEME_STORAGE_KEY = 'theme';
  const WAIT_INTERVAL_MS = 250;
  const WAIT_TIMEOUT_MS = 15000;
  const RANGE_RESTORE_SETTLE_TIMEOUT_MS = 1000;
  const RANGE_RESTORE_ATTEMPT_LIMIT = 3;
  const AUTO_REFRESH_COUNTDOWN_INTERVAL_MS = 1000;
  const THEME_TOGGLE_WAIT_TIMEOUT_MS = 5000;
  const THEME_SYNC_RETRY_DELAY_MS = 500;
  const PAGE_SIZE_SELECTION_WINDOW_MS = 5000;
  const PAGE_SIZE_SAVE_DELAY_MS = 150;
  const DATE_RANGE_SELECTION_WINDOW_MS = 5000;
  const SIDEBAR_STATE_SAVE_DELAY_MS = 150;
  const SIDEBAR_STATE_SETTLE_TIMEOUT_MS = 1200;
  const SIDEBAR_STATE_SETTLE_INTERVAL_MS = 100;
  const SIDEBAR_STATE_RESTORE_IN_FLIGHT_MS = 1200;
  const FOREGROUND_REFRESH_WAIT_TIMEOUT_MS = 3000;
  const FOREGROUND_WATCH_INTERVAL_MS = 1000;
  const FOREGROUND_WATCH_GAP_MS = 2500;
  const AUTO_REFRESH_DEBUG_EVENT_LIMIT = 8;
  const AUTO_REFRESH_OPTIONS = [
    { value: 'off', label: '关闭', ms: 0 },
    { value: '5000', label: '5s', ms: 5000 },
    { value: '10000', label: '10s', ms: 10000 },
    { value: '30000', label: '30s', ms: 30000 },
    { value: '60000', label: '1分钟', ms: 60000 },
  ];
  const ADMIN_DASHBOARD_DATE_RANGE_API_PATHS = [
    '/api/v1/admin/dashboard/trend',
    '/api/v1/admin/dashboard/models',
    '/api/v1/admin/dashboard/groups',
    '/api/v1/admin/dashboard/snapshot-v2',
    '/api/v1/admin/dashboard/api-keys-trend',
    '/api/v1/admin/dashboard/users-trend',
    '/api/v1/admin/dashboard/users-ranking',
    '/api/v1/admin/dashboard/user-breakdown',
  ];
  const AUTO_REFRESH_STATE = {
    OFF: 'off',
    RUNNING: 'running',
    PAUSED_HIDDEN: 'paused-hidden',
    RESUMING: 'resuming',
  };
  const PAGE_SIZE_OPTIONS = ['10', '20', '50', '100', '200', '500'];
  const ADMIN_ACCOUNTS_FILTERS = [
    {
      defaultLabel: '全部平台',
      id: 'platform',
      storageName: STORAGE_NAMES.ADMIN_ACCOUNTS_FILTER_PLATFORM,
    },
    {
      defaultLabel: '全部类型',
      id: 'type',
      storageName: STORAGE_NAMES.ADMIN_ACCOUNTS_FILTER_TYPE,
    },
    {
      defaultLabel: '全部状态',
      id: 'status',
      storageName: STORAGE_NAMES.ADMIN_ACCOUNTS_FILTER_STATUS,
    },
    {
      defaultLabel: '全部Privacy状态',
      id: 'privacy',
      storageName: STORAGE_NAMES.ADMIN_ACCOUNTS_FILTER_PRIVACY,
    },
    {
      defaultLabel: '全部分组',
      fallbackOnMissing: true,
      id: 'group',
      storageName: STORAGE_NAMES.ADMIN_ACCOUNTS_FILTER_GROUP,
    },
  ];

  let rangeRestoreInFlight = false;
  let rangeRestoreToken = 0;
  let usageRequestRewriteInstalled = false;
  let autoRefreshTimer = null;
  let autoRefreshCountdownTimer = null;
  let autoRefreshButton = null;
  let autoRefreshMenu = null;
  let activeAutoRefreshValue = 'off';
  let nextAutoRefreshAt = null;
  let browserThemeMediaQuery = null;
  let browserThemeWatcherInstalled = false;
  let pageVisibilityWatcherInstalled = false;
  let pageSizeWatcherInstalled = false;
  let clickHooksInstalled = false;
  let autoRefreshMenuCloseHookInstalled = false;
  let settingsLauncherButton = null;
  let settingsPanelRoot = null;
  let urlWatcherInstalled = false;
  let activationWatcherInstalled = false;
  let activationRetryInFlight = false;
  let activationRetryToken = 0;
  let helperActivated = false;
  let themeSyncInFlight = false;
  let pageSizeSelectionActiveUntil = 0;
  let sidebarSelectionActiveUntil = 0;
  let sidebarSelectionPreviousState = null;
  let sidebarRestoreInFlightUntil = 0;
  let lastObservedPageSizeValue = null;
  let granularitySelectionActiveUntil = 0;
  let lastObservedGranularityValue = null;
  let adminAccountsFilterSelectionActiveUntil = 0;
  let activeAdminAccountsFilterId = null;
  let adminAccountsFilterRestoreInFlight = false;
  let dateRangeSelectionActiveUntil = 0;
  let autoRefreshState = AUTO_REFRESH_STATE.OFF;
  let lastForegroundRefreshAt = 0;
  let foregroundWatcherInstalled = false;
  let lastKnownForeground = null;
  let lastForegroundWatchAt = 0;
  let autoRefreshPausedByBackground = false;
  let autoRefreshResumeToken = 0;
  let lastAutoRefreshEvent = 'boot';
  let autoRefreshDebugEvents = [];

  const storage = {
    get(key, fallback = null) {
      try {
        return GM_getValue(key, fallback);
      } catch (error) {
        const raw = localStorage.getItem(key);
        if (!raw) {
          return fallback;
        }
        try {
          return JSON.parse(raw);
        } catch (parseError) {
          return fallback;
        }
      }
    },
    set(key, value) {
      try {
        GM_setValue(key, value);
      } catch (error) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    },
    delete(key) {
      try {
        GM_deleteValue(key);
      } catch (error) {
        localStorage.removeItem(key);
      }
    },
  };

  function getCurrentOrigin() {
    return location.origin || new URL(location.href).origin;
  }

  function getScopedStorageKey(name) {
    return `${STORAGE_NAMESPACE}:${getCurrentOrigin()}:${name}`;
  }

  function getGlobalSettingsStorageKey(name) {
    return `${STORAGE_NAMESPACE}:global:${name}`;
  }

  function getCurrentPageSettingsStorageKey(name) {
    return `${STORAGE_NAMESPACE}:${getCurrentOrigin()}:${location.pathname}:${name}`;
  }

  function getGlobalFeatureSettingsStorageKey(featureId) {
    return getGlobalSettingsStorageKey(`feature:${featureId}:enabled`);
  }

  function getCurrentPageFeatureSettingsStorageKey(featureId) {
    return getCurrentPageSettingsStorageKey(`feature:${featureId}:enabled`);
  }

  function normalizeEnabledSetting(value, fallback = true) {
    if (value === STORAGE_MISSING) {
      return fallback;
    }
    if (value === false || value === 'false') {
      return false;
    }
    if (value === true || value === 'true') {
      return true;
    }
    return fallback;
  }

  function getEnabledSetting(key, fallback = true) {
    return normalizeEnabledSetting(storage.get(key, STORAGE_MISSING), fallback);
  }

  function getGlobalFeatureEnabled(featureId) {
    return getEnabledSetting(getGlobalFeatureSettingsStorageKey(featureId), true);
  }

  function setGlobalFeatureEnabled(featureId, value) {
    storage.set(getGlobalFeatureSettingsStorageKey(featureId), Boolean(value));
  }

  function getCurrentPageFeatureEnabled(featureId) {
    return getEnabledSetting(getCurrentPageFeatureSettingsStorageKey(featureId), true);
  }

  function setCurrentPageFeatureEnabled(featureId, value) {
    storage.set(getCurrentPageFeatureSettingsStorageKey(featureId), Boolean(value));
  }

  function isFeatureEnabled(featureId) {
    return getGlobalFeatureEnabled(featureId) && getCurrentPageFeatureEnabled(featureId);
  }

  function normalizeThemeMode(value) {
    const normalizedValue = String(value || '').trim();
    return THEME_MODE_OPTIONS.some((option) => option.value === normalizedValue)
      ? normalizedValue
      : THEME_MODE_VALUES.SYSTEM;
  }

  function getSavedThemeMode() {
    return normalizeThemeMode(
      storage.get(getGlobalSettingsStorageKey(THEME_MODE_STORAGE_NAME), THEME_MODE_VALUES.SYSTEM),
    );
  }

  function setSavedThemeMode(value) {
    storage.set(getGlobalSettingsStorageKey(THEME_MODE_STORAGE_NAME), normalizeThemeMode(value));
  }

  function getStorageValue(name, fallback = null) {
    const scopedKey = getScopedStorageKey(name);
    const scopedValue = storage.get(scopedKey, STORAGE_MISSING);
    if (scopedValue !== STORAGE_MISSING) {
      return scopedValue;
    }

    if (getCurrentOrigin() !== LEGACY_STORAGE_ORIGIN) {
      return fallback;
    }

    const legacyKey = LEGACY_STORAGE_KEYS[name];
    if (!legacyKey) {
      return fallback;
    }

    const legacyValue = storage.get(legacyKey, STORAGE_MISSING);
    if (legacyValue === STORAGE_MISSING) {
      return fallback;
    }

    storage.set(scopedKey, legacyValue);
    return legacyValue;
  }

  function setStorageValue(name, value) {
    storage.set(getScopedStorageKey(name), value);
  }

  function deleteStorageValue(name) {
    storage.delete(getScopedStorageKey(name));
    if (getCurrentOrigin() !== LEGACY_STORAGE_ORIGIN) {
      return;
    }

    const legacyKey = LEGACY_STORAGE_KEYS[name];
    if (legacyKey) {
      storage.delete(legacyKey);
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitFor(getter, timeoutMs = WAIT_TIMEOUT_MS) {
    const startAt = Date.now();
    while (Date.now() - startAt < timeoutMs) {
      const value = getter();
      if (value) {
        return value;
      }
      await sleep(WAIT_INTERVAL_MS);
    }
    return null;
  }

  function isAdminUsagePage() {
    return location.pathname.startsWith('/admin/usage');
  }

  function isUserUsagePage() {
    return location.pathname.startsWith('/usage');
  }

  function isUsagePage() {
    return isUserUsagePage() || isAdminUsagePage();
  }

  function isUsageAutoRefreshPage() {
    return location.pathname.startsWith('/usage');
  }

  function isAdminAccountsPage() {
    return location.pathname === '/admin/accounts' || location.pathname.startsWith('/admin/accounts/');
  }

  function isAdminDashboardPage() {
    return location.pathname === '/admin/dashboard' || location.pathname.startsWith('/admin/dashboard/');
  }

  function isUserDashboardPage() {
    return location.pathname.startsWith('/dashboard');
  }

  function isDashboardPage() {
    return isUserDashboardPage() || isAdminDashboardPage();
  }

  function getActiveDateRangeStorageName() {
    if (isAdminUsagePage()) {
      return STORAGE_NAMES.ADMIN_USAGE_DATE_RANGE;
    }
    if (isUserUsagePage()) {
      return STORAGE_NAMES.USAGE_DATE_RANGE;
    }
    if (isAdminDashboardPage()) {
      return STORAGE_NAMES.ADMIN_DASHBOARD_DATE_RANGE;
    }
    if (isUserDashboardPage()) {
      return STORAGE_NAMES.DASHBOARD_DATE_RANGE;
    }
    return null;
  }

  function getActivePageSizeStorageName() {
    if (isAdminUsagePage()) {
      return STORAGE_NAMES.ADMIN_USAGE_PAGE_SIZE;
    }
    if (isUserUsagePage()) {
      return STORAGE_NAMES.PAGE_SIZE;
    }
    return null;
  }

  function getSavedRangeForCurrentPage() {
    const storageName = getActiveDateRangeStorageName();
    if (!storageName) {
      return null;
    }
    return getStorageValue(storageName, null);
  }

  function formatIsoDateFromParts({ year, month, day }) {
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  function getDatePartsInTimeZone(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      month: '2-digit',
      timeZone,
      year: 'numeric',
    });
    const parts = Object.fromEntries(
      formatter
        .formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );

    return {
      day: parts.day,
      month: parts.month,
      year: parts.year,
    };
  }

  function getTodayIsoDate(timeZone) {
    return formatIsoDateFromParts(getDatePartsInTimeZone(new Date(), timeZone));
  }

  function shiftIsoDate(dateText, offsetDays) {
    const [year, month, day] = String(dateText || '')
      .split('-')
      .map(Number);
    if (!year || !month || !day) {
      return '';
    }

    const shiftedDate = new Date(Date.UTC(year, month - 1, day));
    shiftedDate.setUTCDate(shiftedDate.getUTCDate() + offsetDays);
    return shiftedDate.toISOString().slice(0, 10);
  }

  function getStartOfMonthIsoDate(dateText) {
    const [year, month] = String(dateText || '')
      .split('-')
      .map(Number);
    if (!year || !month) {
      return '';
    }
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  }

  function getEndOfPreviousMonthIsoDate(dateText) {
    const firstDayOfMonth = getStartOfMonthIsoDate(dateText);
    if (!firstDayOfMonth) {
      return '';
    }
    return shiftIsoDate(firstDayOfMonth, -1);
  }

  function resolvePresetRange(label, timeZone) {
    const today = getTodayIsoDate(timeZone);
    if (!today) {
      return null;
    }

    switch (String(label || '').trim()) {
      case '今天':
        return { start: today, end: today };
      case '昨天': {
        const yesterday = shiftIsoDate(today, -1);
        return { start: yesterday, end: yesterday };
      }
      case '近24小时':
        return { start: shiftIsoDate(today, -1), end: today };
      case '近 7 天':
        return { start: shiftIsoDate(today, -6), end: today };
      case '近 14 天':
        return { start: shiftIsoDate(today, -13), end: today };
      case '近 30 天':
        return { start: shiftIsoDate(today, -29), end: today };
      case '本月':
        return { start: getStartOfMonthIsoDate(today), end: today };
      case '上月': {
        const previousMonthEnd = getEndOfPreviousMonthIsoDate(today);
        return {
          start: getStartOfMonthIsoDate(previousMonthEnd),
          end: previousMonthEnd,
        };
      }
      default:
        return null;
    }
  }

  function resolveSavedRange(savedRange, timeZone) {
    if (!savedRange) {
      return null;
    }

    if (savedRange.type === 'custom') {
      return savedRange.start && savedRange.end
        ? {
            end: savedRange.end,
            start: savedRange.start,
          }
        : null;
    }

    if (savedRange.type === 'preset') {
      return resolvePresetRange(savedRange.label, timeZone);
    }

    return null;
  }

  function isPageVisible() {
    return document.visibilityState === 'visible';
  }

  function isPageForeground() {
    return isFeatureEnabled(FEATURE_IDS.USAGE_AUTO_REFRESH) && isUsageAutoRefreshPage() && isPageVisible() && document.hasFocus();
  }

  function updateAutoRefreshDebugAttributes() {
    if (!autoRefreshButton) {
      return;
    }

    const nextRefreshSeconds = getRemainingAutoRefreshSeconds();
    const debugTitle = [
      `Sub2API Helper v${SCRIPT_VERSION}`,
      `state: ${autoRefreshState}`,
      `visible: ${document.visibilityState}`,
      `focus: ${document.hasFocus()}`,
      `active: ${activeAutoRefreshValue}`,
      `pausedByBackground: ${autoRefreshPausedByBackground}`,
      `next: ${nextRefreshSeconds === null ? '-' : `${nextRefreshSeconds}s`}`,
      `last: ${lastAutoRefreshEvent}`,
      ...autoRefreshDebugEvents,
    ].join('\n');
    const root = autoRefreshButton.closest('[data-sub2api-auto-refresh-root="true"]');

    autoRefreshButton.dataset.sub2apiAutoRefreshVersion = SCRIPT_VERSION;
    autoRefreshButton.dataset.sub2apiAutoRefreshState = autoRefreshState;
    autoRefreshButton.dataset.sub2apiAutoRefreshLastEvent = lastAutoRefreshEvent;
    autoRefreshButton.title = debugTitle;

    if (root) {
      root.dataset.sub2apiAutoRefreshVersion = SCRIPT_VERSION;
      root.dataset.sub2apiAutoRefreshState = autoRefreshState;
      root.dataset.sub2apiAutoRefreshLastEvent = lastAutoRefreshEvent;
    }
  }

  function recordAutoRefreshEvent(name, detail = '') {
    const eventText = detail ? `${name}: ${detail}` : name;
    const timeText = new Date().toLocaleTimeString();
    lastAutoRefreshEvent = eventText;
    autoRefreshDebugEvents = [`${timeText} ${eventText}`, ...autoRefreshDebugEvents].slice(
      0,
      AUTO_REFRESH_DEBUG_EVENT_LIMIT,
    );
    updateAutoRefreshDebugAttributes();
  }

  function getTrigger() {
    return document.querySelector('.date-picker-trigger');
  }

  function getTriggerValueElement() {
    return getTrigger()?.querySelector('.date-picker-value') || null;
  }

  function getApplyButton() {
    return document.querySelector('.date-picker-apply') || findButtonByText('应用');
  }

  function getDateInputs() {
    return [...document.querySelectorAll('.date-picker-input')];
  }

  function getPresetButtons() {
    return [...document.querySelectorAll('.date-picker-preset')];
  }

  function findButtonByText(text) {
    return [...document.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === text,
    );
  }

  function getRefreshButton() {
    return findButtonByText('刷新');
  }

  function getActionButtonRow() {
    const refreshButton = getRefreshButton();
    return refreshButton?.parentElement || null;
  }

  function getThemeToggleButton() {
    return (
      document.querySelector('button[title="深色模式"], button[title="浅色模式"]') ||
      [...document.querySelectorAll('button')].find((button) => {
        const text = button.textContent.trim();
        return text === '深色模式' || text === '浅色模式';
      })
    );
  }

  function getSidebarToggleButton() {
    return [...document.querySelectorAll('button')].find((button) => {
      const text = button.textContent.trim();
      const title = button.getAttribute('title')?.trim();
      return (
        text === '收起' ||
        text === '展开' ||
        title === '收起' ||
        title === '展开'
      );
    }) || null;
  }

  function getSidebarCollapsedStateFromButton(button) {
    const title = button?.getAttribute('title')?.trim();
    if (title === '展开') {
      return true;
    }
    if (title === '收起') {
      return false;
    }
    if (button?.classList.contains('sidebar-link-collapsed')) {
      return true;
    }
    const text = button?.textContent.trim();
    if (text === '展开') {
      return true;
    }
    if (text === '收起') {
      return false;
    }
    return null;
  }

  function getCurrentSidebarCollapsedState() {
    return getSidebarCollapsedStateFromButton(getSidebarToggleButton());
  }

  function getSavedSidebarCollapsedState() {
    const savedValue = getStorageValue(STORAGE_NAMES.SIDEBAR_COLLAPSED, null);
    return typeof savedValue === 'boolean' ? savedValue : null;
  }

  function setSavedSidebarCollapsedState(value) {
    if (typeof value !== 'boolean') {
      return;
    }
    setStorageValue(STORAGE_NAMES.SIDEBAR_COLLAPSED, value);
  }

  function restoreSavedSidebarState() {
    if (!isFeatureEnabled(FEATURE_IDS.SIDEBAR_STATE)) {
      return false;
    }

    if (isSidebarSelectionActive()) {
      return false;
    }

    if (sidebarRestoreInFlightUntil && Date.now() <= sidebarRestoreInFlightUntil) {
      return false;
    }

    const savedState = getSavedSidebarCollapsedState();
    if (savedState === null) {
      return false;
    }

    const toggleButton = getSidebarToggleButton();
    const currentState = getSidebarCollapsedStateFromButton(toggleButton);
    if (!toggleButton || currentState === null || currentState === savedState) {
      return false;
    }

    sidebarRestoreInFlightUntil = Date.now() + SIDEBAR_STATE_RESTORE_IN_FLIGHT_MS;
    toggleButton.click();
    window.setTimeout(() => {
      sidebarRestoreInFlightUntil = 0;
    }, SIDEBAR_STATE_RESTORE_IN_FLIGHT_MS);
    return true;
  }

  function isSidebarToggleTarget(target) {
    const button = target.closest('button');
    return Boolean(button && getSidebarCollapsedStateFromButton(button) !== null);
  }

  function markSidebarSelectionActive() {
    sidebarSelectionActiveUntil = Date.now() + PAGE_SIZE_SELECTION_WINDOW_MS;
    sidebarSelectionPreviousState = getCurrentSidebarCollapsedState();
  }

  function isSidebarSelectionActive() {
    return Boolean(sidebarSelectionActiveUntil && Date.now() <= sidebarSelectionActiveUntil);
  }

  function saveCurrentSidebarStateSoon() {
    const previousState = sidebarSelectionPreviousState;
    const startedAt = Date.now();
    const saveSettledSidebarState = () => {
      const currentState = getCurrentSidebarCollapsedState();

      if (currentState !== null && (previousState === null || currentState !== previousState)) {
        setSavedSidebarCollapsedState(currentState);
        sidebarSelectionActiveUntil = 0;
        sidebarSelectionPreviousState = null;
        return;
      }

      if (Date.now() - startedAt < SIDEBAR_STATE_SETTLE_TIMEOUT_MS) {
        window.setTimeout(saveSettledSidebarState, SIDEBAR_STATE_SETTLE_INTERVAL_MS);
        return;
      }

      if (currentState !== null) {
        setSavedSidebarCollapsedState(currentState);
      }

      sidebarSelectionActiveUntil = 0;
      sidebarSelectionPreviousState = null;
    };

    window.setTimeout(saveSettledSidebarState, SIDEBAR_STATE_SAVE_DELAY_MS);
  }

  function findSpanByText(text) {
    return [...document.querySelectorAll('span')].find((element) => element.textContent.trim() === text);
  }

  function getLabeledSelectButton(labelText) {
    let current = findSpanByText(labelText)?.parentElement || null;
    while (current) {
      const button = current.querySelector('button.select-trigger');
      if (button) {
        return button;
      }
      current = current.parentElement;
    }
    return null;
  }

  function getPageSizeButton() {
    return getLabeledSelectButton('每页:');
  }

  function normalizePageSizeValue(value) {
    const normalizedValue = String(value || '').trim();
    return PAGE_SIZE_OPTIONS.includes(normalizedValue) ? normalizedValue : null;
  }

  function isSupportedPageSize(value) {
    return Boolean(normalizePageSizeValue(value));
  }

  function getCurrentPageSizeValue() {
    return normalizePageSizeValue(getPageSizeButton()?.textContent.trim());
  }

  function getSavedPageSizeValue() {
    const storageName = getActivePageSizeStorageName();
    if (!storageName) {
      return null;
    }
    const savedValue = getStorageValue(storageName, null);
    return normalizePageSizeValue(savedValue);
  }

  function setSavedPageSizeValue(value) {
    const storageName = getActivePageSizeStorageName();
    const normalizedValue = normalizePageSizeValue(value);
    if (!storageName) {
      return;
    }
    if (!normalizedValue) {
      return;
    }
    setStorageValue(storageName, normalizedValue);
  }

  function isPageSizeButtonTarget(target) {
    const pageSizeButton = getPageSizeButton();
    return Boolean(pageSizeButton && pageSizeButton.contains(target));
  }

  function markPageSizeSelectionActive() {
    pageSizeSelectionActiveUntil = Date.now() + PAGE_SIZE_SELECTION_WINDOW_MS;
    lastObservedPageSizeValue = getCurrentPageSizeValue();
  }

  function isPageSizeSelectionActive() {
    return Date.now() <= pageSizeSelectionActiveUntil;
  }

  function saveCurrentPageSizeSoon(fallbackValue = null) {
    const normalizedFallbackValue = normalizePageSizeValue(fallbackValue);
    window.setTimeout(() => {
      const currentValue = getCurrentPageSizeValue();
      if (currentValue && (!normalizedFallbackValue || currentValue === normalizedFallbackValue)) {
        setSavedPageSizeValue(currentValue);
        return;
      }

      setSavedPageSizeValue(normalizedFallbackValue);
    }, PAGE_SIZE_SAVE_DELAY_MS);
  }

  function handlePageSizeValueChange() {
    if (!isUsagePage() || !isActivePageSizeFeatureEnabled()) {
      return;
    }

    const currentValue = getCurrentPageSizeValue();
    if (!currentValue || currentValue === lastObservedPageSizeValue) {
      return;
    }

    lastObservedPageSizeValue = currentValue;
    if (!isPageSizeSelectionActive()) {
      return;
    }

    setSavedPageSizeValue(currentValue);
    pageSizeSelectionActiveUntil = 0;
  }

  function getGranularityButton() {
    return getLabeledSelectButton('粒度:');
  }

  function normalizeSelectText(value) {
    return String(value || '').trim() || null;
  }

  function getVisibleSelectButtons() {
    return [...document.querySelectorAll('button.select-trigger')].filter((button) => {
      if (!button.isConnected) {
        return false;
      }

      const text = normalizeSelectText(button.textContent);
      return Boolean(text);
    });
  }

  function findSelectButtonByText(text) {
    return getVisibleSelectButtons().find((button) => normalizeSelectText(button.textContent) === text) || null;
  }

  function getAdminAccountsFilterButtonByPosition(filter) {
    const filterIndex = ADMIN_ACCOUNTS_FILTERS.findIndex((item) => item.id === filter.id);
    if (filterIndex < 0) {
      return null;
    }

    return getVisibleSelectButtons()[filterIndex] || null;
  }

  function getAdminAccountsFilterButton(filter) {
    const taggedButton = getVisibleSelectButtons().find(
      (button) => button.dataset.sub2apiAdminAccountsFilterId === filter.id,
    );
    if (taggedButton) {
      return taggedButton;
    }

    const defaultButton = findSelectButtonByText(filter.defaultLabel);
    if (defaultButton) {
      defaultButton.dataset.sub2apiAdminAccountsFilterId = filter.id;
      defaultButton.setAttribute('data-sub2api-admin-accounts-filter-id', filter.id);
    }
    if (defaultButton) {
      return defaultButton;
    }

    const positionedButton = getAdminAccountsFilterButtonByPosition(filter);
    if (positionedButton) {
      positionedButton.dataset.sub2apiAdminAccountsFilterId = filter.id;
      positionedButton.setAttribute('data-sub2api-admin-accounts-filter-id', filter.id);
    }
    return positionedButton || null;
  }

  function getAdminAccountsFilterButtons() {
    if (!isAdminAccountsPage()) {
      return [];
    }

    return ADMIN_ACCOUNTS_FILTERS
      .map((filter) => getAdminAccountsFilterButton(filter))
      .filter(Boolean);
  }

  function getAdminAccountsFilterByButton(button) {
    if (!button || !isAdminAccountsPage()) {
      return null;
    }

    const taggedFilter = getAdminAccountsFilterById(button.dataset.sub2apiAdminAccountsFilterId);
    if (taggedFilter) {
      return taggedFilter;
    }

    const currentText = normalizeSelectText(button.textContent);
    const filter = ADMIN_ACCOUNTS_FILTERS.find((item) => item.defaultLabel === currentText) || null;
    if (filter) {
      button.dataset.sub2apiAdminAccountsFilterId = filter.id;
      button.setAttribute('data-sub2api-admin-accounts-filter-id', filter.id);
    }
    return filter;
  }

  function getAdminAccountsFilterById(filterId) {
    return ADMIN_ACCOUNTS_FILTERS.find((filter) => filter.id === filterId) || null;
  }

  function getCurrentAdminAccountsFilterValue(filter) {
    return normalizeSelectText(getAdminAccountsFilterButton(filter)?.textContent);
  }

  function getSavedAdminAccountsFilterValue(filter) {
    return normalizeSelectText(getStorageValue(filter.storageName, null));
  }

  function setSavedAdminAccountsFilterValue(filter, value) {
    const normalizedValue = normalizeSelectText(value);
    if (!normalizedValue) {
      return;
    }

    setStorageValue(filter.storageName, normalizedValue);
  }

  function isAdminAccountsFilterButtonTarget(target) {
    if (!isAdminAccountsFiltersFeatureEnabled()) {
      return false;
    }

    const button = target.closest('button.select-trigger');
    return Boolean(getAdminAccountsFilterByButton(button));
  }

  function markAdminAccountsFilterSelectionActive(target) {
    const button = target.closest('button.select-trigger');
    const filter = getAdminAccountsFilterByButton(button);
    if (!filter) {
      return;
    }

    adminAccountsFilterSelectionActiveUntil = Date.now() + PAGE_SIZE_SELECTION_WINDOW_MS;
    activeAdminAccountsFilterId = filter.id;
  }

  function isAdminAccountsFilterSelectionActive() {
    return Boolean(
      adminAccountsFilterSelectionActiveUntil &&
      Date.now() <= adminAccountsFilterSelectionActiveUntil
    );
  }

  function clearAdminAccountsFilterSelectionActive() {
    adminAccountsFilterSelectionActiveUntil = 0;
    activeAdminAccountsFilterId = null;
  }

  function getActiveAdminAccountsFilter() {
    if (!isAdminAccountsFilterSelectionActive()) {
      return null;
    }

    return getAdminAccountsFilterById(activeAdminAccountsFilterId);
  }

  function hasDatePickerFingerprint() {
    return Boolean(getTrigger() || getDateInputs().length === 2 || getPresetButtons().length > 0);
  }
  function hasSub2apiInjectedConfigShape(config) {
    return Boolean(
      config &&
        typeof config === 'object' &&
        !Array.isArray(config) &&
        typeof config.site_name === 'string' &&
        typeof config.version === 'string' &&
        typeof config.backend_mode_enabled === 'boolean' &&
        typeof config.table_default_page_size === 'number' &&
        Array.isArray(config.table_page_size_options) &&
        Array.isArray(config.custom_menu_items),
    );
  }

  function hasSub2apiInjectedConfig() {
    return hasSub2apiInjectedConfigShape(globalThis.__APP_CONFIG__) || hasSub2apiInjectedConfigShape(window.__APP_CONFIG__);
  }

  function hasSub2apiInjectedConfigScript() {
    return [...document.querySelectorAll('script')].some((script) => {
      const text = script.textContent || '';
      return (
        text.includes('window.__APP_CONFIG__=') &&
        text.includes('"site_name"') &&
        text.includes('"version"') &&
        text.includes('"backend_mode_enabled"') &&
        text.includes('"table_default_page_size"') &&
        text.includes('"table_page_size_options"') &&
        text.includes('"custom_menu_items"')
      );
    });
  }

  function hasSub2apiShellFingerprint() {
    const sidebar = document.querySelector('aside.sidebar');
    if (!sidebar || !sidebar.querySelector('.sidebar-nav')) {
      return false;
    }

    return [...sidebar.querySelectorAll('a.sidebar-link, button.sidebar-link')].some((item) => {
      const href = item.getAttribute('href') || '';
      return (
        href === '/dashboard' ||
        href === '/usage' ||
        href === '/keys' ||
        href === '/admin/dashboard' ||
        href === '/admin/accounts' ||
        href === '/admin/usage' ||
        href === '/admin/settings'
      );
    });
  }

  function hasSub2apiAppFingerprint() {
    return hasSub2apiInjectedConfig() || hasSub2apiInjectedConfigScript() || hasSub2apiShellFingerprint();
  }

  function hasUsagePageFingerprint() {
    return Boolean(
      isUsagePage() &&
        getRefreshButton() &&
        hasDatePickerFingerprint() &&
        (getPageSizeButton() || getGranularityButton()),
    );
  }

  function hasDashboardPageFingerprint() {
    return Boolean(isDashboardPage() && getRefreshButton() && hasDatePickerFingerprint() && getGranularityButton());
  }

  function hasAdminAccountsPageFingerprint() {
    return Boolean(isAdminAccountsPage() && getAdminAccountsFilterButtons().length > 0);
  }

  function hasSidebarFingerprint() {
    return Boolean(getSidebarToggleButton());
  }

  function shouldEnableSub2apiHelper() {
    return (
      hasSub2apiAppFingerprint() &&
      (
        hasUsagePageFingerprint() ||
        hasDashboardPageFingerprint() ||
        hasAdminAccountsPageFingerprint() ||
        hasSidebarFingerprint()
      )
    );
  }

  function shouldRetrySub2apiHelperActivation() {
    return hasSub2apiAppFingerprint() && (isUsagePage() || isDashboardPage());
  }

  function isFeatureRelevantToCurrentPage(featureId) {
    switch (featureId) {
      case FEATURE_IDS.THEME_SYNC:
        return shouldEnableSub2apiHelper();
      case FEATURE_IDS.SIDEBAR_STATE:
        return hasSidebarFingerprint();
      case FEATURE_IDS.USAGE_DATE_RANGE:
      case FEATURE_IDS.USAGE_GRANULARITY:
      case FEATURE_IDS.USAGE_PAGE_SIZE:
        return isUserUsagePage();
      case FEATURE_IDS.USAGE_AUTO_REFRESH:
        return isUsageAutoRefreshPage();
      case FEATURE_IDS.ADMIN_USAGE_DATE_RANGE:
      case FEATURE_IDS.ADMIN_USAGE_GRANULARITY:
      case FEATURE_IDS.ADMIN_USAGE_PAGE_SIZE:
        return isAdminUsagePage();
      case FEATURE_IDS.ADMIN_ACCOUNTS_FILTERS:
        return isAdminAccountsPage();
      case FEATURE_IDS.DASHBOARD_DATE_RANGE:
      case FEATURE_IDS.DASHBOARD_GRANULARITY:
        return isUserDashboardPage();
      case FEATURE_IDS.ADMIN_DASHBOARD_DATE_RANGE:
      case FEATURE_IDS.ADMIN_DASHBOARD_GRANULARITY:
        return isAdminDashboardPage();
      default:
        return false;
    }
  }

  function getActiveDateRangeFeatureId() {
    if (isAdminUsagePage()) {
      return FEATURE_IDS.ADMIN_USAGE_DATE_RANGE;
    }
    if (isUserUsagePage()) {
      return FEATURE_IDS.USAGE_DATE_RANGE;
    }
    if (isAdminDashboardPage()) {
      return FEATURE_IDS.ADMIN_DASHBOARD_DATE_RANGE;
    }
    if (isUserDashboardPage()) {
      return FEATURE_IDS.DASHBOARD_DATE_RANGE;
    }
    return null;
  }

  function isActiveDateRangeFeatureEnabled() {
    const featureId = getActiveDateRangeFeatureId();
    return Boolean(featureId && isFeatureEnabled(featureId));
  }

  function getActiveGranularityFeatureId() {
    if (isAdminUsagePage()) {
      return FEATURE_IDS.ADMIN_USAGE_GRANULARITY;
    }
    if (isUserUsagePage()) {
      return FEATURE_IDS.USAGE_GRANULARITY;
    }
    if (isAdminDashboardPage()) {
      return FEATURE_IDS.ADMIN_DASHBOARD_GRANULARITY;
    }
    if (isUserDashboardPage()) {
      return FEATURE_IDS.DASHBOARD_GRANULARITY;
    }
    return null;
  }

  function isActiveGranularityFeatureEnabled() {
    const featureId = getActiveGranularityFeatureId();
    return Boolean(featureId && isFeatureEnabled(featureId));
  }

  function getActivePageSizeFeatureId() {
    if (isAdminUsagePage()) {
      return FEATURE_IDS.ADMIN_USAGE_PAGE_SIZE;
    }
    if (isUserUsagePage()) {
      return FEATURE_IDS.USAGE_PAGE_SIZE;
    }
    return null;
  }

  function isActivePageSizeFeatureEnabled() {
    const featureId = getActivePageSizeFeatureId();
    return Boolean(featureId && isFeatureEnabled(featureId));
  }

  function isAdminAccountsFiltersFeatureEnabled() {
    return isAdminAccountsPage() && isFeatureEnabled(FEATURE_IDS.ADMIN_ACCOUNTS_FILTERS);
  }

  function getFeatureState(feature) {
    const globalEnabled = getGlobalFeatureEnabled(feature.id);
    const pageEnabled = getCurrentPageFeatureEnabled(feature.id);
    return {
      ...feature,
      enabled: globalEnabled && pageEnabled,
      globalEnabled,
      pageEnabled,
      relevant: isFeatureRelevantToCurrentPage(feature.id),
    };
  }

  function getSettingsState() {
    const isSub2apiPage = shouldEnableSub2apiHelper();
    const features = FEATURE_SETTINGS.map(getFeatureState);
    const enabledRelevantFeatureCount = features.filter((feature) => feature.relevant && feature.enabled).length;
    const relevantFeatureCount = features.filter((feature) => feature.relevant).length;
    return {
      effectiveEnabled: Boolean(isSub2apiPage && enabledRelevantFeatureCount),
      enabledRelevantFeatureCount,
      features,
      isSub2apiPage,
      relevantFeatureCount,
      themeMode: getSavedThemeMode(),
    };
  }

  function getSettingsStatusText(state) {
    if (!state.isSub2apiPage) {
      return '当前页面不匹配';
    }
    if (!state.effectiveEnabled) {
      return '已关闭';
    }
    return `生效中 (${state.enabledRelevantFeatureCount}/${state.relevantFeatureCount} 项开启)`;
  }

  function setStyles(element, styles) {
    Object.assign(element.style, styles);
  }

  function createSettingsText(text, styles = {}) {
    const element = document.createElement('div');
    element.textContent = text;
    setStyles(element, styles);
    return element;
  }

  function removeAutoRefreshControl() {
    closeAutoRefreshMenu();
    const root = document.querySelector('[data-sub2api-auto-refresh-root="true"]');
    root?.remove();
    autoRefreshButton = null;
  }

  function removeSettingsLauncherButton() {
    settingsLauncherButton?.remove();
    settingsLauncherButton = null;
  }

  function installSettingsLauncherButton() {
    if (!shouldEnableSub2apiHelper()) {
      removeSettingsLauncherButton();
      return false;
    }

    if (settingsLauncherButton && !settingsLauncherButton.isConnected) {
      settingsLauncherButton = null;
    }
    if (settingsLauncherButton) {
      settingsLauncherButton.dataset.sub2apiSettingsLauncherVersion = SCRIPT_VERSION;
      return true;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '设置';
    button.dataset.sub2apiSettingsLauncher = 'true';
    button.dataset.sub2apiSettingsLauncherVersion = SCRIPT_VERSION;
    button.setAttribute('aria-label', '打开 Sub2API Helper 设置');
    setStyles(button, {
      alignItems: 'center',
      background: '#0f766e',
      border: '1px solid rgba(255, 255, 255, 0.45)',
      borderRadius: '8px',
      bottom: '18px',
      boxShadow: '0 10px 28px rgba(15, 23, 42, 0.18)',
      color: '#ffffff',
      cursor: 'pointer',
      display: 'inline-flex',
      font: '700 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      height: '34px',
      justifyContent: 'center',
      padding: '0 12px',
      position: 'fixed',
      right: '18px',
      zIndex: '2147483646',
    });
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openSettingsPanel();
    });

    document.body.appendChild(button);
    settingsLauncherButton = button;
    return true;
  }

  function cleanupDisabledFeatures() {
    if (!isFeatureEnabled(FEATURE_IDS.USAGE_AUTO_REFRESH) || !isUsageAutoRefreshPage()) {
      stopAutoRefresh();
      removeAutoRefreshControl();
    }
  }

  function applySettingsStateChange() {
    cleanupDisabledFeatures();

    if (shouldEnableSub2apiHelper()) {
      if (helperActivated) {
        applyPageEnhancements();
      } else {
        tryActivateSub2apiHelper();
      }
    } else {
      removeSettingsLauncherButton();
    }
    refreshSettingsPanel();
  }

  function createFeatureScopeSwitch({ checked, featureId, label, scope }) {
    const wrap = document.createElement('label');
    setStyles(wrap, {
      alignItems: 'center',
      color: '#334155',
      display: 'inline-flex',
      fontSize: '12px',
      fontWeight: '700',
      gap: '6px',
      whiteSpace: 'nowrap',
    });

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.setAttribute('role', 'switch');
    if (scope === 'global') {
      input.setAttribute('data-sub2api-feature-global-switch', featureId);
    } else {
      input.setAttribute('data-sub2api-feature-page-switch', featureId);
    }
    input.addEventListener('change', () => {
      if (scope === 'global') {
        setGlobalFeatureEnabled(featureId, Boolean(input.checked));
      } else {
        setCurrentPageFeatureEnabled(featureId, Boolean(input.checked));
      }
      applySettingsStateChange();
    });

    const labelText = document.createElement('span');
    labelText.textContent = label;
    wrap.appendChild(labelText);
    wrap.appendChild(input);
    return wrap;
  }

  function createFeatureSettingsRow(feature) {
    const row = document.createElement('div');
    row.setAttribute('data-sub2api-feature-row', feature.id);
    setStyles(row, {
      alignItems: 'center',
      border: '1px solid rgba(148, 163, 184, 0.35)',
      borderRadius: '8px',
      display: 'flex',
      flexWrap: 'wrap',
      gap: '12px',
      justifyContent: 'space-between',
      padding: '12px',
    });

    const textWrap = document.createElement('span');
    setStyles(textWrap, {
      display: 'grid',
      flex: '1 1 240px',
      gap: '4px',
    });

    const title = document.createElement('span');
    title.textContent = feature.label;
    setStyles(title, {
      color: '#0f172a',
      fontSize: '14px',
      fontWeight: '700',
    });

    const hint = document.createElement('span');
    hint.textContent = feature.description;
    setStyles(hint, {
      color: '#64748b',
      fontSize: '12px',
      lineHeight: '1.4',
    });

    const controls = document.createElement('span');
    setStyles(controls, {
      alignItems: 'center',
      display: 'inline-flex',
      flexShrink: '0',
      gap: '10px',
    });
    controls.appendChild(
      createFeatureScopeSwitch({
        checked: feature.globalEnabled,
        featureId: feature.id,
        label: '全局',
        scope: 'global',
      }),
    );
    controls.appendChild(
      createFeatureScopeSwitch({
        checked: feature.pageEnabled,
        featureId: feature.id,
        label: '当前页',
        scope: 'page',
      }),
    );

    textWrap.appendChild(title);
    textWrap.appendChild(hint);
    row.appendChild(textWrap);
    row.appendChild(controls);
    return row;
  }

  function createThemeModeOption({ checked, option }) {
    const label = document.createElement('label');
    setStyles(label, {
      alignItems: 'center',
      border: `1px solid ${checked ? '#0f766e' : 'rgba(148, 163, 184, 0.35)'}`,
      borderRadius: '8px',
      color: checked ? '#0f766e' : '#334155',
      cursor: 'pointer',
      display: 'grid',
      gap: '4px',
      padding: '10px',
    });

    const title = document.createElement('span');
    setStyles(title, {
      alignItems: 'center',
      display: 'inline-flex',
      fontSize: '13px',
      fontWeight: '800',
      gap: '8px',
    });

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'sub2api-theme-mode';
    input.value = option.value;
    input.checked = checked;
    input.setAttribute('data-sub2api-theme-mode-option', option.value);
    input.addEventListener('change', () => {
      if (!input.checked) {
        return;
      }
      setSavedThemeMode(option.value);
      applySettingsStateChange();
    });

    const hint = document.createElement('span');
    hint.textContent = option.description;
    setStyles(hint, {
      color: '#64748b',
      fontSize: '12px',
      lineHeight: '1.35',
    });

    const labelText = document.createElement('span');
    labelText.textContent = option.label;

    title.appendChild(input);
    title.appendChild(labelText);
    label.appendChild(title);
    label.appendChild(hint);
    return label;
  }

  function createThemeModeSettingsRow(themeMode) {
    const row = document.createElement('div');
    row.setAttribute('data-sub2api-theme-mode-row', 'true');
    setStyles(row, {
      border: '1px solid rgba(148, 163, 184, 0.35)',
      borderRadius: '8px',
      display: 'grid',
      gap: '10px',
      padding: '12px',
    });

    const textWrap = document.createElement('div');
    setStyles(textWrap, {
      display: 'grid',
      gap: '4px',
    });

    const title = document.createElement('span');
    title.textContent = '主题模式';
    setStyles(title, {
      color: '#0f172a',
      fontSize: '14px',
      fontWeight: '800',
    });

    const hint = document.createElement('span');
    hint.textContent = '选择 Sub2API 使用深色、浅色，或跟随系统。';
    setStyles(hint, {
      color: '#64748b',
      fontSize: '12px',
      lineHeight: '1.4',
    });

    const controls = document.createElement('div');
    setStyles(controls, {
      display: 'grid',
      gap: '8px',
      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    });

    for (const option of THEME_MODE_OPTIONS) {
      controls.appendChild(
        createThemeModeOption({
          checked: themeMode === option.value,
          option,
        }),
      );
    }

    textWrap.appendChild(title);
    textWrap.appendChild(hint);
    row.appendChild(textWrap);
    row.appendChild(controls);
    return row;
  }

  function getSettingsGroupMeta(groupId) {
    switch (groupId) {
      case SETTINGS_GROUPS.USAGE:
        return {
          description: '使用记录 tab (/usage)',
          title: '使用记录',
        };
      case SETTINGS_GROUPS.ADMIN_USAGE:
        return {
          description: '管理端使用记录 tab (/admin/usage)',
          title: '管理端使用记录',
        };
      case SETTINGS_GROUPS.ADMIN_ACCOUNTS:
        return {
          description: '账号管理 tab (/admin/accounts)',
          title: '账号管理',
        };
      case SETTINGS_GROUPS.DASHBOARD:
        return {
          description: '仪表盘 tab (/dashboard)',
          title: '仪表盘',
        };
      case SETTINGS_GROUPS.ADMIN_DASHBOARD:
        return {
          description: '管理端仪表盘 tab (/admin/dashboard)',
          title: '管理端仪表盘',
        };
      default:
        return null;
    }
  }

  function createFeatureSettingsGroup(groupId, features) {
    const groupMeta = getSettingsGroupMeta(groupId);
    const group = document.createElement('section');
    group.dataset.sub2apiSettingsGroup = groupId;
    group.setAttribute('data-sub2api-settings-group', groupId);
    setStyles(group, {
      border: '1px solid rgba(148, 163, 184, 0.35)',
      borderRadius: '8px',
      display: 'grid',
      gap: '10px',
      padding: '12px',
    });

    if (!groupMeta) {
      for (const feature of features) {
        group.appendChild(createFeatureSettingsRow(feature));
      }
      return group;
    }

    const header = document.createElement('div');
    setStyles(header, {
      display: 'grid',
      gap: '2px',
    });

    const title = document.createElement('span');
    title.textContent = groupMeta.title;
    setStyles(title, {
      color: '#0f172a',
      fontSize: '14px',
      fontWeight: '800',
    });

    const hint = document.createElement('span');
    hint.textContent = groupMeta.description;
    setStyles(hint, {
      color: '#64748b',
      fontSize: '12px',
      lineHeight: '1.4',
    });

    const items = document.createElement('div');
    setStyles(items, {
      display: 'grid',
      gap: '10px',
    });

    for (const feature of features) {
      items.appendChild(createFeatureSettingsRow(feature));
    }

    header.appendChild(title);
    header.appendChild(hint);
    group.appendChild(header);
    group.appendChild(items);
    return group;
  }

  function refreshSettingsPanel() {
    if (!settingsPanelRoot?.isConnected) {
      return;
    }

    const state = getSettingsState();
    settingsPanelRoot.textContent = '';
    settingsPanelRoot.dataset.sub2apiSettingsIsSub2api = String(state.isSub2apiPage);
    settingsPanelRoot.dataset.sub2apiSettingsEffectiveEnabled = String(state.effectiveEnabled);
    settingsPanelRoot.dataset.sub2apiSettingsEnabledFeatureCount = String(state.enabledRelevantFeatureCount);

    const panel = document.createElement('section');
    setStyles(panel, {
      background: '#ffffff',
      border: '1px solid rgba(148, 163, 184, 0.35)',
      borderRadius: '8px',
      boxShadow: '0 24px 80px rgba(15, 23, 42, 0.22)',
      boxSizing: 'border-box',
      color: '#0f172a',
      display: 'grid',
      font: '14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      gap: '14px',
      maxWidth: '560px',
      padding: '18px',
      width: 'min(560px, calc(100vw - 32px))',
    });

    const header = document.createElement('div');
    setStyles(header, {
      alignItems: 'start',
      display: 'flex',
      gap: '12px',
      justifyContent: 'space-between',
    });

    const titleWrap = document.createElement('div');
    titleWrap.appendChild(
      createSettingsText('Sub2API Helper 设置', {
        color: '#0f172a',
        fontSize: '16px',
        fontWeight: '800',
      }),
    );
    titleWrap.appendChild(
      createSettingsText(`当前地址: ${getCurrentOrigin()}${location.pathname}`, {
        color: '#64748b',
        fontSize: '12px',
        marginTop: '2px',
        overflowWrap: 'anywhere',
      }),
    );
    titleWrap.appendChild(
      createSettingsText(`脚本版本: ${SCRIPT_VERSION}`, {
        color: '#64748b',
        fontSize: '12px',
        marginTop: '2px',
      }),
    );

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = '×';
    closeButton.dataset.sub2apiSettingsClose = 'true';
    closeButton.setAttribute('aria-label', '关闭设置');
    setStyles(closeButton, {
      alignItems: 'center',
      background: '#f8fafc',
      border: '1px solid rgba(148, 163, 184, 0.45)',
      borderRadius: '8px',
      color: '#334155',
      cursor: 'pointer',
      display: 'inline-flex',
      fontSize: '18px',
      fontWeight: '700',
      height: '32px',
      justifyContent: 'center',
      lineHeight: '1',
      padding: '0',
      width: '32px',
    });
    closeButton.addEventListener('click', closeSettingsPanel);

    header.appendChild(titleWrap);
    header.appendChild(closeButton);

    const status = document.createElement('div');
    setStyles(status, {
      background: state.effectiveEnabled ? '#ecfdf5' : '#f8fafc',
      border: `1px solid ${state.effectiveEnabled ? '#bbf7d0' : '#e2e8f0'}`,
      borderRadius: '8px',
      display: 'grid',
      gap: '4px',
      padding: '12px',
    });
    status.appendChild(
      createSettingsText(`当前页面: ${state.isSub2apiPage ? 'Sub2API 页面' : '非 Sub2API 页面'}`, {
        color: '#0f172a',
        fontWeight: '700',
      }),
    );
    status.appendChild(
      createSettingsText(`修改功能: ${getSettingsStatusText(state)}`, {
        color: state.effectiveEnabled ? '#047857' : '#64748b',
        fontWeight: '700',
      }),
    );

    const featureGroups = document.createElement('div');
    setStyles(featureGroups, {
      display: 'grid',
      gap: '10px',
      maxHeight: 'min(52vh, 520px)',
      overflow: 'auto',
    });
    const featuresByGroup = new Map();
    const standaloneFeatures = [];
    for (const feature of state.features) {
      if (feature.groupId) {
        const groupedFeatures = featuresByGroup.get(feature.groupId) || [];
        groupedFeatures.push(feature);
        featuresByGroup.set(feature.groupId, groupedFeatures);
      } else {
        standaloneFeatures.push(feature);
      }
    }

    for (const [groupId, features] of featuresByGroup.entries()) {
      featureGroups.appendChild(createFeatureSettingsGroup(groupId, features));
    }
    if (state.isSub2apiPage) {
      featureGroups.appendChild(createThemeModeSettingsRow(state.themeMode));
    }
    for (const feature of standaloneFeatures) {
      featureGroups.appendChild(createFeatureSettingsRow(feature));
    }

    panel.appendChild(header);
    panel.appendChild(status);
    panel.appendChild(featureGroups);
    settingsPanelRoot.appendChild(panel);
  }

  function closeSettingsPanel() {
    settingsPanelRoot?.remove();
    settingsPanelRoot = null;
  }

  function openSettingsPanel() {
    if (settingsPanelRoot?.isConnected) {
      refreshSettingsPanel();
      return;
    }

    settingsPanelRoot = document.createElement('div');
    settingsPanelRoot.dataset.sub2apiSettingsRoot = 'true';
    setStyles(settingsPanelRoot, {
      alignItems: 'center',
      background: 'rgba(15, 23, 42, 0.36)',
      boxSizing: 'border-box',
      display: 'flex',
      inset: '0',
      justifyContent: 'center',
      padding: '16px',
      position: 'fixed',
      zIndex: '2147483647',
    });
    settingsPanelRoot.addEventListener('click', (event) => {
      if (event.target === settingsPanelRoot) {
        closeSettingsPanel();
      }
    });

    document.body.appendChild(settingsPanelRoot);
    refreshSettingsPanel();
  }

  function registerSettingsMenu() {
    if (typeof GM_registerMenuCommand !== 'function') {
      return;
    }

    try {
      GM_registerMenuCommand(SETTINGS_MENU_LABEL, openSettingsPanel);
    } catch (error) {
      // Some userscript managers expose GM_registerMenuCommand only in specific contexts.
    }
  }
  function getActiveGranularityStorageName() {
    if (isAdminUsagePage()) {
      return STORAGE_NAMES.ADMIN_USAGE_GRANULARITY;
    }
    if (isUserUsagePage()) {
      return STORAGE_NAMES.USAGE_GRANULARITY;
    }
    if (isAdminDashboardPage()) {
      return STORAGE_NAMES.ADMIN_DASHBOARD_GRANULARITY;
    }
    if (isUserDashboardPage()) {
      return STORAGE_NAMES.DASHBOARD_GRANULARITY;
    }
    return null;
  }

  function normalizeGranularityValue(value) {
    const normalizedValue = String(value || '').trim();
    return normalizedValue || null;
  }

  function getCurrentGranularityValue() {
    return normalizeGranularityValue(getGranularityButton()?.textContent.trim());
  }

  function getSavedGranularityValue() {
    const storageName = getActiveGranularityStorageName();
    if (!storageName) {
      return null;
    }
    const savedValue = getStorageValue(storageName, null);
    return normalizeGranularityValue(savedValue);
  }

  function setSavedGranularityValue(value) {
    const storageName = getActiveGranularityStorageName();
    const normalizedValue = normalizeGranularityValue(value);
    if (!storageName) {
      return;
    }
    if (!normalizedValue) {
      return;
    }
    setStorageValue(storageName, normalizedValue);
  }

  function isGranularityButtonTarget(target) {
    const granularityButton = getGranularityButton();
    return Boolean(granularityButton && granularityButton.contains(target));
  }

  function markGranularitySelectionActive() {
    granularitySelectionActiveUntil = Date.now() + PAGE_SIZE_SELECTION_WINDOW_MS;
    lastObservedGranularityValue = getCurrentGranularityValue();
  }

  function isGranularitySelectionActive() {
    return Date.now() <= granularitySelectionActiveUntil;
  }

  function saveCurrentGranularitySoon(fallbackValue = null) {
    const normalizedFallbackValue = normalizeGranularityValue(fallbackValue);
    window.setTimeout(() => {
      const currentValue = getCurrentGranularityValue();
      if (currentValue && (!normalizedFallbackValue || currentValue === normalizedFallbackValue)) {
        setSavedGranularityValue(currentValue);
        return;
      }

      setSavedGranularityValue(normalizedFallbackValue);
    }, PAGE_SIZE_SAVE_DELAY_MS);
  }

  function handleGranularityValueChange() {
    if (!getActiveGranularityStorageName() || !isActiveGranularityFeatureEnabled()) {
      return;
    }

    const currentValue = getCurrentGranularityValue();
    if (!currentValue || currentValue === lastObservedGranularityValue) {
      return;
    }

    lastObservedGranularityValue = currentValue;
    if (!isGranularitySelectionActive()) {
      return;
    }

    setSavedGranularityValue(currentValue);
    granularitySelectionActiveUntil = 0;
  }

  function getAutoRefreshOption(value) {
    return AUTO_REFRESH_OPTIONS.find((option) => option.value === String(value)) || AUTO_REFRESH_OPTIONS[0];
  }

  function getBrowserThemeMediaQuery() {
    if (!browserThemeMediaQuery) {
      browserThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    }
    return browserThemeMediaQuery;
  }

  function getPreferredPageTheme() {
    return getBrowserThemeMediaQuery().matches ? 'dark' : 'light';
  }

  function getTargetPageTheme() {
    const themeMode = getSavedThemeMode();
    if (themeMode === THEME_MODE_VALUES.DARK || themeMode === THEME_MODE_VALUES.LIGHT) {
      return themeMode;
    }
    return getPreferredPageTheme();
  }

  function getCurrentPageTheme() {
    if (document.documentElement.classList.contains('dark')) {
      return 'dark';
    }

    const toggleButton = getThemeToggleButton();
    if (toggleButton) {
      const text = toggleButton.textContent.trim();
      const title = toggleButton.getAttribute('title')?.trim();
      if (text === '浅色模式' || title === '浅色模式') {
        return 'dark';
      }
      if (text === '深色模式' || title === '深色模式') {
        return 'light';
      }
    }

    return localStorage.getItem(PAGE_THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  }

  function getSavedAutoRefreshValue() {
    const savedValue = getStorageValue(STORAGE_NAMES.AUTO_REFRESH, 'off');
    return getAutoRefreshOption(savedValue).value;
  }

  function setSavedAutoRefreshValue(value) {
    setStorageValue(STORAGE_NAMES.AUTO_REFRESH, getAutoRefreshOption(value).value);
  }

  function isPickerOpen() {
    return Boolean(getApplyButton() && getDateInputs().length === 2);
  }

  function markDateRangeSelectionActive() {
    dateRangeSelectionActiveUntil = Date.now() + DATE_RANGE_SELECTION_WINDOW_MS;
  }

  function clearDateRangeSelectionActive() {
    dateRangeSelectionActiveUntil = 0;
  }

  function isDateRangeSelectionActive() {
    return Boolean(dateRangeSelectionActiveUntil && Date.now() <= dateRangeSelectionActiveUntil);
  }

  function formatCustomLabel(dateText) {
    const [year, month, day] = dateText.split('-').map(Number);
    if (!year || !month || !day) {
      return '';
    }
    return `${month}月${day}日`;
  }

  function buildCustomDisplayText(start, end) {
    return `${formatCustomLabel(start)} - ${formatCustomLabel(end)}`;
  }

  function getActivePresetButton() {
    return getPresetButtons().find((button) =>
      button.classList.contains('date-picker-preset-active'),
    );
  }

  function readDraftRange() {
    const activePreset = getActivePresetButton();
    if (activePreset) {
      return {
        type: 'preset',
        label: activePreset.textContent.trim(),
      };
    }

    const inputs = getDateInputs();
    if (inputs.length !== 2) {
      return null;
    }

    const [startInput, endInput] = inputs;
    if (!startInput.value || !endInput.value) {
      return null;
    }

    return {
      type: 'custom',
      start: startInput.value,
      end: endInput.value,
      displayText: buildCustomDisplayText(startInput.value, endInput.value),
    };
  }

  function setNativeInputValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    );

    descriptor.set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function openPicker(timeoutMs = RANGE_RESTORE_SETTLE_TIMEOUT_MS) {
    if (isPickerOpen()) {
      return true;
    }

    const trigger = await waitFor(getTrigger, timeoutMs);
    if (!trigger) {
      return false;
    }

    return Boolean(await waitFor(() => {
      if (isPickerOpen()) {
        return true;
      }

      const currentTrigger = getTrigger();
      if (!currentTrigger) {
        return null;
      }

      currentTrigger.click();
      return isPickerOpen() ? true : null;
    }, timeoutMs));
  }

  function currentTriggerText() {
    return getTriggerValueElement()?.textContent.trim() || getTrigger()?.textContent.trim() || '';
  }

  function isAlreadyApplied(savedRange) {
    const triggerText = currentTriggerText();
    if (!triggerText) {
      return false;
    }

    if (savedRange.type === 'preset') {
      return triggerText === savedRange.label;
    }

    if (savedRange.type === 'custom') {
      return triggerText === getExpectedRangeTriggerText(savedRange);
    }

    return false;
  }

  function getExpectedRangeTriggerText(savedRange) {
    if (savedRange.type === 'preset') {
      return savedRange.label;
    }

    if (savedRange.type === 'custom') {
      return savedRange.displayText || buildCustomDisplayText(savedRange.start, savedRange.end);
    }

    return '';
  }

  async function waitForRestoredTriggerText(savedRange) {
    const expectedText = getExpectedRangeTriggerText(savedRange);
    if (!expectedText) {
      return currentTriggerText();
    }

    const settledText = await waitFor(
      () => currentTriggerText() === expectedText ? expectedText : null,
      RANGE_RESTORE_SETTLE_TIMEOUT_MS,
    );
    return settledText || currentTriggerText();
  }

  async function restoreSavedRange() {
    if (!isActiveDateRangeFeatureEnabled()) {
      return false;
    }

    if (rangeRestoreInFlight) {
      return false;
    }

    if (isDateRangeSelectionActive()) {
      return false;
    }

    const savedRange = getSavedRangeForCurrentPage();
    if (!savedRange) {
      return false;
    }

    rangeRestoreInFlight = true;
    const restoreToken = ++rangeRestoreToken;
    const restorePathname = location.pathname;
    const trigger = await waitFor(getTrigger, RANGE_RESTORE_SETTLE_TIMEOUT_MS);
    if (!trigger) {
      if (restoreToken === rangeRestoreToken) {
        rangeRestoreInFlight = false;
      }
      return false;
    }
    if (restoreToken !== rangeRestoreToken || location.pathname !== restorePathname) {
      if (restoreToken === rangeRestoreToken) {
        rangeRestoreInFlight = false;
      }
      return false;
    }

    if (isAlreadyApplied(savedRange)) {
      if (restoreToken === rangeRestoreToken) {
        rangeRestoreInFlight = false;
      }
      return false;
    }

    try {
      for (let attempt = 0; attempt < RANGE_RESTORE_ATTEMPT_LIMIT; attempt += 1) {
        if (isDateRangeSelectionActive()) {
          return false;
        }

        const opened = await openPicker();
        if (!opened || restoreToken !== rangeRestoreToken || location.pathname !== restorePathname) {
          return false;
        }

        if (savedRange.type === 'preset') {
          const presetButton = await waitFor(() =>
            getPresetButtons().find(
              (button) => button.textContent.trim() === savedRange.label,
            ),
          );
          if (!presetButton || restoreToken !== rangeRestoreToken || location.pathname !== restorePathname) {
            return false;
          }
          presetButton.click();
        } else if (savedRange.type === 'custom') {
          const inputs = await waitFor(() => {
            const elements = getDateInputs();
            return elements.length === 2 ? elements : null;
          });

          if (!inputs || restoreToken !== rangeRestoreToken || location.pathname !== restorePathname) {
            return false;
          }

          setNativeInputValue(inputs[0], savedRange.start);
          setNativeInputValue(inputs[1], savedRange.end);
        } else {
          return false;
        }

        const applyButton = await waitFor(getApplyButton);
        if (!applyButton || restoreToken !== rangeRestoreToken || location.pathname !== restorePathname) {
          return false;
        }
        applyButton.click();
        await waitForRestoredTriggerText(savedRange);
        if (isAlreadyApplied(savedRange)) {
          return true;
        }
      }

      return false;
    } finally {
      if (restoreToken === rangeRestoreToken) {
        rangeRestoreInFlight = false;
      }
    }
  }

  function isAdminDashboardDateRangeRequestPath(pathname) {
    return ADMIN_DASHBOARD_DATE_RANGE_API_PATHS.includes(pathname);
  }

  function isAdminUsageDateRangeRequestPath(pathname) {
    return (
      pathname.startsWith('/api/v1/usage') ||
      pathname.startsWith('/api/v1/admin/usage') ||
      isAdminDashboardDateRangeRequestPath(pathname)
    );
  }

  function isDateRangeRequestPath(pathname) {
    if (isAdminUsagePage()) {
      return isAdminUsageDateRangeRequestPath(pathname);
    }

    return (
      pathname.startsWith('/api/v1/usage') ||
      (isDashboardPage() && isAdminDashboardDateRangeRequestPath(pathname))
    );
  }

  function rewriteUsageRequestUrl(urlInput) {
    if (
      !isActiveDateRangeFeatureEnabled() ||
      (!isUsagePage() && !isDashboardPage()) ||
      !urlInput
    ) {
      return urlInput;
    }

    const savedRange = getSavedRangeForCurrentPage();
    if (!savedRange) {
      return urlInput;
    }

    const requestUrl = new URL(String(urlInput), location.href);
    if (requestUrl.origin !== getCurrentOrigin() || !isDateRangeRequestPath(requestUrl.pathname)) {
      return urlInput;
    }

    const timeZone =
      requestUrl.searchParams.get('timezone') ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      'UTC';
    const resolvedRange = resolveSavedRange(savedRange, timeZone);
    if (!resolvedRange) {
      return urlInput;
    }

    requestUrl.searchParams.set('start_date', resolvedRange.start);
    requestUrl.searchParams.set('end_date', resolvedRange.end);
    return requestUrl.toString();
  }

  function rewriteFetchInput(input) {
    if (typeof input === 'string' || input instanceof URL) {
      return rewriteUsageRequestUrl(String(input));
    }

    if (input && typeof input.url === 'string') {
      const rewrittenUrl = rewriteUsageRequestUrl(input.url);
      if (rewrittenUrl === input.url || typeof Request !== 'function') {
        return input;
      }
      return new Request(rewrittenUrl, input);
    }

    return input;
  }

  function installUsageRequestRewriter() {
    if (usageRequestRewriteInstalled) {
      return;
    }

    if (typeof window.fetch === 'function') {
      const originalFetch = window.fetch.bind(window);
      const patchedFetch = function patchedFetch(input, init) {
        return originalFetch(rewriteFetchInput(input), init);
      };
      window.fetch = patchedFetch;
      globalThis.fetch = patchedFetch;
    }

    if (typeof XMLHttpRequest !== 'undefined' && XMLHttpRequest.prototype?.open) {
      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
        return originalOpen.call(this, method, rewriteUsageRequestUrl(url), ...rest);
      };
    }

    usageRequestRewriteInstalled = true;
  }

  async function restoreSavedPageSize() {
    if (!isActivePageSizeFeatureEnabled()) {
      return;
    }

    const savedPageSize = getSavedPageSizeValue();
    if (!savedPageSize) {
      return;
    }

    const pageSizeButton = await waitFor(getPageSizeButton);
    if (!pageSizeButton || getCurrentPageSizeValue() === savedPageSize) {
      return;
    }

    pageSizeButton.click();
    const targetOption = await waitFor(() =>
      [...document.querySelectorAll('[role="option"]')].find(
        (option) => option.textContent.trim() === savedPageSize,
      ),
    );

    if (targetOption) {
      targetOption.click();
      setSavedPageSizeValue(savedPageSize);
    }
  }

  async function restoreSavedGranularity() {
    if (!isActiveGranularityFeatureEnabled()) {
      return;
    }

    const savedGranularity = getSavedGranularityValue();
    if (!savedGranularity) {
      return;
    }

    const granularityButton = await waitFor(getGranularityButton);
    if (!granularityButton || getCurrentGranularityValue() === savedGranularity) {
      return;
    }

    granularityButton.click();
    const targetOption = await waitFor(() =>
      [...document.querySelectorAll('[role="option"]')].find(
        (option) => option.textContent.trim() === savedGranularity,
      ),
    );

    if (targetOption) {
      targetOption.click();
      setSavedGranularityValue(savedGranularity);
    }
  }

  async function restoreAdminAccountsFilter(filter) {
    const savedValue = getSavedAdminAccountsFilterValue(filter);
    if (!savedValue) {
      return false;
    }

    const filterButton = await waitFor(() => getAdminAccountsFilterButton(filter), RANGE_RESTORE_SETTLE_TIMEOUT_MS);
    if (!filterButton) {
      return false;
    }

    if (getCurrentAdminAccountsFilterValue(filter) === savedValue) {
      return false;
    }

    filterButton.click();
    const targetOption = await waitFor(() =>
      [...document.querySelectorAll('[role="option"]')].find(
        (option) => option.textContent.trim() === savedValue,
      ),
      RANGE_RESTORE_SETTLE_TIMEOUT_MS,
    );
    if (targetOption) {
      targetOption.click();
      setSavedAdminAccountsFilterValue(filter, savedValue);
      return true;
    }

    if (filter.fallbackOnMissing && savedValue !== filter.defaultLabel) {
      const fallbackOption = [...document.querySelectorAll('[role="option"]')].find(
        (option) => option.textContent.trim() === filter.defaultLabel,
      );
      if (fallbackOption) {
        fallbackOption.click();
        setSavedAdminAccountsFilterValue(filter, filter.defaultLabel);
        return true;
      }
    }

    filterButton.click();
    return false;
  }

  async function restoreSavedAdminAccountsFilters() {
    if (!isAdminAccountsFiltersFeatureEnabled()) {
      return;
    }

    if (adminAccountsFilterRestoreInFlight || isAdminAccountsFilterSelectionActive()) {
      return;
    }

    adminAccountsFilterRestoreInFlight = true;
    try {
      for (const filter of ADMIN_ACCOUNTS_FILTERS) {
        if (isAdminAccountsFilterSelectionActive()) {
          return;
        }
        await restoreAdminAccountsFilter(filter);
      }
    } finally {
      adminAccountsFilterRestoreInFlight = false;
    }
  }

  async function syncPageThemeWithBrowserTheme() {
    if (themeSyncInFlight) {
      return;
    }

    themeSyncInFlight = true;
    try {
      const targetTheme = getTargetPageTheme();
      if (getCurrentPageTheme() === targetTheme) {
        return;
      }

      const deadline = Date.now() + THEME_TOGGLE_WAIT_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (getCurrentPageTheme() === targetTheme) {
          return;
        }

        const toggleButton = getThemeToggleButton();
        if (toggleButton) {
          toggleButton.click();
        }

        await sleep(THEME_SYNC_RETRY_DELAY_MS);
      }
    } finally {
      themeSyncInFlight = false;
    }
  }
  function closeAutoRefreshMenu() {
    autoRefreshMenu?.remove();
    autoRefreshMenu = null;
    autoRefreshButton?.setAttribute('aria-expanded', 'false');
  }

  function getRemainingAutoRefreshSeconds() {
    if (!nextAutoRefreshAt) {
      return null;
    }
    return Math.max(0, Math.ceil((nextAutoRefreshAt - Date.now()) / 1000));
  }

  function ensureAutoRefreshButtonContent() {
    if (!autoRefreshButton) {
      return {};
    }

    let label = autoRefreshButton.querySelector('[data-sub2api-auto-refresh-label="true"]');
    if (!label) {
      autoRefreshButton.textContent = '';
      label = document.createElement('span');
      label.dataset.sub2apiAutoRefreshLabel = 'true';
      autoRefreshButton.appendChild(label);
    }

    let badge = autoRefreshButton.querySelector('[data-sub2api-auto-refresh-badge="true"]');
    if (!badge) {
      badge = document.createElement('span');
      badge.dataset.sub2apiAutoRefreshBadge = 'true';
      badge.style.display = 'none';
      badge.style.alignItems = 'center';
      badge.style.justifyContent = 'center';
      badge.style.minWidth = '44px';
      badge.style.height = '28px';
      badge.style.padding = '0 10px';
      badge.style.borderRadius = '999px';
      badge.style.backgroundColor = '#dcfce7';
      badge.style.color = '#166534';
      badge.style.fontWeight = '700';
      badge.style.lineHeight = '1';
      badge.style.whiteSpace = 'nowrap';
      autoRefreshButton.appendChild(badge);
    }

    return { label, badge };
  }

  function updateAutoRefreshButtonLabel(value) {
    if (!autoRefreshButton) {
      return;
    }

    const { label, badge } = ensureAutoRefreshButtonContent();
    if (!label || !badge) {
      return;
    }

    const option = getAutoRefreshOption(value);
    if (!option.ms || activeAutoRefreshValue !== option.value || !nextAutoRefreshAt) {
      label.textContent = `自动刷新: ${option.label}`;
      badge.style.display = 'none';
      badge.textContent = '';
      autoRefreshButton.setAttribute('aria-label', label.textContent);
      updateAutoRefreshDebugAttributes();
      return;
    }

    const remainingSeconds = getRemainingAutoRefreshSeconds();
    label.textContent = `自动刷新 ${option.label}`;
    badge.textContent = `${remainingSeconds}s后`;
    badge.style.display = 'inline-flex';
    autoRefreshButton.setAttribute('aria-label', `${label.textContent} ${badge.textContent}`);
    updateAutoRefreshDebugAttributes();
  }

  function buildAutoRefreshMenu(currentValue, onSelect) {
    const menu = document.createElement('div');
    menu.dataset.sub2apiAutoRefreshMenu = 'true';
    menu.style.position = 'absolute';
    menu.style.top = 'calc(100% + 8px)';
    menu.style.right = '0';
    menu.style.minWidth = '132px';
    menu.style.padding = '6px';
    menu.style.borderRadius = '12px';
    menu.style.background = '#fff';
    menu.style.boxShadow = '0 12px 30px rgba(15, 23, 42, 0.16)';
    menu.style.border = '1px solid rgba(148, 163, 184, 0.25)';
    menu.style.zIndex = '9999';

    for (const option of AUTO_REFRESH_OPTIONS) {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = option.label;
      item.style.display = 'block';
      item.style.width = '100%';
      item.style.padding = '8px 10px';
      item.style.border = 'none';
      item.style.borderRadius = '8px';
      item.style.background = option.value === currentValue ? '#e6fffb' : 'transparent';
      item.style.color = option.value === currentValue ? '#0f766e' : '#334155';
      item.style.textAlign = 'left';
      item.style.cursor = 'pointer';
      item.style.whiteSpace = 'nowrap';
      item.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelect(option.value);
      });
      menu.appendChild(item);
    }

    return menu;
  }

  function installAutoRefreshControl() {
    if (!isFeatureEnabled(FEATURE_IDS.USAGE_AUTO_REFRESH)) {
      removeAutoRefreshControl();
      return false;
    }

    if (autoRefreshButton && !autoRefreshButton.isConnected) {
      autoRefreshButton = null;
    }
    if (autoRefreshMenu && !autoRefreshMenu.isConnected) {
      autoRefreshMenu = null;
    }

    const actionRow = getActionButtonRow();
    const refreshButton = getRefreshButton();
    if (!actionRow || !refreshButton) {
      return false;
    }

    const existingRoot = actionRow.querySelector('[data-sub2api-auto-refresh-root="true"]');
    if (existingRoot) {
      autoRefreshButton = existingRoot.querySelector('[data-sub2api-auto-refresh-button="true"]');
      updateAutoRefreshButtonLabel(getSavedAutoRefreshValue());
      return Boolean(autoRefreshButton);
    }

    const root = document.createElement('div');
    root.dataset.sub2apiAutoRefreshRoot = 'true';
    root.style.position = 'relative';
    root.style.display = 'inline-flex';

    const actionRowStyle = window.getComputedStyle(actionRow);
    const actionRowGap = Number.parseFloat(actionRowStyle.columnGap || actionRowStyle.gap || '0');
    if (!Number.isFinite(actionRowGap) || actionRowGap === 0) {
      root.style.marginLeft = '12px';
    }

    const refreshButtonStyle = window.getComputedStyle(refreshButton);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.sub2apiAutoRefreshButton = 'true';
    button.className = refreshButton.className;
    button.style.height = refreshButtonStyle.height;
    button.style.padding = refreshButtonStyle.padding;
    button.style.borderRadius = refreshButtonStyle.borderRadius;
    button.style.whiteSpace = 'nowrap';
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.gap = '10px';
    button.style.boxSizing = 'border-box';
    button.style.cursor = 'pointer';
    if (!button.className) {
      button.style.border = refreshButtonStyle.border;
      button.style.backgroundColor = refreshButtonStyle.backgroundColor;
      button.style.color = refreshButtonStyle.color;
      button.style.font = refreshButtonStyle.font;
    }
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');

    autoRefreshButton = button;
    updateAutoRefreshButtonLabel(getSavedAutoRefreshValue());

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (autoRefreshMenu) {
        closeAutoRefreshMenu();
        return;
      }

      autoRefreshMenu = buildAutoRefreshMenu(getSavedAutoRefreshValue(), (value) => {
        applyAutoRefreshValue(value);
        closeAutoRefreshMenu();
      });
      root.appendChild(autoRefreshMenu);
      button.setAttribute('aria-expanded', 'true');
    });

    root.appendChild(button);
    refreshButton.insertAdjacentElement('afterend', root);
    recordAutoRefreshEvent('control-installed');
    return true;
  }

  function clearAutoRefreshTimers() {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
    if (autoRefreshCountdownTimer) {
      clearInterval(autoRefreshCountdownTimer);
      autoRefreshCountdownTimer = null;
    }
    nextAutoRefreshAt = null;
  }

  function stopAutoRefresh() {
    clearAutoRefreshTimers();
    autoRefreshState = AUTO_REFRESH_STATE.OFF;
    activeAutoRefreshValue = 'off';
    autoRefreshPausedByBackground = false;
    recordAutoRefreshEvent('stop');
    updateAutoRefreshButtonLabel(activeAutoRefreshValue);
  }

  function pauseAutoRefreshForHidden(reason = 'hidden') {
    const option = getAutoRefreshOption(activeAutoRefreshValue);
    clearAutoRefreshTimers();
    autoRefreshState = option.ms ? AUTO_REFRESH_STATE.PAUSED_HIDDEN : AUTO_REFRESH_STATE.OFF;
    autoRefreshPausedByBackground = Boolean(option.ms);
    lastKnownForeground = false;
    recordAutoRefreshEvent('pause', reason);
    updateAutoRefreshButtonLabel(activeAutoRefreshValue);
  }

  function resetAutoRefreshCountdown(ms) {
    nextAutoRefreshAt = Date.now() + ms;
    updateAutoRefreshButtonLabel(activeAutoRefreshValue);
  }

  function triggerRefresh(reason = 'auto') {
    if (!isFeatureEnabled(FEATURE_IDS.USAGE_AUTO_REFRESH)) {
      cleanupDisabledFeatures();
      return false;
    }

    if (!isUsageAutoRefreshPage() || !isPageVisible()) {
      recordAutoRefreshEvent('refresh-skip', reason);
      return false;
    }

    const refreshButton = getRefreshButton();
    if (refreshButton && !refreshButton.disabled) {
      refreshButton.click();
      recordAutoRefreshEvent('refresh-click', reason);
      return true;
    }

    recordAutoRefreshEvent('refresh-miss', reason);
    return false;
  }

  async function triggerRefreshWhenReady(reason = 'auto') {
    return Boolean(
      await waitFor(
        () => (isPageForeground() ? triggerRefresh(reason) : false),
        FOREGROUND_REFRESH_WAIT_TIMEOUT_MS,
      ),
    );
  }

  function startAutoRefresh(value, { resetPauseFlag = false, reason = 'start' } = {}) {
    if (!isFeatureEnabled(FEATURE_IDS.USAGE_AUTO_REFRESH)) {
      cleanupDisabledFeatures();
      return;
    }

    const option = getAutoRefreshOption(value);
    activeAutoRefreshValue = option.value;
    clearAutoRefreshTimers();
    if (resetPauseFlag) {
      autoRefreshPausedByBackground = false;
    }
    updateAutoRefreshButtonLabel(option.value);
    if (!option.ms) {
      autoRefreshState = AUTO_REFRESH_STATE.OFF;
      autoRefreshPausedByBackground = false;
      recordAutoRefreshEvent('start-off', reason);
      updateAutoRefreshButtonLabel(option.value);
      return;
    }
    if (!isUsageAutoRefreshPage() || !isPageVisible()) {
      autoRefreshState = AUTO_REFRESH_STATE.PAUSED_HIDDEN;
      autoRefreshPausedByBackground = true;
      recordAutoRefreshEvent('start-paused', reason);
      updateAutoRefreshButtonLabel(option.value);
      return;
    }

    autoRefreshState = AUTO_REFRESH_STATE.RUNNING;
    lastKnownForeground = true;
    recordAutoRefreshEvent('start-running', reason);
    resetAutoRefreshCountdown(option.ms);
    autoRefreshCountdownTimer = window.setInterval(() => {
      if (!isUsageAutoRefreshPage() || !isPageVisible()) {
        pauseAutoRefreshForHidden('countdown-hidden');
        return;
      }
      updateAutoRefreshButtonLabel(activeAutoRefreshValue);
    }, AUTO_REFRESH_COUNTDOWN_INTERVAL_MS);

    autoRefreshTimer = window.setInterval(() => {
      if (!isUsageAutoRefreshPage() || !isPageVisible()) {
        pauseAutoRefreshForHidden('interval-hidden');
        return;
      }
      triggerRefresh('interval');
      resetAutoRefreshCountdown(option.ms);
    }, option.ms);
  }

  function applyAutoRefreshValue(value) {
    const normalizedValue = getAutoRefreshOption(value).value;
    setSavedAutoRefreshValue(normalizedValue);
    startAutoRefresh(normalizedValue, { resetPauseFlag: true, reason: 'select' });
  }

  function restoreAutoRefresh() {
    const value = getSavedAutoRefreshValue();
    updateAutoRefreshButtonLabel(value);
    startAutoRefresh(value, { resetPauseFlag: true, reason: 'restore' });
  }

  async function resumeAutoRefreshAfterForeground({ force = false, reason = 'foreground' } = {}) {
    if (!isPageForeground() || autoRefreshState === AUTO_REFRESH_STATE.RESUMING) {
      recordAutoRefreshEvent('resume-skip', reason);
      return;
    }

    const value = getSavedAutoRefreshValue();
    const option = getAutoRefreshOption(value);
    if (!option.ms) {
      stopAutoRefresh();
      return;
    }

    const shouldRefresh =
      force ||
      autoRefreshPausedByBackground ||
      autoRefreshState === AUTO_REFRESH_STATE.PAUSED_HIDDEN ||
      !autoRefreshTimer;
    if (!shouldRefresh && autoRefreshState === AUTO_REFRESH_STATE.RUNNING) {
      recordAutoRefreshEvent('resume-keep-running', reason);
      return;
    }

    const resumeToken = ++autoRefreshResumeToken;
    clearAutoRefreshTimers();
    autoRefreshState = AUTO_REFRESH_STATE.RESUMING;
    activeAutoRefreshValue = value;
    lastKnownForeground = true;
    recordAutoRefreshEvent('resume-start', reason);
    updateAutoRefreshButtonLabel(value);

    try {
      const controlReady = await ensureAutoRefreshControl();
      if (
        resumeToken !== autoRefreshResumeToken ||
        autoRefreshState !== AUTO_REFRESH_STATE.RESUMING ||
        !isPageForeground() ||
        getSavedAutoRefreshValue() !== value
      ) {
        return;
      }

      const refreshed = controlReady
        ? await triggerRefreshWhenReady(`foreground-${reason}`)
        : false;
      if (resumeToken !== autoRefreshResumeToken || getSavedAutoRefreshValue() !== value) {
        return;
      }

      if (!refreshed) {
        return;
      }

      lastForegroundRefreshAt = Date.now();
      startAutoRefresh(value, {
        resetPauseFlag: true,
        reason: `foreground-refreshed-${reason}`,
      });
    } finally {
      if (autoRefreshState === AUTO_REFRESH_STATE.RESUMING) {
        if (!isUsageAutoRefreshPage() || !getAutoRefreshOption(getSavedAutoRefreshValue()).ms) {
          stopAutoRefresh();
        } else if (!isPageVisible()) {
          pauseAutoRefreshForHidden('resume-hidden');
        } else {
          autoRefreshState = AUTO_REFRESH_STATE.PAUSED_HIDDEN;
          lastKnownForeground = false;
          recordAutoRefreshEvent('resume-waiting-refresh', reason);
          updateAutoRefreshButtonLabel(activeAutoRefreshValue);
        }
      }
    }
  }

  function handleAutoRefreshBackground(reason = 'background') {
    if (!isFeatureEnabled(FEATURE_IDS.USAGE_AUTO_REFRESH)) {
      cleanupDisabledFeatures();
      return;
    }

    if (!isUsageAutoRefreshPage()) {
      return;
    }

    const value = getSavedAutoRefreshValue();
    if (!getAutoRefreshOption(value).ms) {
      return;
    }

    activeAutoRefreshValue = value;
    pauseAutoRefreshForHidden(reason);
  }

  function handleAutoRefreshForeground(reason = 'foreground') {
    if (!isFeatureEnabled(FEATURE_IDS.USAGE_AUTO_REFRESH)) {
      cleanupDisabledFeatures();
      return;
    }

    if (!isPageForeground()) {
      return;
    }

    syncPageThemeWithBrowserTheme();
    resumeAutoRefreshAfterForeground({ force: true, reason });
  }

  function checkAutoRefreshForegroundState() {
    if (!isFeatureEnabled(FEATURE_IDS.USAGE_AUTO_REFRESH)) {
      cleanupDisabledFeatures();
      lastKnownForeground = false;
      return;
    }

    const now = Date.now();
    const elapsedSinceLastCheck = lastForegroundWatchAt ? now - lastForegroundWatchAt : 0;
    lastForegroundWatchAt = now;
    const isForeground = isPageForeground();
    if (lastKnownForeground === null) {
      lastKnownForeground = isForeground;
      return;
    }

    const resumedAfterTimerGap =
      isForeground &&
      lastKnownForeground &&
      elapsedSinceLastCheck > FOREGROUND_WATCH_GAP_MS;

    if (!isForeground) {
      if (lastKnownForeground) {
        handleAutoRefreshBackground('watch-hidden');
      }
      lastKnownForeground = false;
      return;
    }

    if (!lastKnownForeground || resumedAfterTimerGap) {
      handleAutoRefreshForeground(resumedAfterTimerGap ? 'watch-gap' : 'watch-visible');
    }
    lastKnownForeground = true;
  }

  async function ensureAutoRefreshControl() {
    if (installAutoRefreshControl()) {
      return true;
    }

    const actionRow = await waitFor(() => getActionButtonRow());
    if (!actionRow) {
      return false;
    }

    return installAutoRefreshControl();
  }

  async function applyPageEnhancements() {
    if (!shouldEnableSub2apiHelper()) {
      scheduleActivationRetry();
      removeSettingsLauncherButton();
      cleanupDisabledFeatures();
      return;
    }

    installSettingsLauncherButton();
    cleanupDisabledFeatures();
    await syncPageThemeWithBrowserTheme();
    restoreSavedSidebarState();

    if (isAdminAccountsPage()) {
      stopAutoRefresh();
      closeAutoRefreshMenu();
      await restoreSavedAdminAccountsFilters();
      return;
    }

    if (!isUsagePage() && !isDashboardPage()) {
      stopAutoRefresh();
      closeAutoRefreshMenu();
      return;
    }

    const rangeRestored = await restoreSavedRange();

    if (isDashboardPage()) {
      await restoreSavedGranularity();
      if (rangeRestored) {
        const refreshButton = await waitFor(getRefreshButton);
        if (refreshButton && !refreshButton.disabled) {
          refreshButton.click();
        }
      }
      stopAutoRefresh();
      closeAutoRefreshMenu();
      return;
    }

    if (rangeRestored) {
      const refreshButton = await waitFor(getRefreshButton);
      if (refreshButton && !refreshButton.disabled) {
        refreshButton.click();
      }
    }

    await restoreSavedPageSize();
    await restoreSavedGranularity();
    if (!isUsageAutoRefreshPage()) {
      stopAutoRefresh();
      closeAutoRefreshMenu();
      return;
    }

    const controlReady = isFeatureEnabled(FEATURE_IDS.USAGE_AUTO_REFRESH)
      ? await ensureAutoRefreshControl()
      : false;
    if (controlReady && isFeatureEnabled(FEATURE_IDS.USAGE_AUTO_REFRESH)) {
      restoreAutoRefresh();
    }
  }

  function installClickHooks() {
    if (clickHooksInstalled) {
      return;
    }

    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        if (event.isTrusted === false) {
          return;
        }

        if (isFeatureEnabled(FEATURE_IDS.SIDEBAR_STATE) && isSidebarToggleTarget(target)) {
          markSidebarSelectionActive();
          saveCurrentSidebarStateSoon();
        }

        if (isActivePageSizeFeatureEnabled() && isPageSizeButtonTarget(target)) {
          markPageSizeSelectionActive();
        }

        if (isActiveGranularityFeatureEnabled() && isGranularityButtonTarget(target)) {
          markGranularitySelectionActive();
        }

        if (isAdminAccountsFilterButtonTarget(target)) {
          markAdminAccountsFilterSelectionActive(target);
        }

        const option = target.closest('[role="option"]');
        const adminAccountsFilter = getActiveAdminAccountsFilter();
        const adminAccountsFilterValue = normalizeSelectText(option?.textContent.trim());
        if (
          isAdminAccountsFiltersFeatureEnabled() &&
          adminAccountsFilter &&
          adminAccountsFilterValue &&
          isAdminAccountsFilterSelectionActive()
        ) {
          setSavedAdminAccountsFilterValue(adminAccountsFilter, adminAccountsFilterValue);
          clearAdminAccountsFilterSelectionActive();
          return;
        }

        const pageSizeValue = normalizePageSizeValue(option?.textContent.trim());
        const pageSizeButtonExpanded = getPageSizeButton()?.getAttribute('aria-expanded') === 'true';
        if (
          isActivePageSizeFeatureEnabled() &&
          pageSizeValue &&
          (pageSizeButtonExpanded || isPageSizeSelectionActive())
        ) {
          setSavedPageSizeValue(pageSizeValue);
          saveCurrentPageSizeSoon(pageSizeValue);
          pageSizeSelectionActiveUntil = 0;
          return;
        }

        const granularityValue = normalizeGranularityValue(option?.textContent.trim());
        const granularityButtonExpanded = getGranularityButton()?.getAttribute('aria-expanded') === 'true';
        if (
          getActiveGranularityStorageName() &&
          isActiveGranularityFeatureEnabled() &&
          granularityValue &&
          (granularityButtonExpanded || isGranularitySelectionActive())
        ) {
          setSavedGranularityValue(granularityValue);
          saveCurrentGranularitySoon(granularityValue);
          granularitySelectionActiveUntil = 0;
          return;
        }

        const button = target.closest('button');
        if (!button) {
          return;
        }

        const text = button.textContent.trim();
        if (text === '应用') {
          const draft = readDraftRange();
          const storageName = getActiveDateRangeStorageName();
          if (draft && storageName && isActiveDateRangeFeatureEnabled()) {
            setStorageValue(storageName, draft);
          }
          clearDateRangeSelectionActive();
          return;
        }

        if (button.classList.contains('date-picker-trigger')) {
          markDateRangeSelectionActive();
          return;
        }

        if (button.classList.contains('date-picker-preset')) {
          markDateRangeSelectionActive();
          const storageName = getActiveDateRangeStorageName();
          if (storageName && isActiveDateRangeFeatureEnabled()) {
            setStorageValue(storageName, { type: 'preset', label: text });
          }
          return;
        }

        if (text === '重置') {
          if (isUsagePage()) {
            if (isActiveDateRangeFeatureEnabled()) {
              const storageName = getActiveDateRangeStorageName();
              if (storageName) {
                deleteStorageValue(storageName);
              }
            }
            if (isActiveGranularityFeatureEnabled()) {
              const storageName = getActiveGranularityStorageName();
              if (storageName) {
                deleteStorageValue(storageName);
              }
            }
            const pageSizeStorageName = getActivePageSizeStorageName();
            if (pageSizeStorageName && isActivePageSizeFeatureEnabled()) {
              deleteStorageValue(pageSizeStorageName);
            }
            return;
          }

          if (isDashboardPage() && isActiveDateRangeFeatureEnabled()) {
            const storageName = getActiveDateRangeStorageName();
            if (storageName) {
              deleteStorageValue(storageName);
            }
          }
        }
      },
      true,
    );
    clickHooksInstalled = true;
  }

  function installAutoRefreshMenuCloseHook() {
    if (autoRefreshMenuCloseHookInstalled) {
      return;
    }

    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        if (target.closest('[data-sub2api-auto-refresh-root="true"]')) {
          return;
        }
        closeAutoRefreshMenu();
      },
      true,
    );
    autoRefreshMenuCloseHookInstalled = true;
  }

  function installBrowserThemeWatcher() {
    if (browserThemeWatcherInstalled) {
      return;
    }

    const mediaQuery = getBrowserThemeMediaQuery();
    const handleThemeChange = () => {
      syncPageThemeWithBrowserTheme();
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleThemeChange);
    } else {
      mediaQuery.addListener(handleThemeChange);
    }

    browserThemeWatcherInstalled = true;
  }

  function installPageVisibilityWatcher() {
    if (pageVisibilityWatcherInstalled) {
      return;
    }

    document.addEventListener('visibilitychange', () => {
      if (!isUsageAutoRefreshPage()) {
        return;
      }

      if (!isPageVisible()) {
        handleAutoRefreshBackground('visibility-hidden');
        return;
      }

      handleAutoRefreshForeground('visibility-visible');
    });

    window.addEventListener('focus', () => {
      handleAutoRefreshForeground('focus');
    });

    window.addEventListener('pageshow', () => {
      handleAutoRefreshForeground('pageshow');
    });

    window.addEventListener('blur', () => {
      handleAutoRefreshBackground('blur');
    });

    window.addEventListener('pagehide', () => {
      handleAutoRefreshBackground('pagehide');
    });

    pageVisibilityWatcherInstalled = true;
  }

  function installForegroundWatcher() {
    if (foregroundWatcherInstalled) {
      return;
    }

    lastKnownForeground = isPageForeground();
    lastForegroundWatchAt = Date.now();
    window.setInterval(checkAutoRefreshForegroundState, FOREGROUND_WATCH_INTERVAL_MS);
    foregroundWatcherInstalled = true;
  }

  function installPageSizeWatcher() {
    if (pageSizeWatcherInstalled) {
      return;
    }

    const observer = new MutationObserver(() => {
      installSettingsLauncherButton();
      cleanupDisabledFeatures();
      restoreSavedSidebarState();
      restoreSavedRange();
      restoreSavedAdminAccountsFilters();
      handlePageSizeValueChange();
      handleGranularityValueChange();
    });
    observer.observe(document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    pageSizeWatcherInstalled = true;
  }

  function installUrlWatcher() {
    if (urlWatcherInstalled) {
      return;
    }

    let lastHref = location.href;
    const observer = new MutationObserver(() => {
      if (
        isFeatureEnabled(FEATURE_IDS.USAGE_AUTO_REFRESH) &&
        isUsageAutoRefreshPage() &&
        getRefreshButton() &&
        !document.querySelector('[data-sub2api-auto-refresh-root="true"]')
      ) {
        installAutoRefreshControl();
      }

      if (location.href === lastHref) {
        return;
      }

      lastHref = location.href;
      rangeRestoreInFlight = false;
      rangeRestoreToken += 1;
      applyPageEnhancements();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    urlWatcherInstalled = true;
  }

  function activateSub2apiHelper() {
    if (helperActivated) {
      document.documentElement.dataset.sub2apiHelperVersion = SCRIPT_VERSION;
      applyPageEnhancements();
      return true;
    }

    helperActivated = true;
    document.documentElement.dataset.sub2apiHelperVersion = SCRIPT_VERSION;
    installClickHooks();
    installAutoRefreshMenuCloseHook();
    installUsageRequestRewriter();
    installBrowserThemeWatcher();
    installPageVisibilityWatcher();
    installForegroundWatcher();
    installPageSizeWatcher();
    installUrlWatcher();
    applyPageEnhancements();
    return true;
  }

  async function scheduleActivationRetry() {
    if (activationRetryInFlight || !shouldRetrySub2apiHelperActivation()) {
      return;
    }

    activationRetryInFlight = true;
    const retryToken = ++activationRetryToken;
    try {
      const ready = await waitFor(() => shouldEnableSub2apiHelper() ? true : null, RANGE_RESTORE_SETTLE_TIMEOUT_MS);
      if (ready && retryToken === activationRetryToken) {
        applyPageEnhancements();
      }
    } finally {
      if (retryToken === activationRetryToken) {
        activationRetryInFlight = false;
      }
    }
  }

  function tryActivateSub2apiHelper() {
    if (helperActivated) {
      return true;
    }

    if (!shouldEnableSub2apiHelper()) {
      scheduleActivationRetry();
      removeSettingsLauncherButton();
      return false;
    }

    return activateSub2apiHelper();
  }

  function installActivationWatcher() {
    if (activationWatcherInstalled) {
      return;
    }

    const observer = new MutationObserver(() => {
      tryActivateSub2apiHelper();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    activationWatcherInstalled = true;
  }

  function startSub2apiEnhancements() {
    installActivationWatcher();
    tryActivateSub2apiHelper();
  }

  function startSub2apiEnhancementsWhenDomIsReady() {
    if (document.documentElement) {
      startSub2apiEnhancements();
      return;
    }

    window.addEventListener('DOMContentLoaded', startSub2apiEnhancements, { once: true });
  }

  installUsageRequestRewriter();
  registerSettingsMenu();
  startSub2apiEnhancementsWhenDomIsReady();
})();
