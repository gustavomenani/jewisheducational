# Expanded Visual Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give administrators a discoverable, stable visual editor with one-click selection, a unified content inspector, more editable site fields, reliable undo/redo, section controls, and English-only editor copy.

**Architecture:** Extend the existing Pinia builder store instead of replacing the working settings API. A declarative field catalog supplies labels, types, defaults, and page groupings to the toolbar; inline text and image components select catalog entries and continue buffering changes through the builder. Dynamic Library, authentication, resource, and download behavior remains outside the free-form block canvas.

**Tech Stack:** Vue 3 Composition API, Pinia, Vue Router, Bootstrap Icons, Vite, Node.js built-in test runner, Firebase-backed `/api/settings`.

## Global Constraints

- Only authenticated administrators may enable or publish the editor.
- Existing administrator and registered-user access must remain unchanged.
- All new visible editor copy must be English.
- PDF contents are out of scope.
- Dynamic Library, authentication, resource, download, and payment behavior must not become removable free-form blocks.
- Existing published setting keys remain compatible.
- Unsafe URL protocols must be rejected.

---

### Task 1: Declarative editor field catalog

**Files:**
- Create: `frontend/src/builder/fieldCatalog.js`
- Create: `frontend/src/builder/fieldCatalog.test.js`

**Interfaces:**
- Produces: `EDITOR_AREAS`, `fieldsForArea(area)`, `fieldByKey(key)`, and `normalizeEditorUrl(value)`.
- Consumes: `APPEARANCE_DEFAULTS` from `frontend/src/utils/theme.js`.

- [ ] **Step 1: Write failing catalog tests**

```js
test('catalog exposes global and page fields', () => {
  assert.ok(fieldsForArea('global').some((field) => field.key === 'site_name'));
  assert.ok(fieldsForArea('home').some((field) => field.key === 'hero_title'));
  assert.equal(fieldByKey('library_clear_filters_label').default, 'Clear filters');
});

test('URL normalization rejects unsafe protocols', () => {
  assert.equal(normalizeEditorUrl('javascript:alert(1)'), null);
  assert.equal(normalizeEditorUrl('/library'), '/library');
  assert.equal(normalizeEditorUrl('https://example.com'), 'https://example.com/');
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `node --test frontend/src/builder/fieldCatalog.test.js`

Expected: FAIL because `fieldCatalog.js` does not exist.

- [ ] **Step 3: Implement the catalog**

Create grouped metadata with this shape:

```js
{
  key: 'hero_title',
  label: 'Hero title',
  type: 'text',
  default: APPEARANCE_DEFAULTS.hero_title,
  area: 'home',
  group: 'Hero'
}
```

Include global/header/footer/social fields and the existing Home, Library, Resource, and Download presentation settings. Export:

```js
export const EDITOR_AREAS = [
  { id: 'global', label: 'Header & Footer', icon: 'bi-window' },
  { id: 'home', label: 'Home', icon: 'bi-house' },
  { id: 'library', label: 'Library', icon: 'bi-collection' },
  { id: 'resource', label: 'Resource Page', icon: 'bi-file-earmark-text' },
  { id: 'download', label: 'Download Page', icon: 'bi-download' },
];

export function fieldsForArea(area) {
  return EDITOR_FIELDS.filter((field) => field.area === area);
}

export function fieldByKey(key) {
  return EDITOR_FIELDS.find((field) => field.key === key) || null;
}
```

Implement URL validation with `https:`, relative `/`, `mailto:`, and `tel:` only.

- [ ] **Step 4: Run catalog tests**

Run: `node --test frontend/src/builder/fieldCatalog.test.js`

Expected: PASS.

### Task 2: Builder selection, setting history, and draft recovery

**Files:**
- Modify: `frontend/src/builder/store.js`
- Create: `frontend/src/builder/storeContract.test.js`

**Interfaces:**
- Consumes: field metadata from `fieldCatalog.js`.
- Produces: `selectedSetting`, `selectSetting(meta)`, `clearSelection()`, `resetSetting(key)`, `redo()`, `canUndo`, and `canRedo`.

- [ ] **Step 1: Write a static contract test**

```js
test('builder store exposes unified selection and history controls', () => {
  const source = readFileSync(new URL('./store.js', import.meta.url), 'utf8');
  for (const token of ['selectedSetting', 'selectSetting', 'resetSetting', 'canUndo', 'canRedo', 'redo']) {
    assert.ok(source.includes(token), `Missing builder capability: ${token}`);
  }
  assert.ok(source.includes('version: 2'));
});
```

- [ ] **Step 2: Run the contract test and confirm it fails**

Run: `node --test frontend/src/builder/storeContract.test.js`

Expected: FAIL for missing selection/history tokens.

- [ ] **Step 3: Implement selection and history**

Add a setting-history stack that snapshots `pendingSettings` before changes and a future stack for redo. `undo()` and `redo()` prioritize the most recent setting edit when the selected item is a setting, while retaining existing block-layout history.

Use:

```js
const selectedSetting = ref(null);
const settingHistory = ref([]);
const settingFuture = ref([]);
const canUndo = computed(() => settingHistory.value.length > 0 || history.value.length > 0);
const canRedo = computed(() => settingFuture.value.length > 0);
```

`selectSetting(meta)` clears the selected block and stores normalized metadata. `resetSetting(key)` buffers an empty string so the existing fallback/default becomes visible.

Version local drafts:

```js
return {
  version: 2,
  savedAt: new Date().toISOString(),
  layout: clone(layout.value),
  pendingSettings: { ...pendingSettings.value },
  useCanvas: useCanvas.value,
};
```

Recovered drafts with pending values must set `dirty` to `true`.

- [ ] **Step 4: Run the contract test and frontend source tests**

Run: `node --test frontend/src/builder/storeContract.test.js frontend/src/i18n/visibleEnglish.test.js`

Expected: PASS.

### Task 3: One-click inline selection and image controls

**Files:**
- Modify: `frontend/src/builder/EditableSetting.vue`
- Modify: `frontend/src/builder/EditableImage.vue`
- Create: `frontend/src/builder/editableComponents.test.js`

**Interfaces:**
- Consumes: `builder.selectSetting(meta)`, `builder.setSetting(key, value)`, and `builder.resetSetting(key)`.
- Produces: one-click editable text selection and explicit image upload/reset/alt/width controls.

- [ ] **Step 1: Write component contract tests**

```js
test('editable text uses one-click selection and English helper copy', () => {
  const source = readFileSync(new URL('./EditableSetting.vue', import.meta.url), 'utf8');
  assert.ok(source.includes('@click="startEdit"'));
  assert.ok(source.includes('Click to edit'));
  assert.equal(source.includes('Double-click'), false);
  assert.equal(source.includes('Editando'), false);
  assert.equal(source.includes('Salvo'), false);
});

test('editable image exposes metadata selection', () => {
  const source = readFileSync(new URL('./EditableImage.vue', import.meta.url), 'utf8');
  assert.ok(source.includes('altSettingKey'));
  assert.ok(source.includes('selectSetting'));
  assert.ok(source.includes('Reset image'));
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `node --test frontend/src/builder/editableComponents.test.js`

Expected: FAIL for missing one-click and image metadata behavior.

- [ ] **Step 3: Implement text selection**

Add optional `label`, `type`, `linkKey`, and `defaultLink` props. A single click in edit mode prevents navigation, selects the setting, enables content editing, and focuses the element. Use English visual labels: `Click to edit`, `Editing — press Enter to finish`, and `Saved to draft`.

- [ ] **Step 4: Implement image selection**

Add `label`, `altSettingKey`, `defaultAlt`, and `allowRemove` props. Clicking selects the image field rather than opening a hidden file picker immediately. Provide explicit `Change image` and `Reset image` buttons in the overlay. Resolve alt text through the builder setting when an alt key is supplied.

- [ ] **Step 5: Run component and English tests**

Run: `node --test frontend/src/builder/editableComponents.test.js frontend/src/i18n/visibleEnglish.test.js`

Expected: PASS.

### Task 4: Unified content inspector, page selector, and safe sections

**Files:**
- Modify: `frontend/src/builder/BuilderToolbar.vue`
- Modify: `frontend/src/views/admin/AppearanceView.vue`
- Modify: `frontend/src/layouts/PublicLayout.vue`
- Create: `frontend/src/builder/editorShell.test.js`

**Interfaces:**
- Consumes: `EDITOR_AREAS`, `fieldsForArea`, builder selection/history APIs, `LANDING_BLOCK_DEFS`, and `parseLandingBlockOrder`.
- Produces: Content, Theme, Sections, Blocks, and Publish tabs with area navigation.

- [ ] **Step 1: Write editor-shell contract tests**

```js
test('toolbar exposes content areas and safe editing actions', () => {
  const source = readFileSync(new URL('./BuilderToolbar.vue', import.meta.url), 'utf8');
  for (const phrase of ['Content', 'Sections', 'Header & Footer', 'Resource Page', 'Download Page', 'Redo']) {
    assert.ok(source.includes(phrase), `Missing editor shell copy: ${phrase}`);
  }
});

test('appearance dashboard exposes all supported areas', () => {
  const source = readFileSync(new URL('../views/admin/AppearanceView.vue', import.meta.url), 'utf8');
  for (const phrase of ['Home', 'Library', 'Header & Footer', 'Resource Page', 'Download Page']) {
    assert.ok(source.includes(phrase));
  }
});
```

- [ ] **Step 2: Run the shell tests and confirm they fail**

Run: `node --test frontend/src/builder/editorShell.test.js`

Expected: FAIL for missing areas and controls.

- [ ] **Step 3: Implement the Content inspector**

Add an area selector and searchable field list. Render controls from catalog types (`text`, `textarea`, `url`, `boolean`, `range`, `image`). Validate URLs before buffering them. When an inline element is selected, automatically open Content and scroll its field into view. Include Reset for each field.

- [ ] **Step 4: Implement navigation, undo/redo, and leave protection**

Add Home and Library preview navigation through Vue Router. Header/Footer, Resource, and Download groups remain editable from the field catalog even when no dynamic resource URL is available. Add undo/redo toolbar buttons and a `beforeunload` warning while `builder.dirty` is true.

- [ ] **Step 5: Implement safe Home section controls**

Use the existing landing-block definitions and order setting to show/hide and reorder Home sections. Buffer the resulting `landing_blocks_order` and show-key settings through the builder. Keep the free-form Blocks tab disabled with an explanation on dynamic pages.

- [ ] **Step 6: Upgrade the Appearance dashboard**

Replace the two plain buttons with five descriptive area cards. Home and Library open their live previews; global/template cards open Home with `?edit=1&area=<area>` so the correct inspector group is selected.

- [ ] **Step 7: Run editor-shell tests**

Run: `node --test frontend/src/builder/editorShell.test.js frontend/src/i18n/visibleEnglish.test.js`

Expected: PASS.

### Task 5: Expand editable coverage and remove remaining mixed-language copy

**Files:**
- Modify: `frontend/src/views/HomeView.vue`
- Modify: `frontend/src/views/LibraryView.vue`
- Modify: `frontend/src/layouts/PublicLayout.vue`
- Modify: `frontend/src/views/ResourceView.vue`
- Modify: `frontend/src/views/DownloadView.vue`
- Modify: `frontend/src/i18n/visibleEnglish.test.js`

**Interfaces:**
- Consumes: catalog setting keys and upgraded editable components.
- Produces: English defaults and broader editable labels, images, navigation, social links, and presentation copy.

- [ ] **Step 1: Expand the English-only regression patterns**

Add patterns for `Atalhos`, `Filtrar`, `Limpar filtros`, `Filtros ativos`, `Destaques`, `Title do card`, `Editando`, and `Salvo`.

- [ ] **Step 2: Run the English test and confirm it fails**

Run: `node --test frontend/src/i18n/visibleEnglish.test.js`

Expected: FAIL with the remaining mixed-language locations.

- [ ] **Step 3: Replace defaults and wire editable values**

Use `Quick filters:`, `Filter`, `Clear filters`, `Active filters:`, `Featured`, and `Card title…`. Add image alt keys where images are editable. Ensure global social destinations and footer copy exist in the catalog.

- [ ] **Step 4: Run all frontend source tests**

Run: `node --test frontend/src/**/*.test.js`

Expected: all frontend tests PASS.

### Task 6: Build and browser verification

**Files:**
- Modify only files required by defects found during verification.

**Interfaces:**
- Consumes: completed editor implementation.
- Produces: a production-ready build and verified editor/public behavior.

- [ ] **Step 1: Build the frontend**

Run: `npm run build --prefix frontend`

Expected: Vite exits with code 0 and creates `frontend/dist`.

- [ ] **Step 2: Run the backend regression suite**

Run: `npm test --prefix backend`

Expected: all backend tests PASS.

- [ ] **Step 3: Start or reuse the local application**

Run: `npm run dev`

Expected: frontend responds at `http://127.0.0.1:5173/` and backend health responds successfully.

- [ ] **Step 4: Verify with browser automation**

Check:

1. Admin Appearance shows all five editor areas.
2. Home opens with editor enabled.
3. Clicking text once selects and edits it.
4. Content panel changes a text field and Reset restores its default.
5. Image selection exposes upload, alt, width, and reset controls.
6. Home Sections can hide/show and move a section.
7. Undo and redo work.
8. Refresh recovers an explicitly saved draft.
9. Discard removes unpublished changes.
10. Library search, filters, and Grades menu remain functional.
11. Public pages contain no visible Portuguese editor copy.
12. Browser console has no uncaught application errors.

- [ ] **Step 5: Re-run automated verification after any fixes**

Run:

```powershell
node --test frontend/src/**/*.test.js
npm run build --prefix frontend
npm test --prefix backend
```

Expected: all commands exit with code 0.

- [ ] **Step 6: Record version-control limitation**

The workspace currently contains an empty `.git` directory, so commits cannot be created without reconstructing repository history. Preserve all files in place and do not initialize a replacement repository automatically.
