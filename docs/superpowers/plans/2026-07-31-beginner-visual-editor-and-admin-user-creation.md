# Beginner Visual Editor and Admin User Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the existing editor into a beginner-first Google Sites-style workflow, add responsive image/text content sections, and let administrators create accounts with temporary passwords.

**Architecture:** Preserve the Pinia editor store and settings persistence, but present a smaller Basic-mode navigation and render the existing block layout as a safe custom Home content region instead of replacing the dynamic page. Extend the image block and section presets for responsive personalization. Add one protected admin route and a focused Users dialog for account creation.

**Tech Stack:** Vue 3 Composition API, Pinia, Bootstrap 5, Express, bcryptjs, existing database abstraction, Node.js test runner, Vite.

## Global Constraints

- Existing users, password login, public registration, settings keys, and published layouts remain readable.
- Only administrators may create users or publish editor changes.
- Temporary passwords must be hashed and never returned.
- Custom content stays in normal document flow and cannot cover dynamic controls.
- Editor controls and new copy are English-only.
- No arbitrary HTML, JavaScript, CSS, absolute positioning, or nested columns.

---

### Task 1: Administrator-created user accounts

**Files:**
- Create: `backend/routes/adminUsers.test.js`
- Modify: `backend/routes/admin.js`
- Create: `frontend/src/views/admin/UsersView.test.js`
- Modify: `frontend/src/views/admin/UsersView.vue`

**Interfaces:**
- Produces: `POST /api/admin/users` accepting `{ name, email, password, role, account_type }`.
- Produces: a safe `{ user }` response with `plan` and `has_premium` but no password fields.

- [ ] **Step 1: Add failing route and UI contract tests**

Assert that the route uses `authenticate`, `requireAdmin`, normalized email, bcrypt hashing, role/plan allowlists, duplicate detection, and `201`. Assert that UsersView contains `Add user`, a submit handler, temporary-password field, and `/admin/users` POST call.

- [ ] **Step 2: Run the tests and confirm failure**

Run: `node --test backend/routes/adminUsers.test.js frontend/src/views/admin/UsersView.test.js`

Expected: FAIL because the route and dialog do not exist.

- [ ] **Step 3: Implement the protected endpoint**

Validate trimmed name, normalized email, password length of at least six, `role` in `['user', 'admin']`, and `account_type` in `['free', 'paid', 'school']`. Hash with `bcrypt.hash(password, 10)`, call `db.userCreate`, update the selected account type when necessary, load the created record, remove `password_hash`, and return status 201.

- [ ] **Step 4: Implement the Users dialog**

Add reactive form state, inline validation/error feedback, password visibility, submit loading, and a success alert. On success prepend the returned record to `users`, close/reset the dialog, and focus the Add user button.

- [ ] **Step 5: Run focused tests**

Run: `node --test backend/routes/adminUsers.test.js frontend/src/views/admin/UsersView.test.js`

Expected: PASS.

### Task 2: Safe custom content region and responsive personalization

**Files:**
- Modify: `frontend/src/builder/registry.js`
- Modify: `frontend/src/builder/blocks/ImageBlock.vue`
- Modify: `frontend/src/builder/store.js`
- Modify: `frontend/src/builder/BlockRenderer.vue`
- Modify: `frontend/src/layouts/PublicLayout.vue`
- Modify: `frontend/src/views/HomeView.vue`
- Create: `frontend/src/builder/personalization.test.js`

**Interfaces:**
- Produces image props: `{ src, alt, caption, link, align, size, radius, maxWidth }`.
- Produces `builder.addSectionPreset('image-text')` and `builder.addSectionPreset('text-image')`.
- Renders published/custom blocks inside Home after the Hero without replacing dynamic Home sections.

- [ ] **Step 1: Add failing personalization contracts**

Assert image caption/link/alignment/size fields, responsive two-column presets, English renderer copy, and embedded Home `BlockRenderer` behavior.

- [ ] **Step 2: Run the contract and confirm failure**

Run: `node --test frontend/src/builder/personalization.test.js`

Expected: FAIL for missing props and embedded content region.

- [ ] **Step 3: Extend the image block**

Render a semantic `figure`, optional safe link, caption, alignment, and size preset. Keep width constrained to 100% and preserve aspect ratio. Uploading remains available from both the block and inspector.

- [ ] **Step 4: Add image/text section presets**

Create equal-width and 66/33 section presets containing an image plus heading, paragraph, and button. Preserve move-up/down controls as the accessible reorder mechanism.

- [ ] **Step 5: Embed custom content safely**

Stop replacing the entire public Home route. Render `BlockRenderer` as a direct flex child of Home with an order immediately after the Hero. Keep Library, Resource, Download, authentication, and payment structures untouched.

- [ ] **Step 6: Remove mixed-language renderer copy**

Replace remaining Portuguese and mojibake labels in BlockRenderer with clear English equivalents.

- [ ] **Step 7: Run personalization and existing editor tests**

Run: `node --test frontend/src/builder/personalization.test.js frontend/src/builder/editorShell.test.js frontend/src/builder/editableComponents.test.js`

Expected: PASS.

### Task 3: Beginner-first editor shell

**Files:**
- Modify: `frontend/src/builder/BuilderToolbar.vue`
- Modify: `frontend/src/views/admin/AppearanceView.vue`
- Modify: `frontend/src/builder/editorShell.test.js`

**Interfaces:**
- Produces Basic navigation: `Content`, `Add content`, `Publish`.
- Produces `More options` for Theme, Sections, and advanced block properties.
- Produces dismissible `Quick start` help stored under `jer_editor_help_seen_v1`.

- [ ] **Step 1: Expand failing editor-shell tests**

Assert `Quick start`, `Add content`, `More options`, `Desktop`, `Tablet`, `Mobile`, image/text preset actions, and basic-mode wording.

- [ ] **Step 2: Run and confirm failure**

Run: `node --test frontend/src/builder/editorShell.test.js`

Expected: FAIL for missing beginner shell tokens.

- [ ] **Step 3: Implement first-use help and Basic navigation**

Show a three-step dismissible guide on the first editor visit and expose Help in the header. Keep Content, Add content, and Publish visible; reveal Theme and Sections through More options. Automatically open block properties when a block is selected.

- [ ] **Step 4: Add content shortcuts and previews**

Provide obvious insert actions for Text, Image, Button, Divider, Spacer, Image + text, and Text + image. Add desktop/tablet/mobile preview width controls that constrain the live site canvas without changing published layout data.

- [ ] **Step 5: Clarify risk and publishing copy**

Replace destructive “activate canvas” language with safe custom-section wording, keep draft status visible, and retain confirmations for discard/revert.

- [ ] **Step 6: Run editor source tests**

Run: `node --test frontend/src/builder/*.test.js frontend/src/views/admin/UsersView.test.js`

Expected: PASS.

### Task 4: Regression and production verification

**Files:**
- Modify only files required to fix defects discovered during verification.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: passing source contracts, backend tests, and frontend production build.

- [ ] **Step 1: Run all frontend source tests**

Run: `node --test frontend/src/**/*.test.js`

Expected: all tests PASS.

- [ ] **Step 2: Run all backend tests**

Run: `node --test backend/**/*.test.js`

Expected: all tests PASS.

- [ ] **Step 3: Build the frontend**

Run: `npm run build --prefix frontend`

Expected: Vite exits with code 0 and writes `frontend/dist`.

- [ ] **Step 4: Inspect production behavior where local services permit**

Verify the Users form, editor onboarding, image insertion, centered images, image/text columns, reordering, mobile stacking, draft/discard/publish states, and public Home dynamic sections.

- [ ] **Step 5: Record the repository limitation**

The workspace has an invalid/empty `.git` directory. Do not initialize or overwrite repository metadata; report that commits could not be created.
