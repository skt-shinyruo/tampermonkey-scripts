# Ciii Codex Usage Auto Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent auto-refresh control next to the existing `刷新` button on `https://codex.ciii.club/usage`, while preserving the current date-range memory behavior and triggering refreshes by clicking the page's existing refresh button.

**Architecture:** Keep the change inside the existing userscript `sub2api/ciii-codex-usage-enhancer.user.js`. Extend the current storage helpers so date-range state and auto-refresh state are stored independently, add idempotent DOM helpers that inject a compact menu button beside `刷新`, and manage a single `setInterval` timer that survives SPA route changes by reinitializing on `/usage`.

**Tech Stack:** Tampermonkey GM storage APIs, browser `localStorage`, vanilla DOM APIs, `MutationObserver`, `setInterval`, manual browser verification, `node --check` for syntax validation.

---

## File Map

- Modify: `sub2api/ciii-codex-usage-enhancer.user.js`
  Purpose: existing userscript; will continue to own date-range persistence and will also own auto-refresh storage, UI, and timer lifecycle.
- Reference: `docs/superpowers/specs/2026-04-23-ciii-codex-auto-refresh-design.md`
  Purpose: approved behavior and scope guard.
- No test files will be created.
  Reason: the workspace has no package manager metadata, no browser test harness, and the approved spec explicitly allows manual verification for this userscript enhancement.
- No git commit steps can be executed in this workspace.
  Reason: `/home/feng/code/tampermonkey` is not a git repository.

### Task 1: Split Storage Responsibilities And Add Auto-Refresh State

**Files:**
- Modify: `sub2api/ciii-codex-usage-enhancer.user.js`
- Reference: `docs/superpowers/specs/2026-04-23-ciii-codex-auto-refresh-design.md`

- [ ] **Step 1: Confirm the current failing state in the browser**

Open `https://codex.ciii.club/usage` with the current userscript loaded.

Expected baseline:
- there is no `自动刷新` button beside `刷新`
- revisiting `/usage` does not resume any timed refresh behavior

This is the required red state for the new feature.

- [ ] **Step 2: Add separate storage keys, interval constants, and timer state**

Modify the top of `sub2api/ciii-codex-usage-enhancer.user.js` so the script has independent storage for date range and auto-refresh state, plus a single timer handle.

```js
  const DATE_RANGE_STORAGE_KEY = 'ciii-codex-usage-date-range';
  const AUTO_REFRESH_STORAGE_KEY = 'ciii-codex-auto-refresh-ms';
  const WAIT_INTERVAL_MS = 250;
  const WAIT_TIMEOUT_MS = 15000;
  const AUTO_REFRESH_OPTIONS = [
    { value: 'off', label: '关闭', ms: 0 },
    { value: '5000', label: '5s', ms: 5000 },
    { value: '10000', label: '10s', ms: 10000 },
    { value: '30000', label: '30s', ms: 30000 },
    { value: '60000', label: '1分钟', ms: 60000 },
  ];

  let restoreAttempted = false;
  let autoRefreshTimer = null;
  let autoRefreshButton = null;
  let autoRefreshMenu = null;
```

- [ ] **Step 3: Replace the single-purpose store with keyed storage helpers**

Refactor the existing `store` object into generic helpers so the script can read and write both date-range and auto-refresh values.

```js
  const storage = {
    get(key, fallback = null) {
      try {
        return GM_getValue(key, fallback);
      } catch (error) {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
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
```

Update existing date-range calls to use `DATE_RANGE_STORAGE_KEY`:

```js
    const savedRange = storage.get(DATE_RANGE_STORAGE_KEY, null);
```

```js
            storage.set(DATE_RANGE_STORAGE_KEY, draft);
```

```js
          storage.delete(DATE_RANGE_STORAGE_KEY);
```

- [ ] **Step 4: Add helpers that normalize the saved auto-refresh value**

Insert the following helpers after the existing date-range helpers so all later timer logic uses one normalized representation.

```js
  function getAutoRefreshOption(value) {
    return AUTO_REFRESH_OPTIONS.find((option) => option.value === String(value)) || AUTO_REFRESH_OPTIONS[0];
  }

  function getSavedAutoRefreshValue() {
    const savedValue = storage.get(AUTO_REFRESH_STORAGE_KEY, 'off');
    return getAutoRefreshOption(savedValue).value;
  }

  function setSavedAutoRefreshValue(value) {
    storage.set(AUTO_REFRESH_STORAGE_KEY, getAutoRefreshOption(value).value);
  }

  function getAutoRefreshLabel(value) {
    return getAutoRefreshOption(value).label;
  }
```

- [ ] **Step 5: Run a syntax check after the storage refactor**

Run:

```bash
node --check sub2api/ciii-codex-usage-enhancer.user.js
```

Expected: command exits successfully with no output.

- [ ] **Step 6: Record the repository limitation instead of committing**

Run:

```bash
git -C /home/feng/code/tampermonkey rev-parse --show-toplevel
```

Expected:

```text
fatal: not a git repository (or any of the parent directories): .git
```

Do not fabricate a commit step in this workspace.

### Task 2: Inject The Auto-Refresh Button And Menu Beside `刷新`

**Files:**
- Modify: `sub2api/ciii-codex-usage-enhancer.user.js`

- [ ] **Step 1: Add DOM helpers to find the existing action area and refresh button**

Add these helpers near the existing DOM query helpers:

```js
  function getRefreshButton() {
    return findButtonByText('刷新');
  }

  function getActionButtonRow() {
    const refreshButton = getRefreshButton();
    return refreshButton?.parentElement || null;
  }
```

These helpers intentionally lean on visible button text because the current script already uses the same pattern for `应用`.

- [ ] **Step 2: Add button-label and menu-close helpers**

Insert helpers that keep the control state idempotent:

```js
  function closeAutoRefreshMenu() {
    autoRefreshMenu?.remove();
    autoRefreshMenu = null;
  }

  function updateAutoRefreshButtonLabel(value) {
    if (!autoRefreshButton) {
      return;
    }
    autoRefreshButton.textContent = `自动刷新: ${getAutoRefreshLabel(value)}`;
  }
```

- [ ] **Step 3: Create the menu renderer with all approved options**

Add a function that builds the lightweight menu and highlights the active option.

```js
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
      item.style.border = 'none';
      item.style.background = option.value === currentValue ? '#e6fffb' : 'transparent';
      item.style.color = option.value === currentValue ? '#0f766e' : '#334155';
      item.style.padding = '8px 10px';
      item.style.borderRadius = '8px';
      item.style.textAlign = 'left';
      item.style.cursor = 'pointer';
      item.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelect(option.value);
      });
      menu.appendChild(item);
    }

    return menu;
  }
```

- [ ] **Step 4: Add an idempotent installer that injects the new control to the right of `刷新`**

Create one installer that can safely run on page load and on SPA re-renders:

```js
  function installAutoRefreshControl() {
    const actionRow = getActionButtonRow();
    const refreshButton = getRefreshButton();
    if (!actionRow || !refreshButton) {
      return false;
    }

    const existing = actionRow.querySelector('[data-ciii-auto-refresh-root="true"]');
    if (existing) {
      autoRefreshButton = existing.querySelector('button');
      updateAutoRefreshButtonLabel(getSavedAutoRefreshValue());
      return true;
    }

    const root = document.createElement('div');
    root.dataset.ciiiAutoRefreshRoot = 'true';
    root.style.position = 'relative';
    root.style.display = 'inline-flex';

    const refreshButtonStyle = window.getComputedStyle(refreshButton);
    const button = document.createElement('button');
    button.type = 'button';
    button.style.marginLeft = '12px';
    button.style.height = refreshButtonStyle.height;
    button.style.padding = refreshButtonStyle.padding;
    button.style.borderRadius = refreshButtonStyle.borderRadius;
    button.style.border = refreshButtonStyle.border;
    button.style.background = refreshButtonStyle.background;
    button.style.color = refreshButtonStyle.color;
    button.style.font = refreshButtonStyle.font;
    button.style.cursor = 'pointer';

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
    });

    root.appendChild(button);
    refreshButton.insertAdjacentElement('afterend', root);
    return true;
  }
```

- [ ] **Step 5: Add a document-level outside-click hook for the menu**

Use one global listener, not one listener per render:

```js
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
```

- [ ] **Step 6: Run a syntax check after the UI injection work**

Run:

```bash
node --check sub2api/ciii-codex-usage-enhancer.user.js
```

Expected: command exits successfully with no output.

### Task 3: Start, Stop, And Restore Auto Refresh Across `/usage` Re-Entry

**Files:**
- Modify: `sub2api/ciii-codex-usage-enhancer.user.js`

- [ ] **Step 1: Add timer lifecycle helpers that guarantee only one interval**

Insert the following helpers below the UI code:

```js
  function stopAutoRefresh() {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
  }

  function triggerRefresh() {
    getRefreshButton()?.click();
  }

  function startAutoRefresh(value) {
    const option = getAutoRefreshOption(value);
    stopAutoRefresh();
    updateAutoRefreshButtonLabel(option.value);
    if (!option.ms) {
      return;
    }
    autoRefreshTimer = window.setInterval(() => {
      if (!location.pathname.startsWith('/usage')) {
        return;
      }
      triggerRefresh();
    }, option.ms);
  }

  function applyAutoRefreshValue(value) {
    const normalizedValue = getAutoRefreshOption(value).value;
    setSavedAutoRefreshValue(normalizedValue);
    startAutoRefresh(normalizedValue);
  }

  function restoreAutoRefresh() {
    const value = getSavedAutoRefreshValue();
    updateAutoRefreshButtonLabel(value);
    startAutoRefresh(value);
  }
```

- [ ] **Step 2: Add an installer loop that retries until the action area is present**

The page is dynamic, so the button installer must tolerate delayed rendering:

```js
  async function ensureAutoRefreshControl() {
    const installed = installAutoRefreshControl();
    if (installed) {
      return true;
    }

    const actionRow = await waitFor(() => getActionButtonRow());
    if (!actionRow) {
      return false;
    }

    return installAutoRefreshControl();
  }
```

- [ ] **Step 3: Wire the control restore into initial startup and SPA route changes**

Replace the bottom-level startup with a single orchestrator:

```js
  async function restoreUsageEnhancements() {
    if (!location.pathname.startsWith('/usage')) {
      stopAutoRefresh();
      closeAutoRefreshMenu();
      return;
    }

    await restoreSavedRange();
    const controlReady = await ensureAutoRefreshControl();
    if (controlReady) {
      restoreAutoRefresh();
    }
  }
```

Update the URL watcher so revisiting `/usage` reinstalls the control and timer from storage:

```js
  function installUrlWatcher() {
    let lastHref = location.href;
    const observer = new MutationObserver(() => {
      if (location.href === lastHref) {
        return;
      }

      lastHref = location.href;
      restoreAttempted = false;
      restoreUsageEnhancements();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
```

Update startup calls at the end of the file:

```js
  installClickHooks();
  installAutoRefreshMenuCloseHook();
  installUrlWatcher();
  restoreUsageEnhancements();
```

- [ ] **Step 4: Ensure action-row re-renders do not leave stale button references**

Strengthen `installAutoRefreshControl()` so it resets stale globals if the old node was removed:

```js
    if (autoRefreshButton && !autoRefreshButton.isConnected) {
      autoRefreshButton = null;
    }
    if (autoRefreshMenu && !autoRefreshMenu.isConnected) {
      autoRefreshMenu = null;
    }
```

Place this at the top of `installAutoRefreshControl()` before it queries for an existing root.

- [ ] **Step 5: Run the final syntax check**

Run:

```bash
node --check sub2api/ciii-codex-usage-enhancer.user.js
```

Expected: command exits successfully with no output.

- [ ] **Step 6: Manually verify the approved behavior in the browser**

Perform this checklist on `https://codex.ciii.club/usage`:

1. Confirm the existing date-range memory still works after clicking `应用`.
2. Confirm a new button labeled `自动刷新: 关闭` appears immediately to the right of `刷新`.
3. Open the new menu and choose `5s`; confirm the button label becomes `自动刷新: 5s`.
4. Wait one interval and confirm the page behaves exactly as if `刷新` had been clicked manually.
5. Change the interval to `10s`, then `30s`, then `1分钟`; confirm only one refresh cycle is active each time.
6. Reload the page; confirm the selected interval is restored and auto-refresh resumes.
7. Navigate away from `/usage` and back using the site's SPA navigation; confirm the button is reinserted and the saved interval resumes.
8. Choose `关闭`; confirm timed refreshes stop and that state survives a reload.
9. Click `重置`; confirm only the date-range memory clears and the saved auto-refresh interval remains unchanged.

- [ ] **Step 7: Record the no-commit limitation at the end of execution**

Run:

```bash
git -C /home/feng/code/tampermonkey rev-parse --show-toplevel
```

Expected:

```text
fatal: not a git repository (or any of the parent directories): .git
```

Stop after verification. There is no repository to commit into.
