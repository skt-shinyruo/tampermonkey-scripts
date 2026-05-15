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
      await waitForRestoredTriggerText(savedRange);
      return true;
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

  async function syncPageThemeWithBrowserTheme() {
    if (!isFeatureEnabled(FEATURE_IDS.THEME_SYNC)) {
      return;
    }

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
