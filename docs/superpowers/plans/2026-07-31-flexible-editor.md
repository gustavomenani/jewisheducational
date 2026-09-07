# Flexible Visual Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe free-form block positioning and harden the visual editor against data loss and history bugs.

**Architecture:** Extend the existing section/column/block tree with normalized block placement metadata. Render section columns and block positions on nested 12-column CSS grids, and keep state changes behind store operations with reversible history.

**Tech Stack:** Vue 3, Pinia, CSS Grid, Node test runner, Vite.

## Global Constraints

- Existing published layouts must remain compatible.
- Mobile layouts must stack blocks at full width.
- Structural editing remains limited to the Home custom-content canvas.
- No new runtime dependency.

---

### Task 1: Normalize placement data

**Files:**
- Modify: `frontend/src/builder/layout.js`
- Create: `frontend/src/builder/layout.test.js`

**Interfaces:**
- Produces: `normalizeBlockPlacement(raw)`, `alignBlockPlacement(raw, alignment)`, and normalized `block.layout` data.

- [ ] Write tests for defaults, numeric clamping, alignment, legacy layouts, empty columns, and duplicate IDs.
- [ ] Run `node --test src/builder/layout.test.js` and confirm the new tests fail.
- [ ] Implement placement normalization and resilient layout repair.
- [ ] Run the layout tests and confirm they pass.

### Task 2: Make editor history and mutations safe

**Files:**
- Modify: `frontend/src/builder/store.js`
- Modify: `frontend/src/builder/storeContract.test.js`
- Modify: `frontend/src/builder/EditableText.vue`

**Interfaces:**
- Produces: `beginHistory()`, `setBlockProps(blockId, props)`, `updateBlockLayout(blockId, props)`, and structural redo state.

- [ ] Add contract assertions for structural future history and placement updates.
- [ ] Implement pre-edit snapshots for inline editing and redo for layouts.
- [ ] Make mutations compare before/after state and ignore no-ops.
- [ ] Preserve removed-column blocks when changing a section layout.
- [ ] Run the builder store tests.

### Task 3: Add position controls

**Files:**
- Create: `frontend/src/builder/BlockPositionControls.vue`
- Modify: `frontend/src/builder/BuilderToolbar.vue`
- Modify: `frontend/src/builder/editorShell.test.js`

**Interfaces:**
- Consumes: `updateBlockLayout(blockId, props)` and normalized `block.layout`.
- Produces: width presets, left/center/right alignment, one-column nudging, and bounded vertical spacing inputs.

- [ ] Add shell assertions for the new control labels.
- [ ] Implement the focused position-control component.
- [ ] Replace property edits that snapshot after mutation with `setBlockProps`.
- [ ] Mount the position controls above block-specific properties.

### Task 4: Render and drag the grid safely

**Files:**
- Modify: `frontend/src/builder/BlockRenderer.vue`

**Interfaces:**
- Consumes: normalized section spans and block placement.
- Produces: nested CSS grids with full-width mobile fallback.

- [ ] Render columns and blocks on 12-column CSS grids.
- [ ] Add drop-position feedback and the missing drag-leave cleanup.
- [ ] Validate payload type before adding or moving blocks.
- [ ] Confirm before deleting sections or blocks.
- [ ] Add a subtle editing-only grid guide and reduced-motion rules.

### Task 5: Verify the result

**Files:**
- Verify only.

- [ ] Run `node --test` from `frontend` and require all tests to pass.
- [ ] Run `npm run build --prefix frontend` and require a successful Vite build.
- [ ] Confirm `/`, `/admin`, and `/api/health` respond on localhost.
- [ ] Inspect the live editor at desktop and mobile widths without opening the user's browser.
