# Sub2API Sidebar Width Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-Sub2API-origin setting for expanded sidebar width with default, compact, and custom pixel modes.

**Architecture:** Reuse the existing origin-scoped storage helpers and settings panel. Apply the width through helper-owned sidebar data attributes plus a single injected style element, so default mode can remove the override without disturbing native inline styles. Keep collapsed-sidebar behavior native by applying width only when the existing sidebar state detector says the sidebar is expanded.

**Tech Stack:** Tampermonkey userscript, vanilla JavaScript split across `sub2api/src/parts/`, lightweight `node:test` VM DOM harness, build script `sub2api/build-userscript.mjs`.

---

## File Structure

- Modify `sub2api/sub2api-helper.user.test.mjs`: add viewport support, an `aside.sidebar` fixture, red tests for width application and settings storage.
- Modify `sub2api/src/parts/00-constants-storage.js`: add storage names, mode values/options, width limits, and a style-element handle.
- Modify `sub2api/src/parts/02-dom-sidebar-selectors.js`: add sidebar element lookup, width normalization, storage accessors, and apply/remove helpers.
- Modify `sub2api/src/parts/03-settings-ui.js`: expose sidebar width state and render the settings row.
- Modify `sub2api/src/parts/06-enhancements-watchers.js`: apply saved width during enhancement and mutation flows.
- Modify `sub2api/README.md`: add the new feature to the feature list.

## Task 1: Runtime Width Tests

**Files:**
- Modify: `sub2api/sub2api-helper.user.test.mjs`

- [ ] **Step 1: Add browser-faithful style custom property support**

Add this helper before `TestElement`:

```js
function createTestStyleDeclaration() {
  return {
    getPropertyValue(name) {
      return this[name] || '';
    },
    removeProperty(name) {
      const previousValue = this[name] || '';
      delete this[name];
      return previousValue;
    },
    setProperty(name, value) {
      this[name] = String(value);
    },
  };
}
```

In the `TestElement` constructor, replace:

```js
    this.style = {};
```

with:

```js
    this.style = createTestStyleDeclaration();
```

- [ ] **Step 2: Add viewport support to the test environment**

In `createTestEnvironment(...)`, add a `viewportWidth = 1280` option:

```js
function createTestEnvironment({
  appConfig = {
    backend_mode_enabled: false,
    custom_menu_items: [],
    site_name: 'Sub2API',
    table_default_page_size: 20,
    table_page_size_options: [10, 20, 50, 100],
    version: '0.1.125',
  },
  gmValues = {},
  now = 0,
  origin = 'https://codex.ciii.club',
  pathname = '/usage',
  preferredColorScheme = 'light',
  savedAutoRefreshValue = 'off',
  viewportWidth = 1280,
} = {}) {
```

After `html.ownerDocument = document;`, set the document width:

```js
  html.clientWidth = viewportWidth;
```

Inside `context.window = { ... }`, add:

```js
    innerWidth: viewportWidth,
```

- [ ] **Step 3: Add an aside sidebar fixture**

Add this method to the object returned by `createTestEnvironment(...)`, next to `createSidebarActionButton` and `createSidebarToggle`:

```js
    createSidebar({ collapsed = false, nativeWidth = '' } = {}) {
      const sidebar = document.createElement('aside');
      sidebar.className = 'sidebar';
      if (nativeWidth) {
        sidebar.style.width = nativeWidth;
      }

      const nav = document.createElement('nav');
      nav.className = 'sidebar-nav';
      const link = document.createElement('a');
      link.className = 'sidebar-link';
      link.setAttribute('href', '/usage');
      link.textContent = '使用记录';
      nav.appendChild(link);

      const toggle = document.createElement('button');
      const syncState = (nextCollapsed) => {
        toggle.className = nextCollapsed ? 'sidebar-link w-full sidebar-link-collapsed' : 'sidebar-link w-full';
        toggle.setAttribute('title', nextCollapsed ? '展开' : '收起');
        toggle.textContent = nextCollapsed ? '展开' : '收起';
      };
      toggle.clickCount = 0;
      toggle.addEventListener('click', () => {
        toggle.clickCount += 1;
        syncState(toggle.getAttribute('title') !== '展开');
      });
      syncState(collapsed);

      sidebar.appendChild(nav);
      sidebar.appendChild(toggle);
      body.appendChild(sidebar);
      return { sidebar, toggle };
    },
```

- [ ] **Step 4: Add failing tests for runtime width application**

Add these tests after the existing sidebar persistence tests:

```js
test('default sidebar width mode leaves expanded sidebar width untouched', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'default',
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: false, nativeWidth: '214px' });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.style.width, '214px');
  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, undefined);
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
});

test('compact sidebar width mode applies the compact width to expanded sidebars', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'compact',
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, 'true');
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '160px');
  assert.ok(environment.document.querySelector('[data-sub2api-sidebar-width-style="true"]'));
});

test('custom sidebar width mode applies a valid custom width', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'custom',
      [getScopedStorageKey(origin, 'sidebar-width-px')]: 184,
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, 'true');
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '184px');
});

test('invalid custom sidebar width does not apply an override', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'custom',
      [getScopedStorageKey(origin, 'sidebar-width-px')]: 400,
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, undefined);
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
});

test('sidebar width override is skipped while the native sidebar is collapsed', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'compact',
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: true });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, undefined);
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
});

test('sidebar width override is skipped below the desktop viewport breakpoint', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'compact',
    },
    origin,
    pathname: '/usage',
    viewportWidth: 760,
  });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, undefined);
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
});
```

- [ ] **Step 5: Run tests to verify RED**

Run:

```bash
node --test sub2api/sub2api-helper.user.test.mjs
```

Expected: fail because sidebar width storage/application functions and data attributes do not exist yet. The failures should be assertions on missing `data-sub2api-sidebar-width-*` behavior, not syntax errors.

## Task 2: Runtime Width Implementation

**Files:**
- Modify: `sub2api/src/parts/00-constants-storage.js`
- Modify: `sub2api/src/parts/02-dom-sidebar-selectors.js`
- Modify: `sub2api/src/parts/06-enhancements-watchers.js`
- Test: `sub2api/sub2api-helper.user.test.mjs`

- [ ] **Step 1: Add constants and state**

In `STORAGE_NAMES`, add:

```js
    SIDEBAR_WIDTH_MODE: 'sidebar-width-mode',
    SIDEBAR_WIDTH_PX: 'sidebar-width-px',
```

Near the theme constants, add:

```js
  const SIDEBAR_WIDTH_MODE_VALUES = {
    DEFAULT: 'default',
    COMPACT: 'compact',
    CUSTOM: 'custom',
  };
  const SIDEBAR_WIDTH_MODE_OPTIONS = [
    {
      description: '不覆盖 Sub2API 原始侧边栏宽度。',
      label: '默认',
      value: SIDEBAR_WIDTH_MODE_VALUES.DEFAULT,
    },
    {
      description: '使用 160px 的紧凑宽度。',
      label: '紧凑',
      value: SIDEBAR_WIDTH_MODE_VALUES.COMPACT,
    },
    {
      description: '使用自定义像素宽度。',
      label: '自定义',
      value: SIDEBAR_WIDTH_MODE_VALUES.CUSTOM,
    },
  ];
  const SIDEBAR_WIDTH_MIN_PX = 120;
  const SIDEBAR_WIDTH_MAX_PX = 260;
  const SIDEBAR_WIDTH_COMPACT_PX = 160;
  const SIDEBAR_WIDTH_DESKTOP_MIN_VIEWPORT_PX = 900;
```

With other module state variables, add:

```js
  let sidebarWidthStyleElement = null;
```

- [ ] **Step 2: Add width helpers**

In `02-dom-sidebar-selectors.js`, after `setSavedSidebarCollapsedState(...)`, add:

```js
  function getSidebarElement() {
    return document.querySelector('aside.sidebar');
  }

  function normalizeSidebarWidthMode(value) {
    const normalizedValue = String(value || '').trim();
    return SIDEBAR_WIDTH_MODE_OPTIONS.some((option) => option.value === normalizedValue)
      ? normalizedValue
      : SIDEBAR_WIDTH_MODE_VALUES.DEFAULT;
  }

  function normalizeSidebarWidthPx(value) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      return null;
    }
    const roundedValue = Math.round(numberValue);
    if (roundedValue < SIDEBAR_WIDTH_MIN_PX || roundedValue > SIDEBAR_WIDTH_MAX_PX) {
      return null;
    }
    return roundedValue;
  }

  function getSavedSidebarWidthMode() {
    return normalizeSidebarWidthMode(getStorageValue(STORAGE_NAMES.SIDEBAR_WIDTH_MODE, SIDEBAR_WIDTH_MODE_VALUES.DEFAULT));
  }

  function setSavedSidebarWidthMode(value) {
    setStorageValue(STORAGE_NAMES.SIDEBAR_WIDTH_MODE, normalizeSidebarWidthMode(value));
  }

  function getSavedSidebarWidthPx() {
    return normalizeSidebarWidthPx(getStorageValue(STORAGE_NAMES.SIDEBAR_WIDTH_PX, SIDEBAR_WIDTH_COMPACT_PX));
  }

  function setSavedSidebarWidthPx(value) {
    const normalizedValue = normalizeSidebarWidthPx(value);
    if (normalizedValue === null) {
      return false;
    }
    setStorageValue(STORAGE_NAMES.SIDEBAR_WIDTH_PX, normalizedValue);
    return true;
  }

  function getEffectiveSidebarWidthPx() {
    const mode = getSavedSidebarWidthMode();
    if (mode === SIDEBAR_WIDTH_MODE_VALUES.COMPACT) {
      return SIDEBAR_WIDTH_COMPACT_PX;
    }
    if (mode === SIDEBAR_WIDTH_MODE_VALUES.CUSTOM) {
      return getSavedSidebarWidthPx();
    }
    return null;
  }

  function getSidebarWidthSettingsState() {
    const mode = getSavedSidebarWidthMode();
    const savedWidthPx = getSavedSidebarWidthPx() || SIDEBAR_WIDTH_COMPACT_PX;
    return {
      effectiveWidthPx: getEffectiveSidebarWidthPx(),
      mode,
      savedWidthPx,
    };
  }

  function isDesktopSidebarWidthViewport() {
    const viewportWidth = Number(window.innerWidth || document.documentElement.clientWidth || 0);
    if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
      return true;
    }
    return viewportWidth >= SIDEBAR_WIDTH_DESKTOP_MIN_VIEWPORT_PX;
  }

  function removeSidebarWidthOverride(sidebar = getSidebarElement()) {
    if (!sidebar) {
      return;
    }
    delete sidebar.dataset.sub2apiSidebarWidthApplied;
    sidebar.style.removeProperty('--sub2api-helper-sidebar-width');
  }

  function ensureSidebarWidthStyleElement() {
    if (sidebarWidthStyleElement?.isConnected) {
      return sidebarWidthStyleElement;
    }

    const existingStyle = document.querySelector('[data-sub2api-sidebar-width-style="true"]');
    if (existingStyle) {
      sidebarWidthStyleElement = existingStyle;
      return sidebarWidthStyleElement;
    }

    const style = document.createElement('style');
    style.dataset.sub2apiSidebarWidthStyle = 'true';
    style.textContent = `
@media (min-width: ${SIDEBAR_WIDTH_DESKTOP_MIN_VIEWPORT_PX}px) {
  aside.sidebar[data-sub2api-sidebar-width-applied="true"] {
    width: var(--sub2api-helper-sidebar-width) !important;
    min-width: var(--sub2api-helper-sidebar-width) !important;
    max-width: var(--sub2api-helper-sidebar-width) !important;
    flex-basis: var(--sub2api-helper-sidebar-width) !important;
  }
}
`;
    document.documentElement.appendChild(style);
    sidebarWidthStyleElement = style;
    return sidebarWidthStyleElement;
  }

  function applySavedSidebarWidth() {
    const sidebar = getSidebarElement();
    if (!sidebar) {
      return false;
    }

    const currentCollapsedState = getCurrentSidebarCollapsedState();
    const effectiveWidthPx = getEffectiveSidebarWidthPx();
    if (currentCollapsedState === true || effectiveWidthPx === null || !isDesktopSidebarWidthViewport()) {
      removeSidebarWidthOverride(sidebar);
      return false;
    }

    ensureSidebarWidthStyleElement();
    sidebar.dataset.sub2apiSidebarWidthApplied = 'true';
    sidebar.style.setProperty('--sub2api-helper-sidebar-width', `${effectiveWidthPx}px`);
    return true;
  }
```

- [ ] **Step 3: Invoke width application**

In `applyPageEnhancements()` in `06-enhancements-watchers.js`, after `restoreSavedSidebarState();`, add:

```js
    applySavedSidebarWidth();
```

In the `MutationObserver` callback inside `installPageSizeWatcher()`, after `restoreSavedSidebarState();`, add:

```js
      applySavedSidebarWidth();
```

- [ ] **Step 4: Run runtime tests to verify GREEN**

Run:

```bash
node --test sub2api/sub2api-helper.user.test.mjs
```

Expected: the runtime width tests from Task 1 pass, and no existing sidebar persistence tests regress.

- [ ] **Step 5: Commit runtime behavior**

Run:

```bash
git add sub2api/src/parts/00-constants-storage.js sub2api/src/parts/02-dom-sidebar-selectors.js sub2api/src/parts/06-enhancements-watchers.js sub2api/sub2api-helper.user.test.mjs
git commit -m "feat: apply sub2api sidebar width setting"
```

## Task 3: Settings UI Tests

**Files:**
- Modify: `sub2api/sub2api-helper.user.test.mjs`

- [ ] **Step 1: Add failing settings-panel tests**

Add these tests near the existing settings-panel tests:

```js
test('settings panel stores compact sidebar width mode for the current origin', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/usage' });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.getMenuCommand('Sub2API Helper 设置')();
  const compactOption = environment
    .findSettingsRoot()
    .querySelector('input[data-sub2api-sidebar-width-mode-option="compact"]');
  assert.ok(compactOption);

  compactOption.checked = true;
  compactOption.dispatchEvent({ type: 'change' });
  await flushMicrotasks();

  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'sidebar-width-mode')), 'compact');
  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, 'true');
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '160px');
  assert.equal(
    environment.findSettingsRoot().querySelector('input[data-sub2api-sidebar-width-mode-option="compact"]').checked,
    true,
  );
});

test('settings panel stores custom sidebar width for the current origin', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/usage' });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.getMenuCommand('Sub2API Helper 设置')();
  const customOption = environment
    .findSettingsRoot()
    .querySelector('input[data-sub2api-sidebar-width-mode-option="custom"]');
  assert.ok(customOption);

  customOption.checked = true;
  customOption.dispatchEvent({ type: 'change' });
  await flushMicrotasks();

  const customInput = environment
    .findSettingsRoot()
    .querySelector('input[data-sub2api-sidebar-width-custom-input="true"]');
  assert.ok(customInput);
  customInput.value = '184';
  customInput.dispatchEvent({ type: 'change' });
  await flushMicrotasks();

  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'sidebar-width-mode')), 'custom');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'sidebar-width-px')), 184);
  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, 'true');
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '184px');
  assert.equal(
    environment.findSettingsRoot().querySelector('input[data-sub2api-sidebar-width-custom-input="true"]').value,
    '184',
  );
});

test('sidebar width storage is isolated per Sub2API origin', async () => {
  const origin = 'https://team-b.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey('https://team-a.sub2api.example.test', 'sidebar-width-mode')]: 'compact',
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'custom',
      [getScopedStorageKey(origin, 'sidebar-width-px')]: 176,
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '176px');
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
node --test sub2api/sub2api-helper.user.test.mjs
```

Expected: fail because `data-sub2api-sidebar-width-mode-option` and `data-sub2api-sidebar-width-custom-input` controls do not exist yet.

## Task 4: Settings UI Implementation

**Files:**
- Modify: `sub2api/src/parts/03-settings-ui.js`
- Test: `sub2api/sub2api-helper.user.test.mjs`

- [ ] **Step 1: Include sidebar width state in settings state**

In `getSettingsState()`, add:

```js
      sidebarWidth: getSidebarWidthSettingsState(),
```

inside the returned object.

- [ ] **Step 2: Add settings UI helpers**

In `03-settings-ui.js`, after `createThemeModeSettingsRow(...)`, add:

```js
  function createSidebarWidthModeOption({ checked, option }) {
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
    input.name = 'sub2api-sidebar-width-mode';
    input.value = option.value;
    input.checked = checked;
    input.setAttribute('data-sub2api-sidebar-width-mode-option', option.value);
    input.addEventListener('change', () => {
      if (!input.checked) {
        return;
      }
      setSavedSidebarWidthMode(option.value);
      if (option.value === SIDEBAR_WIDTH_MODE_VALUES.CUSTOM && !getSavedSidebarWidthPx()) {
        setSavedSidebarWidthPx(SIDEBAR_WIDTH_COMPACT_PX);
      }
      applySettingsStateChange();
    });

    const labelText = document.createElement('span');
    labelText.textContent = option.label;

    const hint = document.createElement('span');
    hint.textContent = option.description;
    setStyles(hint, {
      color: '#64748b',
      fontSize: '12px',
      lineHeight: '1.35',
    });

    title.appendChild(input);
    title.appendChild(labelText);
    label.appendChild(title);
    label.appendChild(hint);
    return label;
  }

  function createSidebarWidthSettingsRow(sidebarWidth) {
    const row = document.createElement('div');
    row.setAttribute('data-sub2api-sidebar-width-row', 'true');
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
    title.textContent = '侧边栏宽度';
    setStyles(title, {
      color: '#0f172a',
      fontSize: '14px',
      fontWeight: '800',
    });

    const hint = document.createElement('span');
    hint.textContent = `仅影响当前 Sub2API 域名，桌面窗口生效，自定义范围 ${SIDEBAR_WIDTH_MIN_PX}-${SIDEBAR_WIDTH_MAX_PX}px。`;
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

    for (const option of SIDEBAR_WIDTH_MODE_OPTIONS) {
      controls.appendChild(
        createSidebarWidthModeOption({
          checked: sidebarWidth.mode === option.value,
          option,
        }),
      );
    }

    const customControl = document.createElement('label');
    setStyles(customControl, {
      alignItems: 'center',
      color: '#334155',
      display: 'inline-flex',
      fontSize: '12px',
      fontWeight: '700',
      gap: '8px',
    });

    const customLabel = document.createElement('span');
    customLabel.textContent = '自定义 px';

    const customInput = document.createElement('input');
    customInput.type = 'number';
    customInput.min = String(SIDEBAR_WIDTH_MIN_PX);
    customInput.max = String(SIDEBAR_WIDTH_MAX_PX);
    customInput.step = '1';
    customInput.value = String(sidebarWidth.savedWidthPx);
    customInput.disabled = sidebarWidth.mode !== SIDEBAR_WIDTH_MODE_VALUES.CUSTOM;
    customInput.setAttribute('data-sub2api-sidebar-width-custom-input', 'true');
    setStyles(customInput, {
      border: '1px solid rgba(148, 163, 184, 0.45)',
      borderRadius: '8px',
      color: '#0f172a',
      font: '13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: '7px 9px',
      width: '88px',
    });
    customInput.addEventListener('change', () => {
      const widthPx = normalizeSidebarWidthPx(customInput.value);
      if (widthPx !== null) {
        setSavedSidebarWidthPx(widthPx);
        setSavedSidebarWidthMode(SIDEBAR_WIDTH_MODE_VALUES.CUSTOM);
      }
      applySettingsStateChange();
    });

    customControl.appendChild(customLabel);
    customControl.appendChild(customInput);
    textWrap.appendChild(title);
    textWrap.appendChild(hint);
    row.appendChild(textWrap);
    row.appendChild(controls);
    row.appendChild(customControl);
    return row;
  }
```

- [ ] **Step 3: Render the width row near sidebar feature controls**

In `refreshSettingsPanel()`, replace:

```js
    if (state.isSub2apiPage) {
      featureGroups.appendChild(createThemeModeSettingsRow(state.themeMode));
    }
    for (const feature of standaloneFeatures) {
      featureGroups.appendChild(createFeatureSettingsRow(feature));
    }
```

with:

```js
    for (const feature of standaloneFeatures) {
      featureGroups.appendChild(createFeatureSettingsRow(feature));
    }
    if (state.isSub2apiPage) {
      featureGroups.appendChild(createSidebarWidthSettingsRow(state.sidebarWidth));
      featureGroups.appendChild(createThemeModeSettingsRow(state.themeMode));
    }
```

- [ ] **Step 4: Run settings tests to verify GREEN**

Run:

```bash
node --test sub2api/sub2api-helper.user.test.mjs
```

Expected: settings UI tests pass, including storage and immediate application after changing settings.

- [ ] **Step 5: Commit settings UI behavior**

Run:

```bash
git add sub2api/src/parts/03-settings-ui.js sub2api/sub2api-helper.user.test.mjs
git commit -m "feat: add sub2api sidebar width settings UI"
```

## Task 5: Documentation and Full Verification

**Files:**
- Modify: `sub2api/README.md`

- [ ] **Step 1: Update README feature list**

In `sub2api/README.md`, add this bullet after the sidebar state memory bullet:

```md
- 侧边栏宽度设置：按 Sub2API 域名保存默认、紧凑或自定义 px 宽度。
```

- [ ] **Step 2: Commit documentation**

Run:

```bash
git add sub2api/README.md
git commit -m "docs: document sub2api sidebar width setting"
```

- [ ] **Step 3: Run full verification**

Run:

```bash
node sub2api/build-userscript.mjs
node sub2api/build-userscript.mjs --check
node --test sub2api/sub2api-helper.user.test.mjs
node --check dist/sub2api-helper.user.js
node --check sub2api/build-userscript.mjs
```

Expected:

- `node sub2api/build-userscript.mjs` exits 0 and writes ignored `dist/sub2api-helper.user.js`
- `node sub2api/build-userscript.mjs --check` exits 0
- `node --test sub2api/sub2api-helper.user.test.mjs` exits 0 with all tests passing
- both `node --check` commands exit 0

- [ ] **Step 4: Check final git status**

Run:

```bash
git status --short
```

Expected: source/doc changes are committed. `dist/` may exist as an ignored build output and should not be committed.

## Self-Review Notes

- Spec coverage: runtime application, responsive guardrail, per-origin storage, settings UI, invalid values, collapsed behavior, and documentation are each covered by tasks.
- No placeholders: every test and implementation step names exact files and code.
- Type consistency: storage keys use `sidebar-width-mode` and `sidebar-width-px`; mode values are `default`, `compact`, and `custom`; tests assert helper-owned `data-sub2api-sidebar-width-*` attributes and CSS variable names used by implementation steps.
