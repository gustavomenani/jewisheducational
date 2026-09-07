# Self-Service Admin and Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the visual editor and admin configuration dependable, and expose clear status for social links and Analytics without requiring Firebase production access.

**Architecture:** Keep customer-editable values in the existing settings API. Add focused editor-state feedback, normalize the English admin interface, and derive integration status from public settings and browser-safe configuration only.

**Tech Stack:** Vue 3, Pinia, Vite, Express, existing settings API.

## Global Constraints

- Do not expose Firebase credentials or server secrets in the browser.
- Keep existing settings keys and public URLs compatible.
- Use English for all administrator-facing copy.

---

### Task 1: Stabilize editor actions

**Files:**
- Modify: `frontend/src/builder/store.js`
- Modify: `frontend/src/builder/BuilderToolbar.vue`

- [ ] Add an editor operation result state for save, publish, discard, and failed publish requests.
- [ ] Surface the result in the toolbar and preserve unsaved changes when a publish request fails.
- [ ] Build and confirm that publish controls compile.

### Task 2: Make the admin panel self-service

**Files:**
- Modify: `frontend/src/views/admin/AppearanceView.vue`
- Modify: `frontend/src/views/admin/SettingsView.vue`
- Modify: `frontend/src/views/admin/IntegrationsView.vue`

- [ ] Translate remaining visible copy and use canonical English routes.
- [ ] Add direct links from settings to the editor, social controls, and Analytics status.
- [ ] Validate social profile URLs before saving and show field-level errors.

### Task 3: Add integration status

**Files:**
- Modify: `frontend/src/views/admin/SettingsView.vue`
- Modify: `frontend/src/analytics.js`
- Modify: `frontend/src/stores/index.js`

- [ ] Show whether Analytics has a valid Measurement ID and whether the tracking script loaded.
- [ ] Keep exactly one Google tag script and use the saved settings ID after settings load.
- [ ] Show which social profiles are enabled and retain the supplied Pinterest URL.

### Task 4: Verify

**Files:**
- Test: `frontend/src/**/*.test.js`

- [ ] Run the Node test suite from the repository root.
- [ ] Run the Vite production build from `frontend`.
- [ ] Confirm the local settings endpoint returns Pinterest and the home footer renders enabled social links.
