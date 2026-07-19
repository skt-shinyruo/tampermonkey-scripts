# Adapt TPS Display to the Latest Sub2API Usage Table

Date: 2026-07-19

## Context

The userscript in this repository currently adds TPS to the older Sub2API
usage table shape, where first-token latency and total duration are separate
columns. The latest Sub2API frontend uses one `latency` column. Its cell is a
two-column grid with localized labels (`首字`/`First` and `总耗时`/`Total`) and
their values.

The existing enhancement therefore exits before processing the new table: it
requires a separate duration column. The target source repository is used as a
read-only reference. Only this Tampermonkey repository will change.

## Goals

- Add TPS to the latest merged `latency` cell on both user and admin usage
  pages.
- Keep the existing TPS formula:
  `output_tokens / ((duration_ms - first_token_ms) / 1000)`.
- Show TPS only for streaming-compatible rows with valid API data and a
  positive generation interval.
- Keep the native latency markup intact and make the enhancement idempotent
  across Vue rerenders and MutationObserver runs.
- Preserve the existing fast-tier, admin request-ID, API response mapping, and
  feature-toggle behavior.

## Non-goals

- Supporting the older separate first-token and duration columns.
- Modifying the Sub2API source repository or backend APIs.
- Changing the TPS calculation or adding a new user-facing setting.

## Design

### Table discovery

`getUsageTableColumnIndexes` will identify the latest `latency` column by its
localized header (`延迟` or `Latency`) and will no longer return a separate
`duration` or `firstToken` index. The table enhancer will require the latency
column and the existing cost column. Optional token, request-type, and
user-agent cells may be absent because the latest table supports column
visibility settings.

### Latency cell parsing

The latency enhancer will inspect the cell's latest grid structure and locate
the value paired with the localized first-token label (`首字` or `First`) and
the value paired with the total-duration label (`总耗时` or `Total`). It will
use the API row's `first_token_ms` and `duration_ms` as the authoritative
numeric values. The native duration value remains rendered by Vue.

When TPS is eligible, a marked child element will be appended below the native
total-duration value:

```text
Total  20.58s
       52.94 TPS
```

The child will carry `data-sub2api-usage-latency-tps="true"`. Repeated passes
will update its text only when the formatted value changes. When a row becomes
ineligible, only this marked child will be removed.

### Eligibility and cleanup

The existing streaming-row decision remains the source of truth: `sync` rows
are excluded, while `stream`, `ws_v2`, and `cyber` rows are eligible. The
existing text fallback remains available only for request type detection when
API metadata is incomplete; it does not restore old column parsing.

Rows are skipped when the latency structure, API row, output token count,
first-token latency, total duration, or positive generation interval is
missing. Skipping never replaces or clears the Vue-owned latency cell.

### Styling

The existing enhancement style element will add a selector for the marked TPS
child. It will use block layout, a compact secondary text size, tabular
numbers, and muted theme-aware colors so the value aligns beneath the native
duration without changing the table's column width unexpectedly.

## Test plan

Update the userscript test table fixture to render the latest `latency` header
and nested `首字`/`总耗时` values. Add or update tests for:

1. A valid streaming response displaying the expected TPS below total duration.
2. Sync rows, missing first-token data, missing duration data, and non-positive
   generation intervals not displaying TPS while preserving native latency
   text.
3. Repeated MutationObserver runs keeping exactly one marked TPS child and no
   duplicate text.
4. An old-style table without a `latency` header receiving no TPS, proving
   that old compatibility was intentionally removed.
5. Unchanged native duration and TPS text not being written again on an
   unchanged enhancement pass.

Verification commands:

```bash
node --test sub2api/sub2api-helper.user.test.mjs
node sub2api/build-userscript.mjs --check
git status --short
```

The final status check must show only the intended files in this repository;
the untracked files already present in the target source repository are out of
scope.
