  async function applyPageEnhancements() {
    if (!shouldEnableSub2apiHelper()) {
      removeSettingsLauncherButton();
      cleanupDisabledFeatures();
      return;
    }

    installSettingsLauncherButton();
    cleanupDisabledFeatures();
    await syncPageThemeWithBrowserTheme();
    restoreSavedSidebarState();

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

        if (isFeatureEnabled(FEATURE_IDS.SIDEBAR_STATE) && isSidebarToggleTarget(target)) {
          markSidebarSelectionActive();
          saveCurrentSidebarStateSoon();
        }

        if (isFeatureEnabled(FEATURE_IDS.USAGE_PAGE_SIZE) && isPageSizeButtonTarget(target)) {
          markPageSizeSelectionActive();
        }

        if (isActiveGranularityFeatureEnabled() && isGranularityButtonTarget(target)) {
          markGranularitySelectionActive();
        }

        const option = target.closest('[role="option"]');
        const pageSizeValue = normalizePageSizeValue(option?.textContent.trim());
        const pageSizeButtonExpanded = getPageSizeButton()?.getAttribute('aria-expanded') === 'true';
        if (
          isFeatureEnabled(FEATURE_IDS.USAGE_PAGE_SIZE) &&
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
          return;
        }

        if (button.classList.contains('date-picker-trigger')) {
          rangeRestoreAttemptPathname = location.pathname;
          rangeRestoreAttemptTrigger = button;
          return;
        }

        if (button.classList.contains('date-picker-preset')) {
          rangeRestoreAttemptPathname = location.pathname;
          rangeRestoreAttemptTrigger = getTrigger();
          return;
        }

        if (text === '重置') {
          if (isUsagePage()) {
            if (isFeatureEnabled(FEATURE_IDS.USAGE_DATE_RANGE)) {
              deleteStorageValue(STORAGE_NAMES.USAGE_DATE_RANGE);
            }
            if (isFeatureEnabled(FEATURE_IDS.USAGE_GRANULARITY)) {
              deleteStorageValue(STORAGE_NAMES.USAGE_GRANULARITY);
            }
            if (isFeatureEnabled(FEATURE_IDS.USAGE_PAGE_SIZE)) {
              deleteStorageValue(STORAGE_NAMES.PAGE_SIZE);
            }
            return;
          }

          if (isDashboardPage() && isFeatureEnabled(FEATURE_IDS.DASHBOARD_DATE_RANGE)) {
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
      rangeRestoreAttemptPathname = null;
      rangeRestoreAttemptTrigger = null;
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
      applyPageEnhancements();
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
