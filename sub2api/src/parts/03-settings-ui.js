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

  function hasSidebarFingerprint() {
    return Boolean(getSidebarToggleButton());
  }

  function shouldEnableSub2apiHelper() {
    return (
      hasSub2apiAppFingerprint() &&
      (hasUsagePageFingerprint() || hasDashboardPageFingerprint() || hasSidebarFingerprint())
    );
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
        return isUsagePage();
      case FEATURE_IDS.USAGE_AUTO_REFRESH:
        return isUsageAutoRefreshPage();
      case FEATURE_IDS.DASHBOARD_DATE_RANGE:
      case FEATURE_IDS.DASHBOARD_GRANULARITY:
        return isDashboardPage();
      default:
        return false;
    }
  }

  function getActiveDateRangeFeatureId() {
    if (isUsagePage()) {
      return FEATURE_IDS.USAGE_DATE_RANGE;
    }
    if (isDashboardPage()) {
      return FEATURE_IDS.DASHBOARD_DATE_RANGE;
    }
    return null;
  }

  function isActiveDateRangeFeatureEnabled() {
    const featureId = getActiveDateRangeFeatureId();
    return Boolean(featureId && isFeatureEnabled(featureId));
  }

  function getActiveGranularityFeatureId() {
    if (isUsagePage()) {
      return FEATURE_IDS.USAGE_GRANULARITY;
    }
    if (isDashboardPage()) {
      return FEATURE_IDS.DASHBOARD_GRANULARITY;
    }
    return null;
  }

  function isActiveGranularityFeatureEnabled() {
    const featureId = getActiveGranularityFeatureId();
    return Boolean(featureId && isFeatureEnabled(featureId));
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
      return true;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '设置';
    button.dataset.sub2apiSettingsLauncher = 'true';
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

    const featureList = document.createElement('div');
    setStyles(featureList, {
      display: 'grid',
      gap: '10px',
      maxHeight: 'min(52vh, 520px)',
      overflow: 'auto',
    });
    for (const feature of state.features) {
      featureList.appendChild(createFeatureSettingsRow(feature));
    }

    panel.appendChild(header);
    panel.appendChild(status);
    panel.appendChild(featureList);
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
