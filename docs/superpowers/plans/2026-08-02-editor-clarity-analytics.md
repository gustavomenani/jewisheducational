# Editor clarity and interaction analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the visual editor easy for a first-time client and add reliable preview/page/download interaction analytics.

**Architecture:** Keep the existing Vue builder and Pinia store. Improve discoverability in `BuilderToolbar` and `BlockRenderer`, isolate button visitor/editor click behavior in `ButtonBlock`, and add a small analytics event client plus a validated backend event route. The admin dashboard consumes the existing report endpoint extended with event summaries.

**Tech Stack:** Vue 3 Composition API, Pinia, Vue Router, Bootstrap Icons, Express 4, existing database adapters, Node.js built-in test runner, Vite, Firebase Hosting.

## Global Constraints

- Preserve the existing four editor workspaces and responsive desktop/tablet/mobile preview modes.
- Keep all visible editor copy in English, matching the current site language.
- Do not add a frontend dependency or replace the existing database abstraction.
- Do not block the canvas with first-use help; help must be dismissible and non-modal for editing.
- Analytics failures must never block navigation, preview, or download actions.

---

### Task 1: Add failing contracts for editor clarity and analytics

**Files:**
- Modify: `frontend/src/builder/editorShell.test.js`
- Modify: `frontend/src/builder/editableComponents.test.js`
- Create: `frontend/src/analytics.test.js`
- Create: `backend/routes/analyticsEvents.test.js`

**Interfaces:**
- Consumes: current source-level contract test style and existing analytics module.
- Produces: failing contracts for visible remove actions, non-blocking help, visitor button links, event names, and backend validation.

- [x] **Step 1: Write the frontend editor contracts**

  Assert that `BuilderToolbar.vue` contains a non-modal quick-start surface, an explicit `Remove button` label, and the Add workspace helper copy. Assert that `ButtonBlock.vue` does not use an unconditional `.prevent` modifier on the visitor anchor.

- [x] **Step 2: Write analytics client contracts**

  Import `trackInteraction` from `frontend/src/analytics.js` with a stubbed `window.gtag` and assert it sends the requested event name and payload while tolerating missing analytics configuration.

- [x] **Step 3: Write backend event validation contracts**

  Assert the analytics events route accepts only the five known event names, bounds strings/identifiers, and returns a validation error for unknown event names. Follow the existing `node:test` source-contract approach used by `backend/routes/adminUsers.test.js`.

- [x] **Step 4: Run focused tests and verify the new contracts fail**

  Run:

  ```powershell
  node --test frontend/src/builder/editorShell.test.js frontend/src/builder/editableComponents.test.js frontend/src/analytics.test.js backend/routes/analyticsEvents.test.js
  ```

  Expected: existing tests pass, and the new assertions fail because the UI/event implementation is not yet present.

---

### Task 2: Make adding and removing a button self-explanatory

**Files:**
- Modify: `frontend/src/builder/BuilderToolbar.vue`
- Modify: `frontend/src/builder/BlockRenderer.vue`
- Modify: `frontend/src/builder/ButtonBlock.vue`
- Modify: `frontend/src/assets/main.css` or the scoped editor styles only when needed.

**Interfaces:**
- Consumes: existing `builder.select`, `builder.removeBlock`, `blockDef`, and `selectedBlock` state.
- Produces: visible `Remove button` / `Remove block` action, non-blocking first-use help, and correct visitor navigation.

- [x] **Step 1: Replace the blocking quick-start overlay**

  Render the guide as a compact `role="status"` tip inside the editor rail or canvas edge. Keep the existing `dismissHelp` storage key and close action, but remove `aria-modal` and the full-screen backdrop so Add cards and canvas controls remain clickable.

- [x] **Step 2: Add explicit destructive action to properties**

  Add a button in the selected-item properties footer:

  ```vue
  <button
    type="button"
    class="props-danger-action"
    :aria-label="selectedBlockType === 'button' ? 'Remove button' : 'Remove block'"
    @click="removeSelectedBlock"
  >
    <i class="bi bi-trash3"></i>
    {{ selectedBlockType === 'button' ? 'Remove button' : 'Remove block' }}
  </button>
  ```

  The handler must confirm once, call `builder.removeBlock(selectedId)`, clear selection, and return to the Add workspace. Keep the compact toolbar delete icon as a secondary shortcut.

- [x] **Step 3: Add teaching copy to the Add workspace**

  Put a short sentence below the Button card: “Add a button, then edit its text and link on the right.” Add a matching “Select any block to edit or remove it” hint near the properties header.

- [x] **Step 4: Separate editor and visitor anchor behavior**

  Replace the unconditional `@click.prevent.stop` with a handler that only calls `preventDefault` and `stopPropagation` when `builder.editMode` is true. In visitor mode, the anchor must use its configured `href` and normal browser navigation.

- [x] **Step 5: Run the focused editor tests**

  Run:

  ```powershell
  node --test frontend/src/builder/editorShell.test.js frontend/src/builder/editableComponents.test.js
  ```

  Expected: all editor contracts pass.

---

### Task 3: Add interaction analytics without blocking UX

**Files:**
- Modify: `frontend/src/analytics.js`
- Modify: `frontend/src/views/ResourceView.vue`
- Modify: `frontend/src/components/K5PreviewModal.vue` or its parent event boundary.
- Modify: `frontend/src/views/DownloadView.vue`
- Modify: `backend/routes/analytics.js`
- Modify: `backend/app.js` only if a new route mount is required.
- Modify: `backend/db/index.js`, `backend/db/memoryDb.js`, and `backend/db/mysqlDb.js` for event persistence/reporting.
- Modify: `backend/db/firestoreDb.js` and `backend/database/migrate.js` for production persistence and schema migration.

**Interfaces:**
- Consumes: `trackPageView`, `trackDownload`, current auth/session helpers, and download intent records.
- Produces: `trackInteraction(eventName, payload)` and `POST /api/analytics/event` with validated event storage.

- [x] **Step 1: Implement the analytics client helper**

  Add `trackInteraction(name, payload = {})` that sends a GA event when enabled and posts the same normalized payload to `/analytics/event`; catch both failures so callers never await or block on analytics.

- [x] **Step 2: Emit preview and page-card events**

  Call `trackInteraction('resource_preview_open', { resourceId, resourceTitle, fileId, fileLabel })` when `openPreviewModal` succeeds. Call `trackInteraction('resource_page_click', ...)` before the extra-page and gallery card action, preserving the existing download/presentation behavior.

- [x] **Step 3: Emit download-page-open and delivery events**

  Call `trackInteraction('download_page_open', ...)` immediately after the download route authorizes and records its intent. Record `download_completed` server-side in the protected download route when the stream is authorized, while keeping the existing DB download count and client GA `file_download` event.

- [x] **Step 4: Add backend validation and persistence**

  Accept only `resource_preview_open`, `resource_page_click`, `download_page_open`, and `download_completed`; store resource/file IDs, labels, user/session metadata, path, and timestamp. Use a memory adapter fallback and a MySQL table/query pair matching existing migration conventions.

- [x] **Step 5: Extend the admin report**

  Add recent interaction events and per-file preview/page-click counts to the existing admin dashboard response and render two compact cards beside the existing download intent/completion cards.

- [x] **Step 6: Run backend and analytics tests**

  Run:

  ```powershell
  node --test frontend/src/analytics.test.js backend/routes/analyticsEvents.test.js backend/routes/*.test.js backend/utils/*.test.js backend/db/*.test.js
  ```

  Expected: all tests pass, including invalid-event rejection.

---

### Task 4: Headless walkthrough, build, and production deployment

**Files:**
- Modify: `frontend/src/builder/editorShell.test.js` only if the walkthrough exposes a missing stable selector.
- Create: `scripts/audit-editor-clarity.cjs` for repeatable headless validation, then keep it as a project audit utility.

**Interfaces:**
- Consumes: the completed editor and analytics flows.
- Produces: a repeatable no-browser audit covering Add, Remove, responsive preview, link behavior, and console errors.

- [x] **Step 1: Run the source test suites**

  Run:

  ```powershell
  node --test frontend/src/**/*.test.js backend/**/*.test.js
  ```

- [x] **Step 2: Build the frontend**

  Run:

  ```powershell
  npm run build --prefix frontend
  ```

  Expected: Vite exits with code 0 and writes `frontend/dist`.

- [x] **Step 3: Run the headless editor walkthrough**

  Launch the existing local frontend/backend, log in with the local admin fixture, click Start editing if present, add a Button, assert the visible `Remove button` action, remove it, switch to Tablet and Mobile, and assert zero page/console errors. Save a screenshot in the existing visualization folder.

- [x] **Step 4: Deploy the built hosting output**

  Run:

  ```powershell
  npx --yes firebase-tools deploy --only "hosting,functions" --project jewish-educational-resources --non-interactive
  ```

- [x] **Step 5: Verify production assets and core route**

  Fetch `https://jewisheducationalresources.org/`, confirm it references the new Vite asset, and check the asset returns HTTP 200. Do not claim completion until the tests, build, walkthrough, and deployment all succeed.
