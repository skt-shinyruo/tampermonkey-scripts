# Sub2API Latest TPS Latency Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt the Sub2API userscript's TPS display to the latest merged `latency` table column on user and admin usage pages.

**Architecture:** Keep the existing userscript data-fetch and row-mapping pipeline. Replace the old separate-duration-column enhancement with a latest-DOM latency enhancer that finds the native total-duration value and appends one marked TPS child beneath it, while leaving Vue-owned latency markup untouched. Preserve independent cost, fast-tier, request-ID, feature-toggle, and MutationObserver behavior.

**Tech Stack:** Vanilla JavaScript userscript, DOM APIs, Node.js built-in `node:test`, generated userscript source assembled by `sub2api/build-userscript.mjs`.

---

## Files and Responsibilities

- Modify `sub2api/sub2api-helper.user.test.mjs` to render the latest `latency` cell shape and verify the new-only behavior.
- Modify `sub2api/src/parts/06-usage-table-enhancements.js` to discover the `latency` column, parse its localized label/value pairs, and manage the marked TPS child.
- Do not modify `/home/feng/code/opensource/sub2api`; it is a read-only DOM reference.
- Do not check in `dist/sub2api-helper.user.js`; the repository's build check generates a temporary artifact in the test setup.

### Task 1: Update the fixture and write the failing latest-DOM tests

**Files:**
- Modify: `sub2api/sub2api-helper.user.test.mjs:1141-1227` (usage table fixture)
- Modify: `sub2api/sub2api-helper.user.test.mjs:2286-2708` (TPS behavior tests)

- [ ] **Step 1: Change the default fixture to the latest columns.**

Replace the old header/key pair:

```js
const headers = ['模型', '类型', 'Tokens', '费用', '首 TOKEN', '耗时', 'USER-AGENT'];
const columnKeys = ['model', 'type', 'tokens', 'cost', 'firstToken', 'duration', 'userAgent'];
```

with the latest shape:

```js
const headers = ['模型', '类型', 'Tokens', '费用', '延迟', 'USER-AGENT'];
const columnKeys = ['model', 'type', 'tokens', 'cost', 'latency', 'userAgent'];
```

For each `latency` cell, create the same direct-child label/value grid used by
the current frontend. Keep the native values in separate spans so tests can
assert that TPS is nested under the total-duration value:

```js
function appendLatencyContent(td, row) {
  const wrapper = document.createElement('div');
  const grid = document.createElement('div');
  const firstLabel = document.createElement('span');
  const firstValue = document.createElement('span');
  const totalLabel = document.createElement('span');
  const totalValue = document.createElement('span');

  grid.className = 'grid grid-cols-[max-content_max-content]';
  firstLabel.textContent = '首字';
  firstValue.textContent = row.firstToken ?? '-';
  totalLabel.textContent = '总耗时';
  totalValue.textContent = row.duration ?? '-';
  grid.appendChild(firstLabel);
  grid.appendChild(firstValue);
  grid.appendChild(totalLabel);
  grid.appendChild(totalValue);
  wrapper.appendChild(grid);
  td.appendChild(wrapper);
}
```

Call this helper for `columnKey === 'latency'`, and expose a test accessor
that returns the total-duration span and the latency cell. Keep the existing
cost fixture because fast-tier and cost tests still exercise the same feature.

- [ ] **Step 2: Add the latest-DOM assertion to the valid streaming test.**

Keep the existing API response (`output_tokens: 1010`, `duration_ms: 20580`,
`first_token_ms: 1500`) and expected value `52.94 TPS`. Change the test to
assert all of the following:

```js
const latency = table.getCell(101, 'latency');
const durationValue = table.getLatencyDurationValue(101);
const tpsValue = latency.querySelector('[data-sub2api-usage-latency-tps="true"]');

assert.match(durationValue.textContent, /20\.58s/);
assert.equal(tpsValue.textContent, '52.94 TPS');
assert.equal(tpsValue.parentElement, durationValue);
assert.equal(latency.dataset.sub2apiUsageTpsApplied, 'true');
```

The assertion that the TPS element is a child of the native total-duration
value proves that the new layout is being adapted rather than replaced.

- [ ] **Step 3: Add a no-legacy-compatibility test.**

Allow `createUsageEnhancementTable` to accept `{ legacyColumns: true }` only
for this test. The legacy fixture must contain `首 TOKEN` and `耗时` headers,
but no `延迟` header. Populate a streaming API row with valid timing and
tokens, run the script, and assert that no element matching
`[data-sub2api-usage-latency-tps="true"]` exists. This test must fail after the
fixture is updated and before the new column gate is implemented.

- [ ] **Step 4: Extend ineligibility coverage for the latest cell.**

Update the existing sync/missing-first-token test to inspect `latency` cells.
Add a row with `duration_ms: null` and native total value `'-'`, and add a row
where `duration_ms` is less than `first_token_ms`. Assert that each native
latency cell still contains its `首字`/`总耗时` labels and has no marked TPS
child.

- [ ] **Step 5: Update style, idempotence, and stable-write assertions.**

Use the new child selector in the style test and assert that the injected style
contains `data-sub2api-usage-latency-tps` plus `display: block` and
`user-select: text`. In the repeated-observer test, count the new marked child
instead of counting `TPS` in flattened cell text. In the stable-write test,
instrument the native duration span and the marked TPS span, then assert that
two additional observer passes perform zero text writes.

- [ ] **Step 6: Run the focused tests and verify the expected RED state.**

Run:

```bash
node --test --test-name-pattern="usage table" sub2api/sub2api-helper.user.test.mjs
```

Expected result before production changes: the tests that require the latest
`latency` behavior fail because the production code still requires a separate
duration column. Existing unrelated tests should continue to run; fix only
fixture/test mistakes if the failure is a harness error rather than the
missing feature.

### Task 2: Implement latest latency parsing and TPS injection

**Files:**
- Modify: `sub2api/src/parts/06-usage-table-enhancements.js:24-360`

- [ ] **Step 1: Replace the old table gate and duration-column wiring.**

Change `enhanceUsageTable` to require `columnIndexes.latency` and
`columnIndexes.cost`, then pass the latency cell into a new function:

```js
if (!columnIndexes || columnIndexes.latency < 0 || columnIndexes.cost < 0) {
  return;
}

enhanceUsageLatencyCell({
  cell: cells[columnIndexes.latency],
  rowElement,
  typeCell: cells[columnIndexes.type],
  usageRow,
});
```

In `getUsageTableColumnIndexes`, add only the latest header matcher:

```js
latency: findUsageColumnIndex(labels, (label) =>
  label === '延迟' || label === 'latency',
),
```

Remove the returned `duration` and `firstToken` indexes. Keep the existing
`cost`, `tokens`, `type`, and `userAgent` matchers because the other
enhancements and request-type fallback still use them.

- [ ] **Step 2: Add semantic latest-cell lookup helpers.**

Implement helpers that find a direct sibling value for a localized label and
return the native first-token and total-duration spans without depending on
Tailwind class names:

```js
function getUsageLatencyValueElement(cell, labelMatcher) {
  const label = [...cell.querySelectorAll('span')]
    .find((candidate) => labelMatcher(normalizeUsageCellText(candidate)));
  if (!label?.parentElement) {
    return null;
  }

  const siblings = [...label.parentElement.children];
  return siblings[siblings.indexOf(label) + 1] || null;
}

function getUsageLatencyElements(cell) {
  return {
    firstTokenValue: getUsageLatencyValueElement(cell, (text) =>
      text === '首字' || text.toLowerCase() === 'first',
    ),
    durationValue: getUsageLatencyValueElement(cell, (text) =>
      text === '总耗时' || text.toLowerCase() === 'total',
    ),
  };
}
```

The matcher must use exact normalized label text so the outer wrapper cannot
be mistaken for a label. If either native value is missing, skip the row and
remove only a stale marked TPS child.

- [ ] **Step 3: Calculate TPS from the API row only.**

Implement `calculateUsageRowTps({ firstTokenValue, rowElement, typeCell,
usageRow })` with the existing streaming decision and this numeric sequence:

```js
if (!isStreamingUsageRow({ rowElement, typeCell, usageRow })) {
  return null;
}

if (normalizeUsageCellText(firstTokenValue) === '-') {
  return null;
}

const outputTokens = toFiniteUsageNumber(usageRow?.output_tokens);
const durationMs = toFiniteUsageNumber(usageRow?.duration_ms);
const firstTokenMs = toFiniteUsageNumber(usageRow?.first_token_ms);
if (outputTokens === null || durationMs === null || firstTokenMs === null) {
  return null;
}

const generationSeconds = (durationMs - firstTokenMs) / 1000;
if (generationSeconds <= 0) {
  return null;
}

return outputTokens / generationSeconds;
```

Remove the old cell-text fallback helpers (`parseUsageDurationMs`,
`getUsageDurationDisplayText`, `getUsageRowDurationMs`, and
`getUsageRowFirstTokenMs`) and the old token-cell fallback from
`getUsageRowOutputTokens`. The latest API response is the only numeric source;
the remaining text fallback is only for request-type detection.

- [ ] **Step 4: Add idempotent injection and cleanup under the native duration.**

Implement the following behavior in `enhanceUsageLatencyCell`:

```js
function enhanceUsageLatencyCell({ cell, rowElement, typeCell, usageRow }) {
  if (!cell) return;

  cell.style.textAlign = 'left';
  const { firstTokenValue, durationValue } = getUsageLatencyElements(cell);
  const tps = durationValue
    ? calculateUsageRowTps({ firstTokenValue, rowElement, typeCell, usageRow })
    : null;

  if (tps === null) {
    removeUsageLatencyTps(durationValue || cell);
    delete cell.dataset.sub2apiUsageTpsApplied;
    return;
  }

  applyUsageLatencyTps(durationValue, tps);
  cell.dataset.sub2apiUsageTpsApplied = 'true';
}
```

`applyUsageLatencyTps` must query
`[data-sub2api-usage-latency-tps="true"]` below `durationValue`, create one
`span` when absent, set `dataset.sub2apiUsageLatencyTps = 'true'`, and use
`setUsageTextIfChanged(tpsValue, \`${tps.toFixed(2)} TPS\`)`. It must never set
`durationValue.textContent`, because doing so would destroy the native child
structure and Vue-owned text.

`removeUsageLatencyTps` must remove every marked child below the target and
must not call `textContent = ''` on the latency cell or native duration value.

- [ ] **Step 5: Replace the old TPS CSS selectors.**

Remove the old duration-stack/value selectors and add a scoped style for the
new marked child:

```css
[data-sub2api-usage-latency-tps="true"] {
  display: block;
  color: #64748b;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.25;
  margin-top: 2px;
  user-select: text;
  -webkit-user-select: text;
  white-space: nowrap;
}

.dark [data-sub2api-usage-latency-tps="true"] {
  color: #94a3b8;
}
```

Keep the fast-tier and request-ID styles unchanged.

- [ ] **Step 6: Run the focused tests and verify GREEN.**

Run:

```bash
node --test --test-name-pattern="usage table" sub2api/sub2api-helper.user.test.mjs
```

Expected result: all usage-table tests pass, including the no-legacy test,
with no duplicate marked TPS nodes.

### Task 3: Full verification and cleanup

**Files:**
- Modify: `sub2api/src/parts/06-usage-table-enhancements.js` only if refactoring is needed after green tests.
- Modify: `sub2api/sub2api-helper.user.test.mjs` only if an uncovered regression is found and the test expectation is correct.

- [ ] **Step 1: Run the complete userscript regression suite.**

Run:

```bash
node --test sub2api/sub2api-helper.user.test.mjs
```

Expected result: all tests pass. If an unrelated existing test fails, inspect
the changed selectors and shared fixture before changing production behavior.

- [ ] **Step 2: Check generated-source consistency and syntax.**

Run:

```bash
node sub2api/build-userscript.mjs --check
node --check sub2api/build-userscript.mjs
```

Expected result: both commands exit successfully. The test-created temporary
userscript is sufficient; do not add generated output to the repository.

- [ ] **Step 3: Review the final diff and repository boundaries.**

Run:

```bash
git diff --check
git status --short
git diff -- sub2api/src/parts/06-usage-table-enhancements.js sub2api/sub2api-helper.user.test.mjs
```

Confirm that only the current repository's source and test files are changed
after the already-committed design and plan documents, and that no file under
`/home/feng/code/opensource/sub2api` changed.

- [ ] **Step 4: Commit the implementation.**

Run:

```bash
git add sub2api/src/parts/06-usage-table-enhancements.js sub2api/sub2api-helper.user.test.mjs
git commit -m "fix: adapt sub2api TPS to latency column"
```
