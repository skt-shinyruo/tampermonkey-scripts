// ==UserScript==
// @name         Sub2API Helper
// @namespace    https://github.com/Wei-Shaw/sub2api
// @version      0.22.2
// @description  为 Sub2API 管理端同步浏览器主题和侧边栏收起状态；为使用记录页增加日期范围记忆、每页记忆与自动刷新倒计时，并为仪表盘增加时间范围和粒度记忆。
// @match        *://*/*
// @grant        GM_deleteValue
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_VERSION = '0.22.2';
  const STORAGE_NAMESPACE = 'sub2api-helper';
  const STORAGE_MISSING = {};
  const LEGACY_STORAGE_ORIGIN = 'https://codex.ciii.club';
  const STORAGE_NAMES = {
    AUTO_REFRESH: 'auto-refresh-ms',
    DASHBOARD_DATE_RANGE: 'dashboard-date-range',
    DASHBOARD_GRANULARITY: 'dashboard-granularity',
    PAGE_SIZE: 'usage-page-size',
    SIDEBAR_COLLAPSED: 'sidebar-collapsed',
    USAGE_DATE_RANGE: 'usage-date-range',
  };
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
  const AUTO_REFRESH_COUNTDOWN_INTERVAL_MS = 1000;
  const THEME_TOGGLE_WAIT_TIMEOUT_MS = 5000;
  const THEME_SYNC_RETRY_DELAY_MS = 500;
  const PAGE_SIZE_SELECTION_WINDOW_MS = 5000;
  const PAGE_SIZE_SAVE_DELAY_MS = 150;
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
  let urlWatcherInstalled = false;
  let activationWatcherInstalled = false;
  let helperActivated = false;
  let themeSyncInFlight = false;
  let pageSizeSelectionActiveUntil = 0;
  let lastObservedPageSizeValue = null;
  let dashboardGranularitySelectionActiveUntil = 0;
  let lastObservedDashboardGranularityValue = null;
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

  function isUsagePage() {
    return location.pathname.startsWith('/usage');
  }

  function isDashboardPage() {
    return location.pathname.startsWith('/dashboard');
  }

  function getActiveDateRangeStorageName() {
    if (isUsagePage()) {
      return STORAGE_NAMES.USAGE_DATE_RANGE;
    }
    if (isDashboardPage()) {
      return STORAGE_NAMES.DASHBOARD_DATE_RANGE;
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
    return isUsagePage() && isPageVisible() && document.hasFocus();
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
        title === '展开' ||
        button.classList.contains('sidebar-link-collapsed')
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
    const savedState = getSavedSidebarCollapsedState();
    if (savedState === null) {
      return false;
    }

    const toggleButton = getSidebarToggleButton();
    const currentState = getSidebarCollapsedStateFromButton(toggleButton);
    if (!toggleButton || currentState === null || currentState === savedState) {
      return false;
    }

    toggleButton.click();
    return true;
  }

  function isSidebarToggleTarget(target) {
    const button = target.closest('button');
    return Boolean(button && getSidebarCollapsedStateFromButton(button) !== null);
  }

  function saveCurrentSidebarStateSoon() {
    window.setTimeout(() => {
      const currentState = getCurrentSidebarCollapsedState();
      if (currentState !== null) {
        setSavedSidebarCollapsedState(currentState);
      }
    }, SIDEBAR_STATE_SAVE_DELAY_MS);
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
    const savedValue = getStorageValue(STORAGE_NAMES.PAGE_SIZE, null);
    return normalizePageSizeValue(savedValue);
  }

  function setSavedPageSizeValue(value) {
    const normalizedValue = normalizePageSizeValue(value);
    if (!normalizedValue) {
      return;
    }
    setStorageValue(STORAGE_NAMES.PAGE_SIZE, normalizedValue);
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
    if (!isUsagePage()) {
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

  function getDashboardGranularityButton() {
    return getLabeledSelectButton('粒度:');
  }

  function hasDatePickerFingerprint() {
    return Boolean(getTrigger() || getDateInputs().length === 2 || getPresetButtons().length > 0);
  }

  function hasUsagePageFingerprint() {
    return Boolean(isUsagePage() && getRefreshButton() && hasDatePickerFingerprint() && getPageSizeButton());
  }

  function hasDashboardPageFingerprint() {
    return Boolean(isDashboardPage() && getRefreshButton() && hasDatePickerFingerprint() && getDashboardGranularityButton());
  }

  function hasSidebarFingerprint() {
    return Boolean(getSidebarToggleButton());
  }

  function shouldEnableSub2apiHelper() {
    return hasUsagePageFingerprint() || hasDashboardPageFingerprint() || hasSidebarFingerprint();
  }

  function normalizeDashboardGranularityValue(value) {
    const normalizedValue = String(value || '').trim();
    return normalizedValue || null;
  }

  function getCurrentDashboardGranularityValue() {
    return normalizeDashboardGranularityValue(getDashboardGranularityButton()?.textContent.trim());
  }

  function getSavedDashboardGranularityValue() {
    const savedValue = getStorageValue(STORAGE_NAMES.DASHBOARD_GRANULARITY, null);
    return normalizeDashboardGranularityValue(savedValue);
  }

  function setSavedDashboardGranularityValue(value) {
    const normalizedValue = normalizeDashboardGranularityValue(value);
    if (!normalizedValue) {
      return;
    }
    setStorageValue(STORAGE_NAMES.DASHBOARD_GRANULARITY, normalizedValue);
  }

  function isDashboardGranularityButtonTarget(target) {
    const granularityButton = getDashboardGranularityButton();
    return Boolean(granularityButton && granularityButton.contains(target));
  }

  function markDashboardGranularitySelectionActive() {
    dashboardGranularitySelectionActiveUntil = Date.now() + PAGE_SIZE_SELECTION_WINDOW_MS;
    lastObservedDashboardGranularityValue = getCurrentDashboardGranularityValue();
  }

  function isDashboardGranularitySelectionActive() {
    return Date.now() <= dashboardGranularitySelectionActiveUntil;
  }

  function saveCurrentDashboardGranularitySoon(fallbackValue = null) {
    const normalizedFallbackValue = normalizeDashboardGranularityValue(fallbackValue);
    window.setTimeout(() => {
      const currentValue = getCurrentDashboardGranularityValue();
      if (currentValue && (!normalizedFallbackValue || currentValue === normalizedFallbackValue)) {
        setSavedDashboardGranularityValue(currentValue);
        return;
      }

      setSavedDashboardGranularityValue(normalizedFallbackValue);
    }, PAGE_SIZE_SAVE_DELAY_MS);
  }

  function handleDashboardGranularityValueChange() {
    if (!isDashboardPage()) {
      return;
    }

    const currentValue = getCurrentDashboardGranularityValue();
    if (!currentValue || currentValue === lastObservedDashboardGranularityValue) {
      return;
    }

    lastObservedDashboardGranularityValue = currentValue;
    if (!isDashboardGranularitySelectionActive()) {
      return;
    }

    setSavedDashboardGranularityValue(currentValue);
    dashboardGranularitySelectionActiveUntil = 0;
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

  function getCurrentPageTheme() {
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

  async function openPicker() {
    if (isPickerOpen()) {
      return true;
    }

    const trigger = await waitFor(getTrigger);
    if (!trigger) {
      return false;
    }

    trigger.click();
    return Boolean(await waitFor(() => isPickerOpen() ? true : null));
  }

  function currentTriggerText() {
    return getTriggerValueElement()?.textContent.trim() || getTrigger()?.textContent.trim() || '';
  }

  function getSavedRangeDisplayText(savedRange) {
    if (!savedRange) {
      return '';
    }

    if (savedRange.type === 'preset') {
      return String(savedRange.label || '').trim();
    }

    if (savedRange.type === 'custom') {
      return String(savedRange.displayText || buildCustomDisplayText(savedRange.start, savedRange.end)).trim();
    }

    return '';
  }

  function syncRangeTriggerText(savedRange) {
    const expectedText = getSavedRangeDisplayText(savedRange);
    if (!expectedText) {
      return false;
    }

    const trigger = getTrigger();
    if (!trigger) {
      return false;
    }

    const currentText = currentTriggerText();
    if (currentText === expectedText) {
      return false;
    }

    const valueElement = getTriggerValueElement();
    if (valueElement) {
      valueElement.textContent = expectedText;
      return true;
    }

    trigger.textContent = expectedText;
    return true;
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
      return triggerText === savedRange.displayText;
    }

    return false;
  }

  async function restoreSavedRange() {
    if (rangeRestoreInFlight) {
      return false;
    }

    const savedRange = getSavedRangeForCurrentPage();
    if (!savedRange) {
      return false;
    }

    if (isUsagePage() || isDashboardPage()) {
      return syncRangeTriggerText(savedRange);
    }

    const trigger = getTrigger();
    if (!trigger || isAlreadyApplied(savedRange)) {
      return false;
    }

    rangeRestoreInFlight = true;
    const restoreToken = ++rangeRestoreToken;
    const restorePathname = location.pathname;

    try {
      const opened = await openPicker();
      if (!opened || restoreToken !== rangeRestoreToken || location.pathname !== restorePathname) {
        return;
      }

      if (savedRange.type === 'preset') {
        const presetButton = await waitFor(() =>
          getPresetButtons().find(
            (button) => button.textContent.trim() === savedRange.label,
          ),
        );
        if (!presetButton || restoreToken !== rangeRestoreToken || location.pathname !== restorePathname) {
          return;
        }
        presetButton.click();
      } else if (savedRange.type === 'custom') {
        const inputs = await waitFor(() => {
          const elements = getDateInputs();
          return elements.length === 2 ? elements : null;
        });

        if (!inputs || restoreToken !== rangeRestoreToken || location.pathname !== restorePathname) {
          return;
        }

        setNativeInputValue(inputs[0], savedRange.start);
        setNativeInputValue(inputs[1], savedRange.end);
      } else {
        return;
      }

      const applyButton = await waitFor(getApplyButton);
      if (!applyButton || restoreToken !== rangeRestoreToken || location.pathname !== restorePathname) {
        return false;
      }
      applyButton.click();
      return true;
    } finally {
      if (restoreToken === rangeRestoreToken) {
        rangeRestoreInFlight = false;
      }
    }
  }

  function rewriteUsageRequestUrl(urlInput) {
    if (!helperActivated || (!isUsagePage() && !isDashboardPage()) || !urlInput) {
      return urlInput;
    }

    const savedRange = getSavedRangeForCurrentPage();
    if (!savedRange) {
      return urlInput;
    }

    const requestUrl = new URL(String(urlInput), location.href);
    if (requestUrl.origin !== getCurrentOrigin() || !requestUrl.pathname.startsWith('/api/v1/usage')) {
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

  async function restoreSavedDashboardGranularity() {
    const savedGranularity = getSavedDashboardGranularityValue();
    if (!savedGranularity) {
      return;
    }

    const granularityButton = await waitFor(getDashboardGranularityButton);
    if (!granularityButton || getCurrentDashboardGranularityValue() === savedGranularity) {
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
      setSavedDashboardGranularityValue(savedGranularity);
    }
  }

  async function syncPageThemeWithBrowserTheme() {
    if (themeSyncInFlight) {
      return;
    }

    themeSyncInFlight = true;
    try {
      const preferredTheme = getPreferredPageTheme();
      if (getCurrentPageTheme() === preferredTheme) {
        return;
      }

      const deadline = Date.now() + THEME_TOGGLE_WAIT_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (getCurrentPageTheme() === preferredTheme) {
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
    if (!isUsagePage() || !isPageVisible()) {
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
    if (!isUsagePage() || !isPageVisible()) {
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
      if (!isUsagePage() || !isPageVisible()) {
        pauseAutoRefreshForHidden('countdown-hidden');
        return;
      }
      updateAutoRefreshButtonLabel(activeAutoRefreshValue);
    }, AUTO_REFRESH_COUNTDOWN_INTERVAL_MS);

    autoRefreshTimer = window.setInterval(() => {
      if (!isUsagePage() || !isPageVisible()) {
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
        if (!isUsagePage() || !getAutoRefreshOption(getSavedAutoRefreshValue()).ms) {
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
    if (!isUsagePage()) {
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
    if (!isPageForeground()) {
      return;
    }

    syncPageThemeWithBrowserTheme();
    resumeAutoRefreshAfterForeground({ force: true, reason });
  }

  function checkAutoRefreshForegroundState() {
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
    await syncPageThemeWithBrowserTheme();
    restoreSavedSidebarState();

    if (!isUsagePage() && !isDashboardPage()) {
      stopAutoRefresh();
      closeAutoRefreshMenu();
      return;
    }

    const rangeRestored = await restoreSavedRange();

    if (isDashboardPage()) {
      await restoreSavedDashboardGranularity();
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
    const controlReady = await ensureAutoRefreshControl();
    if (controlReady) {
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

        if (isSidebarToggleTarget(target)) {
          saveCurrentSidebarStateSoon();
        }

        if (isPageSizeButtonTarget(target)) {
          markPageSizeSelectionActive();
        }

        if (isDashboardGranularityButtonTarget(target)) {
          markDashboardGranularitySelectionActive();
        }

        const option = target.closest('[role="option"]');
        const pageSizeValue = normalizePageSizeValue(option?.textContent.trim());
        const pageSizeButtonExpanded = getPageSizeButton()?.getAttribute('aria-expanded') === 'true';
        if (pageSizeValue && (pageSizeButtonExpanded || isPageSizeSelectionActive())) {
          setSavedPageSizeValue(pageSizeValue);
          saveCurrentPageSizeSoon(pageSizeValue);
          pageSizeSelectionActiveUntil = 0;
          return;
        }

        const dashboardGranularityValue = normalizeDashboardGranularityValue(option?.textContent.trim());
        const dashboardGranularityButtonExpanded =
          getDashboardGranularityButton()?.getAttribute('aria-expanded') === 'true';
        if (
          isDashboardPage() &&
          dashboardGranularityValue &&
          (dashboardGranularityButtonExpanded || isDashboardGranularitySelectionActive())
        ) {
          setSavedDashboardGranularityValue(dashboardGranularityValue);
          saveCurrentDashboardGranularitySoon(dashboardGranularityValue);
          dashboardGranularitySelectionActiveUntil = 0;
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
          if (draft && storageName) {
            setStorageValue(storageName, draft);
          }
          return;
        }

        if (text === '重置') {
          if (isUsagePage()) {
            deleteStorageValue(STORAGE_NAMES.USAGE_DATE_RANGE);
            deleteStorageValue(STORAGE_NAMES.PAGE_SIZE);
            return;
          }

          if (isDashboardPage()) {
            deleteStorageValue(STORAGE_NAMES.DASHBOARD_DATE_RANGE);
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
      if (!isUsagePage()) {
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
      restoreSavedSidebarState();
      restoreSavedRange();
      handlePageSizeValueChange();
      handleDashboardGranularityValueChange();
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
      if (isUsagePage() && getRefreshButton() && !document.querySelector('[data-sub2api-auto-refresh-root="true"]')) {
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
      return true;
    }

    helperActivated = true;
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

  function tryActivateSub2apiHelper() {
    if (helperActivated) {
      return true;
    }

    if (!shouldEnableSub2apiHelper()) {
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

  installActivationWatcher();
  tryActivateSub2apiHelper();
})();
