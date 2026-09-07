# Hero Button Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an administrator hide either Home Hero button and align the Hero copy/actions left, center, or right without deleting the saved text or links.

**Architecture:** Extend the existing settings-backed Home Hero fields. Visibility is represented by boolean settings, alignment by a validated select setting, and `HomeView.vue` renders the existing CTA links conditionally with one shared alignment style. The editor's Home → Hero inspector exposes the controls using the existing field catalog and setting persistence.

**Tech Stack:** Vue 3 Composition API, existing Pinia settings/builder stores, Vite, Node built-in tests, Firebase Hosting.

## Global Constraints

- Preserve existing Hero text/link values when a button is hidden.
- Keep the current default appearance unchanged: both buttons visible and left-aligned.
- Use the existing settings API and field catalog; add no dependencies or new backend routes.
- Keep all editor copy in English.
- Validate alignment values and fall back to `left` for invalid or missing settings.

---

### Task 1: Add failing contracts for Hero visibility and alignment

**Files:**
- Modify: `frontend/src/builder/fieldCatalog.test.js`
- Modify: `frontend/src/builder/personalization.test.js`

**Interfaces:**
- Consumes: `fieldsForArea('home')` and the existing Home source-contract tests.
- Produces: contracts for `hero_content_align`, per-button visibility fields, conditional CTA rendering, and alignment styling.

- [x] **Step 1: Add field catalog assertions**

  Assert that Home fields include `hero_content_align`, `home_hero_cta_primary_show`, and `home_hero_cta_secondary_show`, with a select type for alignment and boolean types for visibility.

- [x] **Step 2: Add Home rendering assertions**

  Assert that `HomeView.vue` contains the `showHeroPrimary`, `showHeroSecondary`, and `heroContentAlign` computed values, `v-if` guards for both CTA links, and the alignment style/class hook.

- [x] **Step 3: Run focused tests and confirm the new assertions fail**

  Run:

  ```powershell
  node --test frontend/src/builder/fieldCatalog.test.js frontend/src/builder/personalization.test.js
  ```

  Expected: the existing tests pass and the new field/rendering assertions fail because the settings and guards do not exist yet.

### Task 2: Implement settings-backed Hero controls

**Files:**
- Modify: `frontend/src/utils/theme.js`
- Modify: `frontend/src/builder/fieldCatalog.js`
- Modify: `frontend/src/views/HomeView.vue`

**Interfaces:**
- Consumes: `APPEARANCE_DEFAULTS`, `settingVisible`, `settingText`, and `builder.pendingSettings`.
- Produces: `hero_content_align`, `home_hero_cta_primary_show`, and `home_hero_cta_secondary_show` settings consumed by the Home Hero.

- [x] **Step 1: Add defaults without changing the current appearance**

  Add:

  ```js
  hero_content_align: 'left',
  home_hero_cta_primary_show: 'true',
  home_hero_cta_secondary_show: 'true',
  ```

- [x] **Step 2: Add Home editor fields**

  Add the alignment select under the Hero group with options `left`, `center`, and `right`, plus boolean fields labeled `Show primary button` and `Show secondary button`.

- [x] **Step 3: Render the selected Hero controls safely**

  Compute a validated alignment value and visibility booleans. Render each `RouterLink` only when its corresponding visibility setting is enabled, and apply `textAlign`/`justifyContent` to the Hero copy and CTA row. Keep mobile CSS behavior intact.

- [x] **Step 4: Run the focused contracts**

  Run:

  ```powershell
  node --test frontend/src/builder/fieldCatalog.test.js frontend/src/builder/personalization.test.js frontend/src/views/HomeView.copy.test.js
  ```

  Expected: all focused tests pass.

### Task 3: Make the control discoverable in the inspector

**Files:**
- Modify: `frontend/src/builder/BuilderToolbar.vue`
- Modify: `frontend/src/builder/editorShell.test.js`

**Interfaces:**
- Consumes: the Home field catalog and existing `boolean`/`select` field renderers.
- Produces: clear helper copy telling the administrator that Hero buttons can be shown/hidden and aligned from Home → Hero.

- [x] **Step 1: Add a concise Hero controls hint**

  Add the hint near the Home Hero inspector fields: `Use the checkboxes to show or hide either button. Alignment moves the Hero text and buttons together.`

- [x] **Step 2: Add the editor contract**

  Assert that the toolbar exposes `Show primary button`, `Show secondary button`, and the alignment hint.

- [x] **Step 3: Run editor contracts**

  Run:

  ```powershell
  node --test frontend/src/builder/editorShell.test.js frontend/src/builder/fieldCatalog.test.js
  ```

  Expected: all tests pass.

### Task 4: Verify and publish

**Files:**
- Modify: `scripts/audit-editor-clarity.cjs` only if a stable Home Hero selector is required.

- [x] **Step 1: Run the full test suite**

  ```powershell
  node --test frontend/src/**/*.test.js backend/**/*.test.js
  ```

  Expected: all tests pass.

- [x] **Step 2: Build the frontend**

  ```powershell
  npm run build --prefix frontend
  ```

  Expected: Vite exits with code 0 and writes `frontend/dist`.

- [x] **Step 3: Run the headless editor audit**

  Confirm the editor still adds/removes/centers a custom button, keeps responsive previews error-free, and reports no console errors.

- [x] **Step 4: Deploy hosting**

  ```powershell
  npm.cmd exec --yes --package=firebase-tools -- firebase deploy --only hosting --project jewish-educational-resources --non-interactive
  ```

- [x] **Step 5: Verify production output**

  Fetch `https://jewisheducationalresources.org/` and the new Home asset, confirm HTTP 200, and confirm the published bundle contains the Hero visibility labels and alignment setting keys.
