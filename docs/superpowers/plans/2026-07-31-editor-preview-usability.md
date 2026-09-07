# Editor Preview and Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the visual editor easier to understand and make Desktop, Tablet, and Mobile previews faithfully trigger the site's responsive behavior.

**Architecture:** Keep the live Vue DOM and Pinia editor state, but wrap the public site in an editor canvas whose logical width is controlled by preview mode. Use CSS container queries for preview behavior and reorganize the editor chrome into a clear toolbar plus one focused workspace panel.

**Tech Stack:** Vue 3, Pinia, scoped CSS, CSS container queries, Node test runner, Playwright headless Chromium.

## Global Constraints

- Preserve the existing serialized layout format and API contract.
- Never open a visible browser during verification.
- Desktop is fluid, Tablet is 768 px, and Mobile is 390 px.
- Visitor-facing responsive behavior must remain covered by media queries.
- Editor preview behavior must be covered by container queries or explicit preview selectors.

---

### Task 1: Preview model and regression contract

**Files:**
- Create: `frontend/src/builder/preview.js`
- Modify: `frontend/src/builder/editorShell.test.js`

**Interfaces:**
- Produces: `PREVIEW_MODES`, `previewWidth(mode)`, and `previewCanvasStyle(mode, availableWidth)`.
- Consumes: preview IDs `desktop`, `tablet`, and `mobile` already used by `BuilderToolbar.vue`.

- [ ] Add failing tests asserting logical widths of `768` and `390`, a fluid desktop value, and safe scale calculation when the available editor area is narrow.
- [ ] Run `node --test src/builder/editorShell.test.js` from `frontend` and confirm the new assertions fail.
- [ ] Implement pure preview helpers with clamped scale values and no DOM dependency.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Real editor canvas

**Files:**
- Modify: `frontend/src/layouts/PublicLayout.vue`
- Modify: `frontend/src/builder/BuilderToolbar.vue`
- Modify: `frontend/src/assets/main.css`
- Modify: `frontend/src/assets/k5-home.css`
- Modify: `frontend/src/builder/BlockRenderer.vue`
- Test: `frontend/src/builder/editorShell.test.js`

**Interfaces:**
- Consumes: `previewCanvasStyle()` and `body[data-editor-preview]`.
- Produces: `.editor-preview-stage`, `.editor-preview-canvas`, and `.k5-site` container context.

- [ ] Add source contract assertions for the stage, canvas, size label, container type, and mobile/tablet container query branches.
- [ ] Run the focused test and verify failure.
- [ ] Wrap the site presentation in the stage/canvas structure without moving `BuilderToolbar` into the scaled content.
- [ ] Replace the width-only `.k5-site` rules with logical canvas sizing and fit-to-space scaling.
- [ ] Add container-query equivalents for navigation, core Home layouts, and custom block stacking while retaining visitor media queries.
- [ ] Run the focused tests and build.

### Task 3: Simpler editor navigation

**Files:**
- Modify: `frontend/src/builder/BuilderToolbar.vue`
- Test: `frontend/src/builder/editorShell.test.js`

**Interfaces:**
- Consumes: existing builder operations and content/section/theme data.
- Produces: four primary workspaces (`add`, `sections`, `content`, `design`) and contextual selected-block mode.

- [ ] Replace assertions for `More options` with assertions for the four explicit workspaces and contextual back action.
- [ ] Run the focused test and verify failure.
- [ ] Move preview, undo/redo, draft, and publish into a compact fixed toolbar.
- [ ] Replace nested and overlapping tabs with a single navigation row and one visible content panel.
- [ ] Automatically open contextual properties after block selection and return to the previous workspace on `Back`.
- [ ] Keep destructive actions in a secondary disclosure at the bottom of the publish workspace.
- [ ] Run the focused tests.

### Task 4: Quiet canvas controls

**Files:**
- Modify: `frontend/src/builder/BlockRenderer.vue`
- Modify: `frontend/src/builder/BlockPositionControls.vue`
- Test: `frontend/src/builder/editorShell.test.js`

**Interfaces:**
- Consumes: builder selection and existing movement/section APIs.
- Produces: selected/hover-only section actions and beginner labels for position controls.

- [ ] Add assertions that section controls have accessible names and collapsed visual state.
- [ ] Run the focused test and verify failure.
- [ ] Show section actions only on focus, hover, or selected descendants; retain keyboard reachability.
- [ ] Group position controls into `Width`, `Alignment`, and `Spacing`, hiding fine nudges under `More positioning`.
- [ ] Remove duplicated add-section controls from the bottom when the main Add workspace is visible.
- [ ] Run the focused tests.

### Task 5: End-to-end verification

**Files:**
- Modify only if a test exposes a defect in the files above.

**Interfaces:**
- Consumes: the completed editor UI and existing localhost services.
- Produces: screenshots and measured responsive evidence.

- [ ] Run `node --test` in `frontend` and confirm zero failures.
- [ ] Run `npm run build` in `frontend` and confirm exit code 0.
- [ ] Run `node --test` in `backend` and confirm zero failures.
- [ ] In headless Chromium, authenticate, open `/?edit=1`, and verify Desktop, Tablet, and Mobile canvas logical widths.
- [ ] Verify the mobile navigation changes state in the Mobile canvas and multi-column content stacks.
- [ ] Verify add/select/edit/undo/redo still works and capture final screenshots.

