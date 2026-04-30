# Sub2API Sidebar Collapse Persistence Design

## Background

The Sub2API helper userscript already persists several management UI preferences with origin-scoped storage, including usage date range, dashboard date range, dashboard granularity, usage page size, and auto-refresh interval. The left sidebar has a native bottom control labeled `收起` when expanded and `展开` when collapsed, but that choice is not restored by the helper.

## Goal

Remember the sidebar collapsed or expanded state across the whole Sub2API management UI for each deployment origin.

The behavior must:

- apply to all Sub2API management pages where the sidebar control exists
- keep different Sub2API origins isolated
- use the page's native sidebar toggle instead of reimplementing layout behavior
- preserve existing usage and dashboard helper behavior

## Non-Goals

- redesigning the sidebar UI
- adding a new sidebar toggle
- changing menu item labels or navigation behavior
- sharing the state across different Sub2API origins

## Selected Approach

Add a new origin-scoped storage entry named `sidebar-collapsed`.

The value is a boolean:

- `true` means restore the sidebar to collapsed
- `false` means restore the sidebar to expanded
- missing or invalid values mean leave the page's default state unchanged

The helper will identify the native sidebar toggle by finding a button whose visible text is exactly `收起` or `展开`.

## Runtime Behavior

### Initial Restore

When the helper activates or page enhancements run:

1. read `sidebar-collapsed`
2. locate the native sidebar toggle button
3. infer current state from the button text
4. if the saved state differs from the current state, click the native button once

Because the script clicks the native button, Sub2API remains responsible for CSS classes, layout width, labels, icons, and animation.

### Saving User Choices

The existing document click hook will also watch for clicks on the native sidebar toggle.

After a sidebar toggle click:

1. wait briefly for the page to update the button label
2. infer the new state from the updated button text
3. save the boolean value under the origin-scoped key

The short delay avoids saving the pre-click state.

## SPA and Re-render Resilience

The helper already runs page enhancements during activation and URL changes. Sidebar restore should run through the same path so it applies across `/usage`, `/dashboard`, API key pages, profile pages, and other management routes as long as the Sub2API fingerprint has activated the helper.

The existing mutation observer should also call the sidebar restore helper. The helper must be idempotent so repeated observer callbacks do not repeatedly click the sidebar after it matches the saved state.

## Error Handling

- If the toggle cannot be found, do nothing and retry on later enhancement or mutation cycles.
- If the saved value is missing or not a boolean, do not change the sidebar.
- If the button text is neither `收起` nor `展开`, do not infer or save a state.

## Testing Strategy

Add node:test coverage in `sub2api/sub2api-helper.user.test.mjs` using the existing lightweight DOM harness:

1. saved `sidebar-collapsed: true` clicks an expanded sidebar toggle to collapse it
2. saved `sidebar-collapsed: false` clicks a collapsed sidebar toggle to expand it
3. clicking the native toggle stores the updated collapsed state under the current origin
4. stored sidebar state is isolated by origin

Existing tests should continue to pass.

## Implementation Outline

Changes stay in `sub2api/sub2api-helper.user.js` and the existing test file.

Expected additions:

- storage constant and getter/setter helpers for `sidebar-collapsed`
- DOM helpers to find and interpret the native sidebar toggle
- restore helper called from page enhancement and mutation paths
- click hook branch that saves the updated state after native toggle clicks
- test harness helper for a fake sidebar toggle

## Open Decision Log

Confirmed during brainstorming:

- the sidebar state should be remembered across the entire Sub2API management UI
- the state should be stored per Sub2API origin
- the implementation should use the existing page's native toggle behavior
