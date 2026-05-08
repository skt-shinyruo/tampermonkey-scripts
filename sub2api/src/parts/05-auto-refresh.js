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

