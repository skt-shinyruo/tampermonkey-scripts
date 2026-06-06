# Sub2API Sidebar Width Setting Design

## Background

Sub2API Helper already stores management UI preferences per Sub2API origin. The left sidebar collapsed state is remembered with the origin-scoped `sidebar-collapsed` value and restored by using the native Sub2API sidebar toggle.

The expanded sidebar can take more horizontal space than some users want, especially on dense admin pages such as usage records. Users need a helper setting that can narrow the expanded sidebar without replacing the page's native collapse behavior.

## Goal

Add a configurable expanded sidebar width for each Sub2API origin.

The behavior must:

- let each Sub2API deployment remember its own sidebar width setting
- provide a fast compact option and a custom pixel option
- keep the page's native collapsed sidebar behavior intact
- avoid breaking narrow windows or mobile layouts
- preserve existing sidebar collapsed-state persistence and other helper features

## Non-Goals

- redesigning the Sub2API sidebar
- changing navigation labels, icons, or menu structure
- changing the meaning of the native `收起` / `展开` toggle
- sharing the width setting across different Sub2API origins

## Selected Approach

Add a settings-panel row named `侧边栏宽度` near the existing sidebar state controls.

The row will expose three modes:

- `默认`: do not override Sub2API's sidebar width
- `紧凑`: apply a conservative fixed width, initially `160px`
- `自定义`: apply a user-entered pixel width

Custom width values are valid only in the range `120-260px`. Invalid, missing, or out-of-range values fall back to default behavior.

## Storage

Add two origin-scoped storage entries:

- `sidebar-width-mode`: one of `default`, `compact`, or `custom`
- `sidebar-width-px`: numeric custom width in CSS pixels

Both keys use the existing `getStorageValue()` / `setStorageValue()` path, so the setting is isolated by Sub2API origin.

## Runtime Behavior

When the helper activates, page enhancements run, or relevant DOM mutations occur:

1. read the saved width mode and custom width
2. locate `aside.sidebar`
3. skip width overrides when the sidebar is currently collapsed
4. remove helper width styles for `默认`
5. apply the compact or custom width for expanded sidebars on desktop-width viewports

The implementation should prefer a helper-managed style element or inline custom property so the override is easy to remove. It should not click the native sidebar toggle or infer collapsed state differently from the existing sidebar-state code.

## Responsive Guardrails

The helper should only apply expanded sidebar width overrides on desktop-width viewports, with `900px` as the initial breakpoint.

The effective width must remain bounded with the same `120-260px` range. This keeps custom values predictable across screen densities while avoiding narrow-window layout damage.

## Settings UI

The settings panel should show:

- a radio or segmented choice for `默认`, `紧凑`, and `自定义`
- a numeric input for custom width, enabled when `自定义` is selected
- short helper text explaining that the setting is saved for the current Sub2API domain

Changing the setting applies immediately and refreshes the settings panel state.

## Error Handling

- If no `aside.sidebar` is found, do nothing and retry on later enhancement or mutation cycles.
- If a saved mode is unknown, treat it as `默认`.
- If custom width is not a finite number in `120-260`, ignore it and treat the effective mode as `默认`.
- If the sidebar is collapsed, leave the native collapsed width alone.

## Testing Strategy

Add node:test coverage in `sub2api/sub2api-helper.user.test.mjs`:

1. default mode leaves the sidebar width untouched
2. compact mode applies the compact width to an expanded sidebar
3. custom mode applies a valid custom width
4. invalid custom values fall back without applying width
5. collapsed sidebar does not receive the expanded-width override
6. settings panel stores mode and width under the current origin
7. width storage is isolated between different Sub2API origins

Existing tests should continue to pass.

## Implementation Outline

Expected source changes stay in the existing userscript parts:

- `00-constants-storage.js`: storage names, width mode constants, width limits
- `02-dom-sidebar-selectors.js`: sidebar element lookup, width normalization, apply/remove helpers
- `03-settings-ui.js`: settings state and UI row for sidebar width
- `06-enhancements-watchers.js`: invoke width application during enhancement and mutation flows
- `sub2api-helper.user.test.mjs`: DOM harness support and behavior tests

## Open Decision Log

Confirmed during brainstorming:

- use `默认 / 紧凑 / 自定义 px`
- custom width is bounded to `120-260px`
- compact width starts at `160px`
- width settings are saved per Sub2API origin
- collapsed sidebar behavior remains native
