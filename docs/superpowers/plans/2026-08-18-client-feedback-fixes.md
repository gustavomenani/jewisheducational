# Client Feedback Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the client-requested minimum viable workflow: reliable material duplication, two-step downloads, distinct Analytics funnel events, a single right-side editor, working Grades navigation, dependable image editing, and regression coverage for the previously fixed library behavior.

**Architecture:** Keep existing Firebase/Firestore, MySQL, and memory adapters behind the current database proxy. Reuse the authenticated preview/download endpoints and existing `DownloadView`, changing only the entry-point semantics so the first click opens the page and the final button delivers the file. Store bounded text styles in the existing settings/content models rather than introducing a freeform canvas editor.

**Tech Stack:** Vue 3, Pinia, Express, Firebase Functions/Firestore/Storage, MySQL/memory adapters, Google Analytics 4 `gtag`, Node built-in tests, Vite, Firebase Hosting.

## Global Constraints

- The editor lateral is the single editing surface; do not build arbitrary Canva-style pixel positioning.
- The first download click must not request the attachment endpoint.
- PowerPoint/PPTX files remain view-only for non-admin users.
- Do not overwrite custom contact text or invent grade values when the grade setting is empty.
- Do not change payment, subscription, or entitlement rules except to preserve them through the new flow.
- Do not submit real contact, signup, payment, or subscription data during verification.

### Task 1: Establish regression coverage and inspect the current baseline

**Files:**
- Modify: `frontend/src/analytics.test.js`
- Modify: `frontend/src/resourcePreview.test.js`
- Create: `backend/routes/resourceDuplicate.test.js`
- Create: `frontend/src/editorClientFeedback.test.js`

**Interfaces:**
- Preserve `POST /api/resources/:id/duplicate` response shape `{ resource }`.
- Preserve `/api/downloads/view/:resourceId/:fileId` as preview-only and `/api/downloads/:resourceId/:fileId` as attachment delivery.
- Approved funnel events are `download_page_open`, `resource_download_click`, `download_started`, and `download_completed`.

- [ ] Add assertions for the two-step flow, including no direct attachment request from the first-click handlers and one final download event.
- [ ] Add duplicate-resource assertions for adapter-compatible IDs, copied files/covers/metadata, and rollback on missing storage.
- [ ] Add editor assertions for selection-only inline components, right-side typography controls, Grades click behavior, and contact copy normalization.
- [ ] Run the focused tests and record the baseline failures before implementation.

### Task 2: Make material duplication atomic and adapter-compatible

**Files:**
- Modify: `backend/routes/resources.js`
- Modify: `backend/db/firestoreDb.js`
- Modify: `backend/db/mysqlDb.js`
- Modify: `backend/db/memoryDb.js`
- Modify: `frontend/src/views/admin/MaterialsView.vue`
- Modify: `frontend/src/components/admin/AdminCategoryFolder.vue`
- Test: `backend/routes/resourceDuplicate.test.js`

**Interfaces:**
- Add a shared storage-copy contract that returns the destination storage reference and accepts `(sourcePath, destinationPath, mimeType, options)` for all adapters.
- Add an adapter-neutral ID extraction helper for resource/file create results.

- [ ] Replace the route’s per-file buffer download/re-upload loop with storage copies and a tracked rollback list.
- [ ] Copy the resource’s cover, every file, and storage-backed thumbnails into unique destinations; preserve labels, ordering, file type, MIME, bundle/premium flags, publication draft state, category, page layout, visibility, and access metadata.
- [ ] Fail the whole operation with a safe error when a required source object is missing; delete new storage objects and database rows before returning.
- [ ] Make the memory adapter return the same create-result contract as production adapters or make the route consume both forms safely.
- [ ] Add success feedback and refresh behavior to both duplicate-button surfaces; keep the button disabled while the request is active.
- [ ] Run the duplicate tests against the memory adapter and mocked storage failure cases.

### Task 3: Enforce the two-step download funnel

**Files:**
- Modify: `frontend/src/views/ResourceView.vue`
- Modify: `frontend/src/components/K5WorksheetActions.vue`
- Modify: `frontend/src/components/K5PreviewModal.vue`
- Modify: `frontend/src/views/DownloadView.vue`
- Modify: `frontend/src/views/AccountView.vue`
- Test: `frontend/src/analytics.test.js`
- Test: `frontend/src/resourcePreview.test.js`

**Interfaces:**
- First-click entry points resolve the existing `download` route and open it in a new tab, with same-tab fallback if the browser blocks the new tab.
- `DownloadView.confirmDownload()` is the only browser action that calls `/api/downloads/:resourceId/:fileId`.
- `/api/downloads/intent/:resourceId/:fileId` remains the open-page intent, not a completed download.

- [ ] Remove direct blob-download calls from resource cards, worksheet actions, preview-modal actions, and resource-page shortcuts.
- [ ] Keep the dedicated download page’s large PDF preview and explicit final button; make the attachment save robust by appending/removing the temporary anchor and revoking the blob URL after the click.
- [ ] Preserve auth, quota, School/Premium paywall, bundle, and view-only presentation behavior.
- [ ] Ensure the first click produces no `resource_download_click`, `download_started`, `download_completed`, or `file_download` event.
- [ ] Ensure the final button produces exactly one client click event and the server records delivery events only after access/storage checks pass.

### Task 4: Make Analytics reliable and distinguish funnel stages

**Files:**
- Modify: `frontend/src/analytics.js`
- Modify: `backend/routes/analytics.js`
- Modify: `backend/db/firestoreDb.js`
- Modify: `backend/db/mysqlDb.js`
- Modify: `backend/db/memoryDb.js`
- Modify: `frontend/src/views/admin/DashboardView.vue`
- Test: `frontend/src/analytics.test.js`
- Test: `backend/routes/analyticsEvents.test.js`

**Interfaces:**
- Keep `trackPageView(path, title)` as the SPA page-view boundary with `send_page_view: false` in the GA config.
- Keep internal event payloads free of email/file contents; include resource/file IDs, labels, path, and session ID only.
- Maintain the configured measurement ID `G-HHPLFCMXZC` through settings/environment; do not hardcode it into feature code.

- [ ] Make event registration idempotent so dynamic settings cannot create duplicate GA scripts or duplicate initial page views.
- [ ] Keep `download_page_open` tied to the download page mount and `resource_download_click` tied only to the final button.
- [ ] Keep `download_started`/`download_completed` server-side and make the dashboard show page opens, final clicks, and delivered files separately per file.
- [ ] Verify `page_view`, funnel events, and `file_download` are visible in `dataLayer`/network requests and document that GA4 reporting may lag Real-time.

### Task 5: Consolidate the editor into the right-side inspector

**Files:**
- Modify: `frontend/src/builder/EditableSetting.vue`
- Modify: `frontend/src/builder/EditableText.vue`
- Modify: `frontend/src/builder/EditableImage.vue`
- Modify: `frontend/src/builder/EditorInspector.vue`
- Modify: `frontend/src/builder/store.js`
- Modify: `frontend/src/builder/BlockRenderer.vue`
- Modify: `frontend/src/builder/fieldCatalog.js`
- Modify: `frontend/src/builder/registry.js`
- Test: `frontend/src/builder/editorShell.test.js`
- Test: `frontend/src/builder/editableComponents.test.js`
- Test: `frontend/src/editorClientFeedback.test.js`

**Interfaces:**
- Add a normalized bounded text-style shape: `{ fontFamily, fontSize, fontWeight, color, textAlign, opacity }`.
- Store setting-backed styles in the key-value setting `editor_text_styles` keyed by setting key; store custom block styles under `props.textStyle`.
- Accept only allowlisted font families/weights and bounded numeric size/opacity values.

- [ ] Change inline text components to select the item without entering `contenteditable` mode or displaying a second editing surface.
- [ ] Hide duplicate block/section floating action bars in the workspace while retaining selection outlines and right-panel actions.
- [ ] Add right-panel content and typography controls, retaining existing width/alignment/spacing controls and keeping arbitrary x/y positioning out of scope.
- [ ] Apply normalized styles in public rendering with safe fallbacks and preserve undo/discard/publish behavior.
- [ ] Keep image selection keyboard-accessible and move image change/remove/resize actions into the inspector.

### Task 6: Fix Grades navigation, image upload, and contact copy

**Files:**
- Modify: `frontend/src/layouts/PublicLayout.vue`
- Modify: `frontend/src/assets/k5-home.css`
- Modify: `frontend/src/routes` or the relevant navigation test location if required by the existing structure
- Modify: `backend/routes/settings.js`
- Modify: `backend/middleware/upload.js`
- Modify: `frontend/src/builder/EditorInspector.vue`
- Modify: `frontend/src/utils/theme.js`
- Test: `frontend/src/editorClientFeedback.test.js`

**Interfaces:**
- Grades remains driven by `grade_levels`; an empty value produces no invented menu entries.
- `/api/settings/upload` continues to accept validated JPEG, PNG, and WebP images and returns a public media URL.
- The default contact lead becomes neutral; an existing custom value is preserved unless it exactly matches the old AI-assistance boilerplate.

- [ ] Stop nested editor selection from cancelling the Grades button’s visitor click; guard edit mode separately from public navigation.
- [ ] Add active/open/keyboard/outside-click states without making the public dropdown transparent or unreadable.
- [ ] Verify uploaded image URLs render immediately, remain attached to the draft, survive Publish, and are removed only on Discard/cleanup when unused.
- [ ] Replace only the exact AI boilerplate with the neutral contact message and keep the field editable in the inspector.

### Task 7: Run regression checks, browser QA, and publish

**Files:**
- Modify: `docs/superpowers/plans/2026-08-18-client-feedback-fixes.md`
- Test: all focused and full backend/frontend test files

- [ ] Run focused backend/frontend tests after each subsystem checkpoint.
- [ ] Run the complete available Node test suite and `npm run build`.
- [ ] Start the local app and manually verify desktop/mobile material open, download-page open, final download, Analytics events, duplicate, delete, ordering, image upload, Grades, and editor selection.
- [ ] Confirm production `/api/health` and authenticated smoke flows without sending real business data.
- [ ] Deploy to the configured Firebase project only after all checks pass.
- [ ] Re-run production smoke tests and record command results, deployment URL, and any GA Real-time limitation in this plan.

