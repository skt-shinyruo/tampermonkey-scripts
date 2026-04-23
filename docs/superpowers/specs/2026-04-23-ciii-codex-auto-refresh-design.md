# Ciii Codex Usage Auto Refresh Design

## Background

The existing userscript at `sub2api/ciii-codex-usage-enhancer.user.js` enhances `https://codex.ciii.club/usage*` by persisting the selected date range and restoring it when the usage page is revisited. The next enhancement should preserve all existing behavior and add a user-controlled automatic refresh feature that reuses the page's current manual refresh action.

## Goal

Add an auto-refresh control to the right of the existing `刷新` button on the usage page.

The control must:

- preserve the current page behavior and data flow
- let the user choose one of these intervals: `5s`, `10s`, `30s`, `1分钟`
- support a `关闭` state
- persist the chosen interval across page revisits, similar to the saved date range
- implement auto-refresh by clicking the existing `刷新` button, not by replacing or reimplementing the page refresh logic

## Non-Goals

- changing the existing date-range persistence behavior
- changing how the site fetches or renders usage data
- adding countdown text, notifications, or background refresh indicators
- adding refresh behavior outside `/usage`

## Selected UI Approach

Use approach A: add a separate auto-refresh button immediately to the right of the existing `刷新` button.

### Button Behavior

- Default text: `自动刷新: 关闭`
- After selection, the button text reflects the active interval, such as `自动刷新: 10s`
- Clicking the button opens a lightweight menu
- Menu options: `关闭`, `5s`, `10s`, `30s`, `1分钟`
- Selecting an option updates the stored preference and immediately reconfigures the timer

### Placement

- The new control is injected into the existing action button area on the usage page
- It must remain visually subordinate to the existing primary action `导出 CSV`
- The existing `刷新`, `重置`, and `导出 CSV` buttons must keep working unchanged

## Persistence Model

Store the selected auto-refresh interval using the same persistence strategy already used by the script:

- prefer Tampermonkey storage via `GM_getValue` / `GM_setValue`
- fall back to `localStorage` if the GM APIs are unavailable

Use a separate storage key from the date-range feature so the two concerns remain independent.

Stored values:

- `off`
- `5000`
- `10000`
- `30000`
- `60000`

## Runtime Behavior

### Initial Restore

On first load of `/usage`:

1. restore the saved date range with the existing logic
2. locate or inject the auto-refresh control near the action buttons
3. read the saved auto-refresh interval
4. if the saved interval is not `off`, start a timer with that interval

### Timer Execution

Each timer tick performs only one action:

1. locate the existing `刷新` button
2. trigger its `click()`

The script must not call site APIs directly or duplicate the page's request logic.

### Reconfiguration Rules

- only one interval timer may exist at a time
- selecting a new interval first clears the current timer, then starts a new one
- selecting `关闭` clears the current timer and persists the `off` state
- if the refresh button is temporarily unavailable on a tick, skip that tick and wait for the next one

## SPA and Re-render Resilience

The page already behaves like a SPA and the current script uses a `MutationObserver` to detect URL changes.

The enhancement must survive:

- revisiting `/usage` through client-side navigation
- action bar re-renders that remove the injected auto-refresh button
- repeated initialization attempts caused by DOM changes

Implementation expectations:

- add an idempotent control installer that checks whether the auto-refresh button already exists before injecting it
- re-run control installation when the page route changes back to `/usage`
- restart auto-refresh from the saved state when returning to `/usage`
- avoid creating duplicate menus, duplicate buttons, or duplicate timers

## Interaction Details

### Menu Open/Close

- clicking the auto-refresh button toggles the menu
- clicking outside the menu closes it
- choosing an interval closes the menu

### Visual State

- the button label is the primary visible state indicator
- the active option in the menu should be visually distinguishable if practical within the existing page style
- if styling cannot perfectly match the site design, prioritize stability and clarity over polish

## Error Handling

- if the action button area cannot be found, do not throw; retry through the existing wait or observer pattern
- if the refresh button cannot be found, do not crash or clear the saved preference
- if persisted data is invalid, treat it as `off`

## Testing Strategy

Manual verification is sufficient for this userscript enhancement.

Required checks:

1. Existing date-range save and restore still work
2. The auto-refresh button appears to the right of `刷新`
3. Selecting `5s`, `10s`, `30s`, and `1分钟` updates the button label
4. The selected interval survives a reload and a route revisit to `/usage`
5. Timer ticks trigger the same behavior as clicking the existing `刷新` button
6. Switching intervals does not create multiple concurrent refreshes
7. Selecting `关闭` stops automatic refresh and persists that stopped state
8. `重置` continues to clear only the date-range preference unless intentionally extended later

## Implementation Outline

The code change stays within `sub2api/ciii-codex-usage-enhancer.user.js`.

Expected additions:

- constants and storage helpers for auto-refresh state
- DOM helpers for locating the refresh button and its surrounding action area
- UI helpers for injecting the new button and menu
- timer lifecycle helpers for start, stop, and restore
- route or mutation hooks to reinstall the control and restore active timers when `/usage` is revisited

No new files are required for the production feature.

## Open Decision Log

The following choices were confirmed during brainstorming:

- the interval choice is persisted across revisits to `/usage`
- auto-refresh is implemented by clicking the existing `刷新` button
- the chosen UI is a separate button to the right of `刷新`
