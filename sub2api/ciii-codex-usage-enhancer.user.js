// ==UserScript==
// @name         Ciii Codex Helper
// @namespace    https://codex.ciii.club/
// @version      0.17.0
// @description  全站跟随浏览器主题同步；为使用记录页增加日期范围记忆、每页记忆与自动刷新倒计时。
// @match        https://codex.ciii.club/*
// @grant        GM_deleteValue
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_VERSION = '0.17.0';
  const DATE_RANGE_STORAGE_KEY = 'ciii-codex-usage-date-range';
  const PAGE_SIZE_STORAGE_KEY = 'ciii-codex-usage-page-size';
  const AUTO_REFRESH_STORAGE_KEY = 'ciii-codex-auto-refresh-ms';
  const PAGE_THEME_STORAGE_KEY = 'theme';
  const WAIT_INTERVAL_MS = 250;
  const WAIT_TIMEOUT_MS = 15000;
  const AUTO_REFRESH_COUNTDOWN_INTERVAL_MS = 1000;
  const THEME_TOGGLE_WAIT_TIMEOUT_MS = 5000;
  const THEME_SYNC_RETRY_DELAY_MS = 500;
  const PAGE_SIZE_SELECTION_WINDOW_MS = 5000;
  const PAGE_SIZE_SAVE_DELAY_MS = 150;
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

  let restoreAttempted = false;
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
  let themeSyncInFlight = false;
  let pageSizeSelectionActiveUntil = 0;
  let lastObservedPageSizeValue = null;
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
      `Ciii Codex Helper v${SCRIPT_VERSION}`,
      `state: ${autoRefreshState}`,
      `visible: ${document.visibilityState}`,
      `focus: ${document.hasFocus()}`,
      `active: ${activeAutoRefreshValue}`,
      `pausedByBackground: ${autoRefreshPausedByBackground}`,
      `next: ${nextRefreshSeconds === null ? '-' : `${nextRefreshSeconds}s`}`,
      `last: ${lastAutoRefreshEvent}`,
      ...autoRefreshDebugEvents,
    ].join('\n');
    const root = autoRefreshButton.closest('[data-ciii-auto-refresh-root="true"]');

    autoRefreshButton.dataset.ciiiAutoRefreshVersion = SCRIPT_VERSION;
    autoRefreshButton.dataset.ciiiAutoRefreshState = autoRefreshState;
    autoRefreshButton.dataset.ciiiAutoRefreshLastEvent = lastAutoRefreshEvent;
    autoRefreshButton.title = debugTitle;

    if (root) {
      root.dataset.ciiiAutoRefreshVersion = SCRIPT_VERSION;
      root.dataset.ciiiAutoRefreshState = autoRefreshState;
      root.dataset.ciiiAutoRefreshLastEvent = lastAutoRefreshEvent;
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

  function getPageSizeLabel() {
    return [...document.querySelectorAll('span')].find((element) => element.textContent.trim() === '每页:');
  }

  function getPageSizeWrapper() {
    return getPageSizeLabel()?.closest('div.flex.items-center.space-x-2') || null;
  }

  function getPageSizeButton() {
    return getPageSizeWrapper()?.querySelector('button.select-trigger') || null;
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
    const savedValue = storage.get(PAGE_SIZE_STORAGE_KEY, null);
    return normalizePageSizeValue(savedValue);
  }

  function setSavedPageSizeValue(value) {
    const normalizedValue = normalizePageSizeValue(value);
    if (!normalizedValue) {
      return;
    }
    storage.set(PAGE_SIZE_STORAGE_KEY, normalizedValue);
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
    const savedValue = storage.get(AUTO_REFRESH_STORAGE_KEY, 'off');
    return getAutoRefreshOption(savedValue).value;
  }

  function setSavedAutoRefreshValue(value) {
    storage.set(AUTO_REFRESH_STORAGE_KEY, getAutoRefreshOption(value).value);
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
    return getTrigger()?.textContent.trim() || '';
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
    if (restoreAttempted) {
      return;
    }
    restoreAttempted = true;

    const savedRange = storage.get(DATE_RANGE_STORAGE_KEY, null);
    if (!savedRange) {
      return;
    }

    const trigger = await waitFor(getTrigger);
    if (!trigger || isAlreadyApplied(savedRange)) {
      return;
    }

    const opened = await openPicker();
    if (!opened) {
      return;
    }

    if (savedRange.type === 'preset') {
      const presetButton = await waitFor(() =>
        getPresetButtons().find(
          (button) => button.textContent.trim() === savedRange.label,
        ),
      );
      if (!presetButton) {
        return;
      }
      presetButton.click();
    } else if (savedRange.type === 'custom') {
      const inputs = await waitFor(() => {
        const elements = getDateInputs();
        return elements.length === 2 ? elements : null;
      });

      if (!inputs) {
        return;
      }

      setNativeInputValue(inputs[0], savedRange.start);
      setNativeInputValue(inputs[1], savedRange.end);
    } else {
      return;
    }

    const applyButton = await waitFor(getApplyButton);
    applyButton?.click();
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

    let label = autoRefreshButton.querySelector('[data-ciii-auto-refresh-label="true"]');
    if (!label) {
      autoRefreshButton.textContent = '';
      label = document.createElement('span');
      label.dataset.ciiiAutoRefreshLabel = 'true';
      autoRefreshButton.appendChild(label);
    }

    let badge = autoRefreshButton.querySelector('[data-ciii-auto-refresh-badge="true"]');
    if (!badge) {
      badge = document.createElement('span');
      badge.dataset.ciiiAutoRefreshBadge = 'true';
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
    menu.dataset.ciiiAutoRefreshMenu = 'true';
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

    const existingRoot = actionRow.querySelector('[data-ciii-auto-refresh-root="true"]');
    if (existingRoot) {
      autoRefreshButton = existingRoot.querySelector('[data-ciii-auto-refresh-button="true"]');
      updateAutoRefreshButtonLabel(getSavedAutoRefreshValue());
      return Boolean(autoRefreshButton);
    }

    const root = document.createElement('div');
    root.dataset.ciiiAutoRefreshRoot = 'true';
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
    button.dataset.ciiiAutoRefreshButton = 'true';
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

    if (!isUsagePage()) {
      stopAutoRefresh();
      closeAutoRefreshMenu();
      return;
    }

    await restoreSavedRange();
    await restoreSavedPageSize();
    const controlReady = await ensureAutoRefreshControl();
    if (controlReady) {
      restoreAutoRefresh();
    }
  }

  function installClickHooks() {
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        if (isPageSizeButtonTarget(target)) {
          markPageSizeSelectionActive();
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

        const button = target.closest('button');
        if (!button) {
          return;
        }

        const text = button.textContent.trim();
        if (text === '应用') {
          const draft = readDraftRange();
          if (draft) {
            storage.set(DATE_RANGE_STORAGE_KEY, draft);
          }
          return;
        }

        if (text === '重置') {
          storage.delete(DATE_RANGE_STORAGE_KEY);
          storage.delete(PAGE_SIZE_STORAGE_KEY);
        }
      },
      true,
    );
  }

  function installAutoRefreshMenuCloseHook() {
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        if (target.closest('[data-ciii-auto-refresh-root="true"]')) {
          return;
        }
        closeAutoRefreshMenu();
      },
      true,
    );
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

    const observer = new MutationObserver(handlePageSizeValueChange);
    observer.observe(document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    pageSizeWatcherInstalled = true;
  }

  function installUrlWatcher() {
    let lastHref = location.href;
    const observer = new MutationObserver(() => {
      if (isUsagePage() && getRefreshButton() && !document.querySelector('[data-ciii-auto-refresh-root="true"]')) {
        installAutoRefreshControl();
      }

      if (location.href === lastHref) {
        return;
      }

      lastHref = location.href;
      restoreAttempted = false;
      applyPageEnhancements();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  installClickHooks();
  installAutoRefreshMenuCloseHook();
  installBrowserThemeWatcher();
  installPageVisibilityWatcher();
  installForegroundWatcher();
  installPageSizeWatcher();
  installUrlWatcher();
  applyPageEnhancements();
})();
