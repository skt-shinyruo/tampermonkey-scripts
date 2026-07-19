# Align Sub2API TPS With the Latest Latency Grid

## Context

The latest Sub2API usage table renders first-token latency and total duration
inside one two-column `latency` cell. The helper currently appends TPS inside
the total-duration value, which makes the TPS row visually different from the
native latency rows.

## Approved Design

Keep the existing streaming-row eligibility checks and TPS calculation. When a
row is eligible, add a marked TPS label and a marked TPS value as the next two
children of the native latency grid:

```text
首字    1.76s
总耗时  4.38s
TPS     43.88
```

The TPS label will use the same class/style as the native latency labels. The
TPS value will use the same class/style as the native latency values. The
value will contain only the formatted number because the left-hand label
already identifies the unit.

The enhancement remains idempotent: repeated mutation passes keep one TPS
label/value pair, update only changed text, and remove the pair when the row is
no longer eligible. The native latency markup is not rewritten. Legacy tables
with separate first-token and duration columns remain unsupported.

## Alternatives Considered

1. Append the TPS text inside the total-duration value. This requires fewer DOM
   changes but cannot align TPS with the native two-column grid.
2. Add a separate visual block below the latency cell. This avoids touching the
   native grid but introduces a second layout system and does not align labels
   or values reliably.
3. Add TPS as two siblings in the existing latency grid. This is the selected
   design because it preserves the latest page layout and reuses its native
   label/value styles.

## Testing and Verification

Update the DOM fixture and focused tests to assert that the marked TPS label
and value are siblings in the native grid, have the expected text, and do not
remain nested under the duration value. Retain coverage for invalid rows,
idempotent mutation passes, legacy-column exclusion, stable text writes, userscript
syntax, and the generated userscript.
