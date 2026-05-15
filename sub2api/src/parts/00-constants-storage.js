  const SCRIPT_VERSION = '0.22.6';
  const STORAGE_NAMESPACE = 'sub2api-helper';
  const STORAGE_MISSING = {};
  const LEGACY_STORAGE_ORIGIN = 'https://codex.ciii.club';
  const SETTINGS_MENU_LABEL = 'Sub2API Helper 设置';
  const STORAGE_NAMES = {
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
  const SETTINGS_GROUPS = {
    ADMIN_DASHBOARD: 'admin-dashboard',
    ADMIN_USAGE: 'admin-usage',
    DASHBOARD: 'dashboard',
    USAGE: 'usage',
  };
  const FEATURE_IDS = {
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
      description: '跟随浏览器深浅色切换 Sub2API 主题。',
      id: FEATURE_IDS.THEME_SYNC,
      label: '浏览器主题同步',
    },
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
  let lastObservedPageSizeValue = null;
  let granularitySelectionActiveUntil = 0;
  let lastObservedGranularityValue = null;
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
