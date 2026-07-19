# Sub2API TPS Latency Grid Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render TPS as a third row in the latest Sub2API latency grid, aligned with the native labels and values and using the native latency colors.

**Architecture:** Keep the existing API-row mapping, streaming eligibility, and TPS formula. Extend the latency DOM lookup to retain the native grid, total-duration label, and total-duration value; inject one TPS label/value pair as direct grid children and copy the native classes. Remove the old value-only gray styling while retaining selectable text behavior.

**Tech Stack:** Vanilla JavaScript userscript, DOM APIs, Node.js built-in `node:test`, `sub2api/build-userscript.mjs`.

---

## Files and Responsibilities

- Modify `sub2api/sub2api-helper.user.test.mjs` to model native label/value classes and assert the TPS pair is a direct sibling pair in the latency grid.
- Modify `sub2api/src/parts/06-usage-table-enhancements.js` to create, update, and remove the marked TPS label/value pair and copy native classes.
- Regenerate `dist/sub2api-helper.user.js` with the existing build script for plugin testing; do not add the generated artifact to git unless repository tracking changes.
- Do not modify `/home/feng/code/opensource/sub2api`; it remains read-only reference material.

### Task 1: Add failing DOM-layout and color tests

**Files:**
- Modify: `sub2api/sub2api-helper.user.test.mjs:1154-1255,2320-2833`

- [ ] **Step 1: Expose the native latency grid and class-bearing elements in the fixture.**

In `createUsageEnhancementTable`, keep `latency` as the only current latency
column. Give the native fixture the same class boundaries as the latest
frontend and store the elements needed by assertions:

```js
const latencyElements = new Map();

const appendLatencyContent = (td, row) => {
  const wrapper = document.createElement('div');
  const grid = document.createElement('div');
  const firstLabel = document.createElement('span');
  const firstValue = document.createElement('span');
  const totalLabel = document.createElement('span');
  const totalValue = document.createElement('span');
  const nativeDurationText = document.createElement('span');

  grid.className = 'grid grid-cols-[max-content_max-content]';
  firstLabel.className = 'text-gray-400 dark:text-gray-500';
  totalLabel.className = 'text-gray-400 dark:text-gray-500';
  firstValue.className = 'font-medium tabular-nums text-amber-500';
  totalValue.className = 'font-medium tabular-nums text-emerald-500';
  firstLabel.textContent = '首字';
  firstValue.textContent = row.firstToken ?? '-';
  totalLabel.textContent = '总耗时';
  nativeDurationText.textContent = row.duration ?? '-';
  totalValue.appendChild(nativeDurationText);
  grid.appendChild(firstLabel);
  grid.appendChild(firstValue);
  grid.appendChild(totalLabel);
  grid.appendChild(totalValue);
  wrapper.appendChild(grid);
  td.appendChild(wrapper);
  return { grid, totalLabel, totalValue };
};
```

Store that object for `latency` rows and expose `getLatencyElements(rowId)`;
keep `getLatencyDurationValue` returning `.totalValue` for existing tests that
still inspect the native duration node.

- [ ] **Step 2: Change the valid streaming assertion to require a separate TPS row.**

In `usage table adds TPS below total duration for streaming rows from usage API
data`, assert the following after the API response is applied:

```js
const { grid, totalLabel, totalValue } = table.getLatencyElements(101);
const tpsLabel = grid.querySelector('[data-sub2api-usage-latency-tps-label="true"]');
const tpsValue = grid.querySelector('[data-sub2api-usage-latency-tps="true"]');

assert.equal(tpsLabel.textContent, 'TPS');
assert.equal(tpsValue.textContent, '52.94');
assert.equal(tpsLabel.parentElement, grid);
assert.equal(tpsValue.parentElement, grid);
assert.equal(tpsLabel.nextElementSibling, tpsValue);
assert.equal(tpsLabel.className, totalLabel.className);
assert.equal(tpsValue.className, totalValue.className);
assert.equal(totalValue.querySelector('[data-sub2api-usage-latency-tps="true"]'), null);
assert.match(totalValue.textContent, /20\.58s/);
assert.equal(table.getCell(101, 'latency').dataset.sub2apiUsageTpsApplied, 'true');
```

This must fail before production changes because the current implementation
has only one marked value nested below `totalValue` and includes the `TPS`
suffix in its text.

- [ ] **Step 3: Update cleanup, idempotence, and stable-write assertions.**

For invalid rows, assert there are zero marked TPS labels and values in each
latency cell while the native `首字` and `总耗时` text remains. For repeated
observer passes, assert exactly one marked TPS label and one marked TPS value in
the grid. In the stable-write test, select the value from the grid rather than
from `durationValue`; retain the zero-write assertions for the native duration
and TPS value text.

- [ ] **Step 4: Assert style no longer forces a gray TPS color.**

Keep the style test's assertions for `user-select: text` and
`-webkit-user-select: text`. Change it to assert the style block does not
contain the old `color: #64748b` or `color: #94a3b8` declarations for the TPS
selector; class equality in Step 2 verifies that light/dark and severity
colors come from the native grid.

- [ ] **Step 5: Run the focused tests and verify RED.**

Run:

```bash
node --test --test-name-pattern="usage table" sub2api/sub2api-helper.user.test.mjs
```

Expected result: the new direct-sibling, label-text, suffix, and class-copy
assertions fail against the current nested gray implementation. Do not change
production code until this failure is observed.

### Task 2: Inject TPS as styled siblings in the native grid

**Files:**
- Modify: `sub2api/src/parts/06-usage-table-enhancements.js:24-309`

- [ ] **Step 1: Return the native grid and paired label/value elements.**

Replace the value-only lookup with a helper that returns the exact label, its
following sibling value, and the label's parent grid:

```js
function getUsageLatencyEntry(cell, labelMatcher) {
  const label = [...cell.querySelectorAll('span')]
    .find((candidate) => labelMatcher(normalizeUsageCellText(candidate)));
  if (!label?.parentElement) {
    return null;
  }

  const siblings = [...label.parentElement.children];
  const value = siblings[siblings.indexOf(label) + 1] || null;
  return value ? { grid: label.parentElement, label, value } : null;
}

function getUsageLatencyElements(cell) {
  const firstToken = getUsageLatencyEntry(cell, (text) =>
    text === '首字' || text.toLowerCase() === 'first',
  );
  const duration = getUsageLatencyEntry(cell, (text) =>
    text === '总耗时' || text.toLowerCase() === 'total',
  );
  return {
    grid: duration?.grid || firstToken?.grid || null,
    firstTokenLabel: firstToken?.label || null,
    firstTokenValue: firstToken?.value || null,
    durationLabel: duration?.label || null,
    durationValue: duration?.value || null,
  };
}
```

Keep the existing exact localized label matching and API-only calculation.

- [ ] **Step 2: Create and maintain one direct TPS label/value pair.**

Change `enhanceUsageLatencyCell` to pass the full element object to the
injection helper. When the row is ineligible, remove both marked selectors
from the grid and clear `sub2apiUsageTpsApplied`. When eligible, create or
reuse direct grid children, remove any stale value nested in the native duration
value, move the pair to the grid end, copy classes, and update text only when it
changed:

```js
function applyUsageLatencyTps({ grid, durationLabel, durationValue }, tps) {
  if (!grid || !durationValue) {
    return;
  }

  removeUsageLatencyTps(durationValue);
  const markedValues = [...grid.querySelectorAll('[data-sub2api-usage-latency-tps="true"]')]
    .filter((element) => element.parentElement === grid);
  const markedLabels = [...grid.querySelectorAll('[data-sub2api-usage-latency-tps-label="true"]')]
    .filter((element) => element.parentElement === grid);
  const tpsValue = markedValues[0] || document.createElement('span');
  const tpsLabel = markedLabels[0] || document.createElement('span');

  for (const duplicate of markedValues.slice(1)) duplicate.remove();
  for (const duplicate of markedLabels.slice(1)) duplicate.remove();

  tpsLabel.dataset.sub2apiUsageLatencyTpsLabel = 'true';
  tpsValue.dataset.sub2apiUsageLatencyTps = 'true';
  tpsLabel.className = durationLabel?.className || '';
  tpsValue.className = durationValue.className || '';
  grid.appendChild(tpsLabel);
  grid.appendChild(tpsValue);
  setUsageTextIfChanged(tpsLabel, 'TPS');
  setUsageTextIfChanged(tpsValue, tps.toFixed(2));
}
```

Use a direct-grid filter so repeated passes do not mistake nested native
content for the current pair. `removeUsageLatencyTps` must remove both the
value and label selectors and must never clear native `textContent`.

- [ ] **Step 3: Remove only the helper-owned color override from CSS.**

Replace the current TPS block with selectable-text-only rules that apply to
both marked nodes:

```css
[data-sub2api-usage-latency-tps="true"],
[data-sub2api-usage-latency-tps-label="true"] {
  user-select: text;
  -webkit-user-select: text;
  white-space: nowrap;
}
```

Do not set `color`, `font-size`, `font-weight`, `display`, or `margin-top` on
the TPS selectors. The copied native classes must own those visual properties.

- [ ] **Step 4: Run the focused tests and verify GREEN.**

Run:

```bash
node --test --test-name-pattern="usage table" sub2api/sub2api-helper.user.test.mjs
```

Expected result: all usage-table tests pass, including direct sibling order,
class/color inheritance, invalid-row cleanup, legacy exclusion, and stable
text writes.

### Task 3: Generate and verify the plugin artifact

**Files:**
- Generate: `dist/sub2api-helper.user.js`

- [ ] **Step 1: Run the full regression suite.**

```bash
node --test sub2api/sub2api-helper.user.test.mjs
```

Expected result: all tests pass with no failures.

- [ ] **Step 2: Rebuild the userscript and check syntax.**

```bash
node sub2api/build-userscript.mjs
node --check dist/sub2api-helper.user.js
node --check sub2api/build-userscript.mjs
```

Expected result: build exits successfully and both syntax checks exit 0.

- [ ] **Step 3: Inspect the final diff and report the plugin path.**

```bash
git diff --check
git status --short
```

Confirm the source and test changes are scoped to this request, the generated
file contains the new label/value selectors, and report
`/home/feng/code/tampermonkey/dist/sub2api-helper.user.js` for plugin testing.
