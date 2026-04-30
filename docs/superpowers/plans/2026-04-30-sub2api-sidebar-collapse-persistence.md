# Sub2API Sidebar Collapse Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the native Sub2API sidebar collapsed or expanded state across all management pages for each Sub2API deployment origin.

**Architecture:** Keep the feature inside the existing userscript. Reuse the current origin-scoped storage helpers, infer sidebar state from the native bottom toggle text (`收起` means expanded, `展开` means collapsed), restore by clicking the native toggle when needed, and save user changes through the existing document click hook.

**Tech Stack:** Tampermonkey GM storage APIs, browser `localStorage` fallback, vanilla DOM APIs, `MutationObserver`, `node:test`, the existing lightweight DOM test harness.

---

## File Map

- Modify: `sub2api/sub2api-helper.user.js`
  Purpose: add the storage key, sidebar DOM helpers, restore behavior, mutation retry, and click-save hook.
- Modify: `sub2api/sub2api-helper.user.test.mjs`
  Purpose: extend the test DOM harness with a fake native sidebar toggle and cover restore/save behavior.
- Reference: `docs/superpowers/specs/2026-04-30-sub2api-sidebar-collapse-persistence-design.md`
  Purpose: approved scope and behavior.

### Task 1: Add Sidebar Restore Failing Tests

**Files:**
- Modify: `sub2api/sub2api-helper.user.test.mjs`
- Reference: `docs/superpowers/specs/2026-04-30-sub2api-sidebar-collapse-persistence-design.md`

- [ ] **Step 1: Add a fake native sidebar toggle helper to the test environment**

In the object returned by `createTestEnvironment`, add this helper near `createSelectControl`:

```js
    createSidebarToggle({ collapsed = false } = {}) {
      const button = document.createElement('button');
      button.textContent = collapsed ? '展开' : '收起';
      button.clickCount = 0;
      button.addEventListener('click', () => {
        button.clickCount += 1;
        button.textContent = button.textContent.trim() === '展开' ? '收起' : '展开';
      });
      body.appendChild(button);
      return button;
    },
```

- [ ] **Step 2: Write the failing restore test for saved collapsed state**

Add this test after `createUsageFingerprint` and before unrelated auto-refresh tests:

```js
test('restores a saved collapsed sidebar across the Sub2API management UI', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-collapsed')]: true,
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const sidebarToggle = environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: scriptPath.pathname });
  await flushMicrotasks();

  assert.equal(sidebarToggle.textContent, '展开');
  assert.equal(sidebarToggle.clickCount, 1);
});
```

- [ ] **Step 3: Write the failing restore test for saved expanded state**

Add the complementary test:

```js
test('restores a saved expanded sidebar across the Sub2API management UI', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-collapsed')]: false,
    },
    origin,
    pathname: '/dashboard',
  });
  environment.createDatePicker({
    activePresetLabel: '近 7 天',
    presetLabels: ['今天', '近 7 天'],
    triggerText: '近 7 天',
  });
  environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按天',
  });
  const sidebarToggle = environment.createSidebarToggle({ collapsed: true });

  vm.runInContext(source, environment.vmContext, { filename: scriptPath.pathname });
  await flushMicrotasks();

  assert.equal(sidebarToggle.textContent, '收起');
  assert.equal(sidebarToggle.clickCount, 1);
});
```

- [ ] **Step 4: Run the targeted tests and verify red**

Run:

```bash
node --test sub2api/sub2api-helper.user.test.mjs --test-name-pattern "restores a saved .* sidebar"
```

Expected: both new tests fail because the sidebar restore feature does not exist yet. The expected assertion failure is that `sidebarToggle.textContent` remains unchanged.

### Task 2: Implement Sidebar Storage And Restore

**Files:**
- Modify: `sub2api/sub2api-helper.user.js`
- Test: `sub2api/sub2api-helper.user.test.mjs`

- [ ] **Step 1: Ask codebase retrieval for exact edit context before production edits**

Use the codebase retrieval tool for `sub2api/sub2api-helper.user.js`, asking for the low-level details around `STORAGE_NAMES`, `getStorageValue`, `applyPageEnhancements`, `installPageSizeWatcher`, and `installClickHooks`.

Expected: identify the exact insertion points for the new storage constant, DOM helpers, restore call, and mutation retry.

- [ ] **Step 2: Add the new storage name and save delay constant**

In `sub2api/sub2api-helper.user.js`, extend the constants near the top:

```js
  const STORAGE_NAMES = {
    AUTO_REFRESH: 'auto-refresh-ms',
    DASHBOARD_DATE_RANGE: 'dashboard-date-range',
    DASHBOARD_GRANULARITY: 'dashboard-granularity',
    PAGE_SIZE: 'usage-page-size',
    SIDEBAR_COLLAPSED: 'sidebar-collapsed',
    USAGE_DATE_RANGE: 'usage-date-range',
  };
```

Add this near the existing small interaction delays:

```js
  const SIDEBAR_STATE_SAVE_DELAY_MS = 150;
```

Do not add a legacy storage key for `SIDEBAR_COLLAPSED`; it is a new generalized Sub2API preference.

- [ ] **Step 3: Add sidebar state helpers near the other DOM helpers**

Add these helpers after `getThemeToggleButton()`:

```js
  function getSidebarToggleButton() {
    return [...document.querySelectorAll('button')].find((button) => {
      const text = button.textContent.trim();
      return text === '收起' || text === '展开';
    }) || null;
  }

  function getSidebarCollapsedStateFromButton(button) {
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
```

- [ ] **Step 4: Add idempotent restore and delayed save helpers**

Add these helpers after the saved-state helpers:

```js
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
```

- [ ] **Step 5: Call restore from page enhancement and mutation paths**

At the top of `applyPageEnhancements`, immediately after theme sync, call:

```js
    restoreSavedSidebarState();
```

In the `MutationObserver` callback inside `installPageSizeWatcher`, add the same call before range and select restoration:

```js
      restoreSavedSidebarState();
      restoreSavedRange();
      handlePageSizeValueChange();
      handleDashboardGranularityValueChange();
```

- [ ] **Step 6: Run the sidebar restore tests and verify green**

Run:

```bash
node --test sub2api/sub2api-helper.user.test.mjs --test-name-pattern "restores a saved .* sidebar"
```

Expected: both sidebar restore tests pass.

### Task 3: Save User Toggle Choices And Verify Regressions

**Files:**
- Modify: `sub2api/sub2api-helper.user.js`
- Modify: `sub2api/sub2api-helper.user.test.mjs`

- [ ] **Step 1: Write the failing click-save test**

Add this test near the restore tests:

```js
test('stores sidebar collapsed state after the native toggle is clicked', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/usage' });
  createUsageFingerprint(environment);
  const sidebarToggle = environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: scriptPath.pathname });
  await flushMicrotasks();

  environment.sendDocumentClick(sidebarToggle);
  sidebarToggle.click();
  await flushMicrotasks();

  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'sidebar-collapsed')), true);
});
```

- [ ] **Step 2: Write the origin isolation test**

Add this test to prove the existing scoped storage model is used:

```js
test('sidebar collapsed storage is isolated per Sub2API origin', async () => {
  const origin = 'https://team-b.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey('https://team-a.sub2api.example.test', 'sidebar-collapsed')]: true,
      [getScopedStorageKey(origin, 'sidebar-collapsed')]: false,
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const sidebarToggle = environment.createSidebarToggle({ collapsed: true });

  vm.runInContext(source, environment.vmContext, { filename: scriptPath.pathname });
  await flushMicrotasks();

  assert.equal(sidebarToggle.textContent, '收起');
  assert.equal(sidebarToggle.clickCount, 1);
});
```

- [ ] **Step 3: Run the new save/isolation tests and verify red**

Run:

```bash
node --test sub2api/sub2api-helper.user.test.mjs --test-name-pattern "sidebar collapsed"
```

Expected: the click-save test fails because `installClickHooks` does not yet save sidebar state. The origin isolation test may pass after Task 2; keep it as regression coverage.

- [ ] **Step 4: Add sidebar save handling to the existing click hook**

Inside `installClickHooks()`, after the `target instanceof Element` guard and before the page-size/granularity branches, add:

```js
        if (isSidebarToggleTarget(target)) {
          saveCurrentSidebarStateSoon();
        }
```

Do not return after scheduling this save; the native button handler still needs to run and other click handling should remain unaffected.

- [ ] **Step 5: Run the new save/isolation tests and verify green**

Run:

```bash
node --test sub2api/sub2api-helper.user.test.mjs --test-name-pattern "sidebar collapsed"
```

Expected: all sidebar collapsed tests pass.

- [ ] **Step 6: Run the full userscript test suite**

Run:

```bash
node --test sub2api/sub2api-helper.user.test.mjs
```

Expected: all tests pass.

- [ ] **Step 7: Run syntax verification**

Run:

```bash
node --check sub2api/sub2api-helper.user.js
```

Expected: command exits successfully with no output.

- [ ] **Step 8: Commit implementation**

Run:

```bash
git status --short
git add sub2api/sub2api-helper.user.js sub2api/sub2api-helper.user.test.mjs
git commit -m "feat: persist sub2api sidebar state"
```

Expected: one implementation commit containing only the userscript and test changes.
