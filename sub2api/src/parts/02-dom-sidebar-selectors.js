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
    if (!isFeatureEnabled(FEATURE_IDS.SIDEBAR_STATE)) {
      return false;
    }

    if (isSidebarSelectionActive()) {
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

    toggleButton.click();
    return true;
  }

  function isSidebarToggleTarget(target) {
    const button = target.closest('button');
    return Boolean(button && getSidebarCollapsedStateFromButton(button) !== null);
  }

  function markSidebarSelectionActive() {
    sidebarSelectionActiveUntil = Date.now() + PAGE_SIZE_SELECTION_WINDOW_MS;
  }

  function isSidebarSelectionActive() {
    return Boolean(sidebarSelectionActiveUntil && Date.now() <= sidebarSelectionActiveUntil);
  }

  function saveCurrentSidebarStateSoon() {
    window.setTimeout(() => {
      const currentState = getCurrentSidebarCollapsedState();
      if (currentState !== null) {
        setSavedSidebarCollapsedState(currentState);
      }
      sidebarSelectionActiveUntil = 0;
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
    if (!isUsagePage() || !isFeatureEnabled(FEATURE_IDS.USAGE_PAGE_SIZE)) {
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

  function hasDatePickerFingerprint() {
    return Boolean(getTrigger() || getDateInputs().length === 2 || getPresetButtons().length > 0);
  }

