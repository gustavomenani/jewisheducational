# Resource PDF Preview and Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep split worksheet pages in deterministic order, preview every PDF inside the resource site, preserve the premium complete-PDF option, and distinguish preview clicks from download clicks in Google Analytics.

**Architecture:** Normalize resource-file ordering in the shared frontend utility, route all PDF previews through the existing same-site `K5PreviewModal`, and emit one explicit download-click event at each download entry point. Keep successful file delivery tracked by the existing `file_download` event and enforce premium access for complete-PDF previews in the backend preview endpoint.

**Tech Stack:** Vue 3, Pinia, Express, Firebase Functions/Firestore, Google Analytics `gtag`, Node built-in tests, Vite.

## Global Constraints

- Do not expose file contents or credentials in analytics payloads.
- Keep the complete PDF marked `is_bundle`/`premium_only` and keep split pages separate.
- Preview must remain in the current resource page/modal; downloading may still use the existing authenticated download flow.
- Do not submit real contact, signup, or payment data during verification.

### Task 1: Add regression coverage for ordering, same-site preview, and distinct download clicks

**Files:**
- Modify: `frontend/src/resourcePreview.test.js`
- Modify: `frontend/src/analytics.test.js`

**Interfaces:**
- `resourceFiles.js` will expose `sortResourceFiles(files)`.
- `analytics.js` will expose the approved `resource_download_click` event through `INTERACTION_EVENTS`.

- [ ] Add assertions that resource files are sorted by numeric `sort_order`, then stable `id`, and that the PDF modal no longer exposes an external-tab action.
- [ ] Add assertions that `resource_download_click` is approved and emitted by the resource, download, and worksheet-action entry points.
- [ ] Run `node --test frontend/src/resourcePreview.test.js frontend/src/analytics.test.js` and confirm the new assertions fail before implementation.

### Task 2: Normalize resource files and keep PDF previews in-site

**Files:**
- Modify: `frontend/src/utils/resourceFiles.js`
- Modify: `frontend/src/views/ResourceView.vue`
- Modify: `frontend/src/components/K5PreviewModal.vue`
- Modify: `frontend/src/components/K5WorksheetActions.vue`

**Interfaces:**
- `sortResourceFiles(files)` returns a new array ordered by `sort_order`, primary tie-breaker, and numeric `id` without mutating the API response.
- `K5PreviewModal` keeps `Preview`, `Download`, and `Close`, but does not render an “Open in new tab” control.

- [ ] Make `pickWorksheetFile` and `extraWorksheetFiles` consume the normalized order so the first split page is always first and later pages follow it.
- [ ] Make the complete-PDF action open a second `K5PreviewModal` for the bundle; its modal Download action uses the existing authenticated download handler.
- [ ] Wire the resource-level preview modal Download event to `directDownload`, so clicking Download inside the modal has an effect.
- [ ] Keep the complete PDF out of the individual-page list while showing it as a separate premium action.

### Task 3: Track open and download clicks separately

**Files:**
- Modify: `frontend/src/analytics.js`
- Modify: `frontend/src/views/ResourceView.vue`
- Modify: `frontend/src/views/DownloadView.vue`
- Modify: `frontend/src/components/K5WorksheetActions.vue`
- Modify: `backend/routes/analytics.js`
- Modify: `backend/routes/downloads.js` only if backend validation needs the new event.

**Interfaces:**
- Event name: `resource_preview_open` for a PDF preview modal opening.
- Event name: `resource_download_click` for a user click on any download entry point.
- Existing `file_download`, `download_started`, and `download_completed` remain unchanged.

- [ ] Remove the ambiguous page-click event from PDF preview buttons and include `resourceId`, `fileId`, `fileLabel`, and `pageIndex` where available.
- [ ] Emit `resource_download_click` before auth/download handling, then keep `file_download` after the file is delivered.
- [ ] Add `resource_download_click` to the backend allowlist so the internal interaction report accepts the same event.

### Task 4: Verify, build, and publish

**Files:**
- No product files beyond Tasks 1–3.

- [ ] Run all repository tests with `node --test` excluding `node_modules` and confirm zero failures.
- [ ] Run `npm run build` and confirm Vite exits 0.
- [ ] Use a browser smoke test against `https://jewish-educational-resources.web.app/resource/alef-bais` to verify ordered page cards, same-site preview modal, modal Download wiring, no console/page errors, and successful analytics requests without real downloads.
- [ ] Deploy `functions,hosting` to Firebase and verify the public homepage, resource route, `/api/health`, and the new event endpoint response.

