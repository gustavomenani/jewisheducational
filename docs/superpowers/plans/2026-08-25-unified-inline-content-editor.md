# Unified Inline Content Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an administrator edit every owner-managed public text directly in the visual preview, while preserving protected site behavior and stable public URLs.

**Architecture:** Add one `EditableContentText` component for category, material, and quick-topic records. It uses a small binding module to allow only explicit text fields, and a transactional store API so one typing session produces one reversible publish operation. Reuse the component wherever public records are rendered; static template copy remains on `EditableSetting`, and interactions such as search, forms, purchase, preview, and download retain their existing components and handlers.

**Tech Stack:** Vue 3 Composition API, Pinia, Vite, Node.js `node:test`, Playwright, Express editor publish API, Firebase Hosting.

**Spec:** `docs/superpowers/specs/2026-08-25-unified-inline-content-editor-design.md`

## Global Constraints

- Public visitors must never receive `contenteditable`, editor controls, or draft content.
- Persist plain text only; paste keeps text and line breaks, never foreign HTML, scripts, or pasted formatting.
- Editable record fields are restricted to: quick-topic `label`; category `name` and `description`; material `title`, `description`, `content_description`, `material_type`, `grade_level`, `age_range`, `page_layout.hero.title`, and `page_layout.hero.subtitle`.
- Category names and material titles are required at publish time; optional text may intentionally be an empty string.
- Editing a category or material name/title through `/editor/publish` must not change its existing `slug`.
- Keep `POST /editor/publish`, its revision conflict behavior, draft recovery, undo/redo, discard, upload staging, and current admin authorization.
- Do not make search terms, result counts, filter labels, logged-in user data, quota messages, payment state, file names, or protected action labels editable as content records.
- UI copy added by this feature is English-only and must be keyboard accessible.
- Validate with unit tests, the full release gate, and Playwright desktop/tablet/mobile before production deployment.

---

## File Structure

- Create: `frontend/src/builder/contentTextBindings.js` — allow-list, value resolver, and immutable patch builder for direct record text.
- Create: `frontend/src/builder/contentTextBindings.test.js` — pure binding and nested resource-layout patch coverage.
- Create: `frontend/src/builder/EditableContentText.vue` — direct preview editor with plain-text paste and a contextual “More options” action.
- Create: `frontend/src/builder/editableContentText.test.js` — source-level component contract for editor-only behavior and safe paste.
- Modify: `frontend/src/builder/store.js` — selection state and a single-history-step inline-content transaction API.
- Modify: `frontend/src/builder/storeContract.test.js` — store API/history contract checks.
- Modify: `frontend/src/builder/EditorWorkspace.vue` — keep inline record selection in the canvas instead of opening the content panel immediately.
- Modify: `frontend/src/builder/EditorContentPanel.vue` — receive “More options” selection and focus the matching record form.
- Modify: `frontend/src/views/HomeView.vue` — replace owner-managed topic/category/material text with direct bindings.
- Modify: `frontend/src/views/LibraryView.vue` — make category heading, description, breadcrumbs, child labels, and catalog material copy directly editable.
- Modify: `frontend/src/views/ResourceView.vue` — bind category/material text and active hero-layout overrides; render `content_description` as one editable plain-text region.
- Modify: `frontend/src/views/DownloadView.vue` — bind the resource breadcrumb and resource title without altering the download action.
- Modify: `frontend/src/views/PresentationView.vue`, `frontend/src/views/FavoritesView.vue`, `frontend/src/views/AccountView.vue` — bind material/category labels that are owner-managed records.
- Modify: `frontend/src/layouts/PublicLayout.vue`, `frontend/src/components/K5TopNavItem.vue`, `frontend/src/components/K5DrawerCategoryTree.vue`, and `frontend/src/components/K5CategorySidebar.vue` — bind category names in desktop/mobile navigation, footer, and sidebar while preserving navigation behavior.
- Modify: `backend/routes/editor.js` — validate direct editor text updates and preserve slugs on category/material update operations.
- Modify: `backend/routes/editorContract.test.js` and create `backend/routes/editor.behavior.test.js` — prove accepted fields and slug stability through publish behavior.
- Modify: `qa/playwright/tests/public-and-flows.spec.mjs` — browser regression coverage for direct category/material/topic editing, undo/discard, responsive previews, and protected actions.

## Task 1: Define the direct-content text binding boundary

**Files:**

- Create: `frontend/src/builder/contentTextBindings.js`
- Create: `frontend/src/builder/contentTextBindings.test.js`

**Interfaces:**

- Consumes: `parseResourcePageLayout(raw)` from `frontend/src/utils/resourcePage.js`.
- Produces:
  - `contentTextBinding(entity, field): { entity, field, required, storageKey } | null`
  - `contentTextValue(item, entity, field): string`
  - `contentTextPatch(item, entity, field, value): Record<string, string> | null`
  - `isContentTextBinding(entity, field): boolean`

- [ ] **Step 1: Write the failing binding tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contentTextBinding,
  contentTextPatch,
  contentTextValue,
  isContentTextBinding,
} from './contentTextBindings.js';

test('only explicit owner-managed text fields are bindable', () => {
  assert.equal(isContentTextBinding('category', 'name'), true);
  assert.equal(isContentTextBinding('material', 'content_description'), true);
  assert.equal(isContentTextBinding('topic', 'label'), true);
  assert.equal(isContentTextBinding('material', 'slug'), false);
  assert.equal(isContentTextBinding('file', 'original_name'), false);
  assert.equal(contentTextBinding('material', 'title').required, true);
});

test('a hero override is read and patched without mutating the source item', () => {
  const item = { page_layout: JSON.stringify({ hero: { title: 'Old hero' } }) };
  const patch = contentTextPatch(item, 'material', 'page_layout.hero.title', 'New hero');
  assert.equal(contentTextValue(item, 'material', 'page_layout.hero.title'), 'Old hero');
  assert.deepEqual(JSON.parse(patch.page_layout).hero.title, 'New hero');
  assert.equal(JSON.parse(item.page_layout).hero.title, 'Old hero');
});

test('plain record values preserve intentional empty text', () => {
  assert.equal(contentTextValue({ description: '' }, 'material', 'description'), '');
  assert.deepEqual(contentTextPatch({ name: 'Old' }, 'category', 'name', ''), { name: '' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test frontend/src/builder/contentTextBindings.test.js`

Expected: FAIL because `contentTextBindings.js` does not exist.

- [ ] **Step 3: Implement the allow-list and patch functions**

```js
import { parseResourcePageLayout } from '@/utils/resourcePage';

const BINDINGS = {
  topic: { label: { required: true, storageKey: 'quickTopics' } },
  category: {
    name: { required: true, storageKey: 'name' },
    description: { required: false, storageKey: 'description' },
  },
  material: {
    title: { required: true, storageKey: 'title' },
    description: { required: false, storageKey: 'description' },
    content_description: { required: false, storageKey: 'content_description' },
    material_type: { required: false, storageKey: 'material_type' },
    grade_level: { required: false, storageKey: 'grade_level' },
    age_range: { required: false, storageKey: 'age_range' },
    'page_layout.hero.title': { required: false, storageKey: 'page_layout' },
    'page_layout.hero.subtitle': { required: false, storageKey: 'page_layout' },
  },
};

export function contentTextBinding(entity, field) {
  const definition = BINDINGS[entity]?.[field];
  return definition ? { entity, field, ...definition } : null;
}

export function isContentTextBinding(entity, field) {
  return Boolean(contentTextBinding(entity, field));
}

export function contentTextValue(item, entity, field) {
  if (!contentTextBinding(entity, field) || !item) return '';
  if (!field.startsWith('page_layout.')) return String(item[field] ?? '');
  const layout = parseResourcePageLayout(item.page_layout);
  return String(layout.hero?.[field.split('.').at(-1)] ?? '');
}

export function contentTextPatch(item, entity, field, value) {
  if (!contentTextBinding(entity, field)) return null;
  const text = String(value ?? '');
  if (!field.startsWith('page_layout.')) return { [field]: text };
  const layout = parseResourcePageLayout(item?.page_layout);
  layout.hero[field.split('.').at(-1)] = text;
  return { page_layout: JSON.stringify(layout) };
}
```

Keep `BINDINGS` private so consumers cannot add arbitrary dotted paths from a template.

- [ ] **Step 4: Run the binding tests**

Run: `node --test frontend/src/builder/contentTextBindings.test.js`

Expected: PASS with three tests.

- [ ] **Step 5: Commit the focused module**

```bash
git add frontend/src/builder/contentTextBindings.js frontend/src/builder/contentTextBindings.test.js
git commit -m "feat: define safe inline content bindings"
```

## Task 2: Add transactional inline-content editing to the builder store

**Files:**

- Modify: `frontend/src/builder/store.js`
- Modify: `frontend/src/builder/storeContract.test.js`

**Interfaces:**

- Consumes: the binding functions from Task 1 and existing `cloneContent`, `applyContentOperation`, `snapshotContent`, `recordAction`, and `persistContentDraft`.
- Produces:
  - `selectedContentText: Ref<{ entity: string, id: string | number, field: string } | null>`
  - `selectContentText(binding): boolean`
  - `beginInlineContentEdit(binding): boolean`
  - `setInlineContentText(binding, value): boolean`
  - `commitInlineContentEdit(): { committed: boolean, error: string }`
  - `cancelInlineContentEdit(): boolean`

- [ ] **Step 1: Write failing store contract tests**

```js
test('builder store exposes one transactional API for direct record text', () => {
  const source = readFileSync(new URL('./store.js', import.meta.url), 'utf8');
  for (const token of [
    'selectedContentText',
    'selectContentText',
    'beginInlineContentEdit',
    'setInlineContentText',
    'commitInlineContentEdit',
    'cancelInlineContentEdit',
  ]) assert.ok(source.includes(token), `Missing inline content capability: ${token}`);
});

test('a direct typing session records one content action only on commit', () => {
  const source = readFileSync(new URL('./store.js', import.meta.url), 'utf8');
  assert.match(source, /let activeInlineContentSnapshot = null/);
  assert.match(source, /contentHistory\.value\.push\(before\)/);
  assert.match(source, /recordAction\('content'\)/);
  assert.match(source, /operations: \[\.\.\.pendingContent\.value\.operations, operation\]/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test frontend/src/builder/storeContract.test.js`

Expected: FAIL with missing inline-content capability.

- [ ] **Step 3: Implement selection and coalesced history**

Add this state near `selectedSetting`, clear it in every existing reset/disable/switch/discard/publish path, and clear other selections from `selectContentText`:

```js
const selectedContentText = ref(null);
let activeInlineContentSnapshot = null;
let activeInlineContentBinding = null;

function selectContentText(binding) {
  if (!contentTextBinding(binding?.entity, binding?.field) || !contentItem(binding.entity, binding.id)) return false;
  selectedContentText.value = { entity: binding.entity, id: binding.id, field: binding.field };
  selectedSetting.value = null;
  selectedId.value = null;
  selectedSectionId.value = null;
  selectedDocumentItem.value = null;
  return true;
}

function beginInlineContentEdit(binding) {
  if (!selectContentText(binding)) return false;
  if (!activeInlineContentSnapshot) {
    activeInlineContentSnapshot = {
      draft: cloneContent(contentDraft.value),
      pending: cloneContent(pendingContent.value),
      uploads: contentUploads.value.map((upload) => ({ ...upload })),
    };
    activeInlineContentBinding = { ...selectedContentText.value };
  }
  return true;
}
```

Extend `contentItem(entity, id)` so `entity === 'topic'` returns the matching record in `contentDraft.value.quickTopics`; extend the snapshot helper in the same way. Implement `setInlineContentText` by resolving the item, calling `contentTextPatch`, and applying that patch only to `contentDraft`. For `topic`, replace just the matching `quickTopics` record in `contentDraft`; do not add an operation during keystrokes. Do not call `snapshotContent`, `recordAction`, or `persistContentDraft` in this method.

Implement `commitInlineContentEdit` as follows:

```js
const before = activeInlineContentSnapshot;
const binding = activeInlineContentBinding;
activeInlineContentSnapshot = null;
activeInlineContentBinding = null;
if (!before || !binding) return { committed: false, error: '' };
const previous = contentItemFromSnapshot(before.draft, binding);
const current = contentItem(binding.entity, binding.id);
const beforeValue = contentTextValue(previous, binding.entity, binding.field);
const afterValue = contentTextValue(current, binding.entity, binding.field);
if (beforeValue === afterValue) return { committed: false, error: '' };
if (contentTextBinding(binding.entity, binding.field).required && !afterValue.trim()) {
  restoreContentSnapshot(before);
  recomputeDirty();
  return { committed: false, error: 'A category name or material title cannot be empty.' };
}
const patch = contentTextPatch(previous, binding.entity, binding.field, afterValue);
if (binding.entity === 'topic') {
  pendingContent.value = { ...pendingContent.value, quickTopics: cloneContent(contentDraft.value.quickTopics) };
} else {
  const operation = { opId: uid('op'), entity: binding.entity, action: 'update', id: binding.id, data: patch };
  pendingContent.value = { ...pendingContent.value, operations: [...pendingContent.value.operations, operation] };
}
contentHistory.value.push(before);
if (contentHistory.value.length > MAX_HISTORY) contentHistory.value.shift();
recordAction('content');
recomputeDirty();
persistContentDraft();
return { committed: true, error: '' };
```

`cancelInlineContentEdit` must restore the active snapshot, recompute dirty state, and return `true` only when a session was active. Add a local helper `contentItemFromSnapshot(snapshot, binding)` rather than reaching into a live store collection.

Expose `selectedContentText`, `selectContentText`, `beginInlineContentEdit`, `setInlineContentText`, `commitInlineContentEdit`, and `cancelInlineContentEdit` from the Pinia return object. Reset `activeInlineContentSnapshot`, `activeInlineContentBinding`, and `selectedContentText` anywhere the current store already resets `activeInlineSettingSnapshot` or clears selection.

- [ ] **Step 4: Run the store contract tests**

Run: `node --test frontend/src/builder/storeContract.test.js`

Expected: PASS, including existing store contract tests.

- [ ] **Step 5: Commit the transactional store change**

```bash
git add frontend/src/builder/store.js frontend/src/builder/storeContract.test.js
git commit -m "feat: make inline content edits reversible"
```

## Task 3: Build the reusable direct preview editor

**Files:**

- Create: `frontend/src/builder/EditableContentText.vue`
- Create: `frontend/src/builder/editableContentText.test.js`

**Interfaces:**

- Consumes: Task 1 binding helpers and Task 2 builder methods.
- Produces a component with props:

```js
{
  entity: { type: String, required: true },
  item: { type: Object, required: true },
  field: { type: String, required: true },
  tag: { type: String, default: 'span' },
  placeholder: { type: String, default: 'Text…' },
  label: { type: String, default: '' },
}
```

- [ ] **Step 1: Write the failing component contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('direct content editor is editor-only, text-only, and has More options', () => {
  const source = readFileSync(new URL('./EditableContentText.vue', import.meta.url), 'utf8');
  for (const token of [
    'contentTextValue', 'beginInlineContentEdit', 'setInlineContentText',
    'commitInlineContentEdit', 'cancelInlineContentEdit', 'text/plain',
    'editor:content-select', 'More options', 'contenteditable',
  ]) assert.ok(source.includes(token), `Missing direct content editor behavior: ${token}`);
  assert.match(source, /builder\.editMode && builder\.canEdit/);
  assert.match(source, /event\.preventDefault\(\)/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test frontend/src/builder/editableContentText.test.js`

Expected: FAIL because `EditableContentText.vue` does not exist.

- [ ] **Step 3: Implement `EditableContentText.vue`**

Use `EditableSetting.vue` as the interaction reference, with these exact behavioral differences:

```js
const binding = computed(() => ({ entity: props.entity, id: props.item?.id, field: props.field }));
const canEdit = computed(() => builder.editMode && builder.canEdit && isContentTextBinding(props.entity, props.field));
const value = computed(() => contentTextValue(props.item, props.entity, props.field));
const selected = computed(() => canEdit.value
  && builder.selectedContentText?.entity === props.entity
  && String(builder.selectedContentText?.id) === String(props.item?.id)
  && builder.selectedContentText?.field === props.field);

function begin(event) {
  if (!canEdit.value) return;
  event.preventDefault();
  event.stopPropagation();
  builder.beginInlineContentEdit(binding.value);
}

function update(event) {
  if (canEdit.value) builder.setInlineContentText(binding.value, event.currentTarget.innerText || '');
}

function finish(event) {
  const result = canEdit.value ? builder.commitInlineContentEdit() : { error: '' };
  if (result.error && event?.currentTarget) event.currentTarget.innerText = value.value;
}

function moreOptions(event) {
  event.preventDefault();
  event.stopPropagation();
  window.dispatchEvent(new CustomEvent('editor:content-select', {
    detail: { ...binding.value, field: props.field, inline: false },
  }));
}
```

For paste, read only `event.clipboardData.getData('text/plain')`, insert text through `document.execCommand('insertText', false, plainText)` when supported, fall back to a text node/range, then call `update`. Use `@keydown.capture` to prevent Enter for single-line tags (`span`, headings, and labels), allow it for `p` and `div`, and add Escape handling that calls `builder.cancelInlineContentEdit()` and restores `elementRef.innerText = value`.

Render the “More options” button only when `selected`; give it `type="button"`, `aria-label="Open content options"`, and a compact `.editable-content-more` style. Render no button and no editor attributes for visitors.

- [ ] **Step 4: Run the component contract test**

Run: `node --test frontend/src/builder/editableContentText.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the preview component**

```bash
git add frontend/src/builder/EditableContentText.vue frontend/src/builder/editableContentText.test.js
git commit -m "feat: add direct editable content text"
```

## Task 4: Keep inline selection in context and retain the full content panel

**Files:**

- Modify: `frontend/src/builder/EditorWorkspace.vue`
- Modify: `frontend/src/builder/EditorContentPanel.vue`
- Modify: `frontend/src/builder/editorShell.test.js`

**Interfaces:**

- Consumes: `detail.inline` and `detail.field` from `EditableContentText`.
- Produces: inline clicks stay in preview; the component’s “More options” opens the matching content form.

- [ ] **Step 1: Add failing shell assertions**

```js
test('inline record editing stays on canvas while More options opens the content form', () => {
  const workspace = source('EditorWorkspace.vue');
  const panel = source('EditorContentPanel.vue');
  assert.ok(workspace.includes('event.detail?.inline'));
  assert.ok(workspace.includes('builder.selectContentText'));
  assert.ok(panel.includes('event.detail?.field'));
  assert.ok(panel.includes('editor:content-select'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test frontend/src/builder/editorShell.test.js`

Expected: FAIL with missing inline record handling.

- [ ] **Step 3: Update selection routing**

In `EditorWorkspace.vue`, branch before clearing selection:

```js
function handleContentSelection(event) {
  if (!builder.editMode || !event.detail?.entity || event.detail.forwarded) return;
  if (event.detail.inline) {
    builder.selectContentText(event.detail);
    return;
  }
  builder.clearSelection();
  ui.setInsertionTarget(null);
  ui.openPanel('content');
  ui.sidebarOpen.value = true;
  window.setTimeout(() => window.dispatchEvent(new CustomEvent('editor:content-select', {
    detail: { ...event.detail, forwarded: true },
  })), 0);
}
```

In `EditorContentPanel.vue`, retain its category/material `handleCanvasSelection` behavior, but use `detail.field` to set an accessible form focus target after `editEntity`. Do not use `field` to auto-save or to expose fields outside the existing category/material form. For quick topics, select the topic form using its existing topic edit path.

- [ ] **Step 4: Run the shell tests**

Run: `node --test frontend/src/builder/editorShell.test.js`

Expected: PASS with all existing shell tests.

- [ ] **Step 5: Commit canvas/content-panel coordination**

```bash
git add frontend/src/builder/EditorWorkspace.vue frontend/src/builder/EditorContentPanel.vue frontend/src/builder/editorShell.test.js
git commit -m "feat: keep direct content editing in preview"
```

## Task 5: Wire category, topic, and material text across public navigation, Home, and Library

**Files:**

- Modify: `frontend/src/layouts/PublicLayout.vue`
- Modify: `frontend/src/components/K5TopNavItem.vue`
- Modify: `frontend/src/components/K5DrawerCategoryTree.vue`
- Modify: `frontend/src/components/K5CategorySidebar.vue`
- Modify: `frontend/src/views/HomeView.vue`
- Modify: `frontend/src/views/LibraryView.vue`
- Modify: `frontend/src/editorClientFeedback.test.js`

**Interfaces:**

- Consumes: `EditableContentText` from Task 3.
- Produces: every rendered category name, quick-topic label, and material title/description in header/footer/Home/Library is directly editable when its backing record is in `contentDraft`.

- [ ] **Step 1: Write failing public-source coverage assertions**

```js
test('public catalog and navigation bind record text directly instead of opening only the side panel', () => {
  const files = [
    'layouts/PublicLayout.vue', 'components/K5TopNavItem.vue', 'components/K5DrawerCategoryTree.vue',
    'components/K5CategorySidebar.vue', 'views/HomeView.vue', 'views/LibraryView.vue',
  ];
  for (const file of files) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.ok(source.includes('EditableContentText'), `${file} must use direct content text`);
  }
  const library = readFileSync(new URL('./views/LibraryView.vue', import.meta.url), 'utf8');
  assert.ok(library.includes("field=\"name\""));
  assert.ok(library.includes("field=\"description\""));
  assert.ok(library.includes("field=\"title\""));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test frontend/src/editorClientFeedback.test.js`

Expected: FAIL because public record rendering has raw moustache text.

- [ ] **Step 3: Replace only owner-managed record text**

Import `EditableContentText` into every listed component. For a category object, use this pattern inside its existing `RouterLink`/button rather than moving the link or changing its destination:

```vue
<EditableContentText
  entity="category"
  :item="node"
  field="name"
  tag="span"
  placeholder="Category name…"
/>
```

For Home, use `entity="topic" field="label"` for `quickTopics`, `entity="category" field="name"` for explore/stack category records, and material fields on featured/recent cards:

```vue
<EditableContentText entity="material" :item="item" field="title" tag="h3" />
<EditableContentText
  v-if="item.description"
  entity="material"
  :item="item"
  field="description"
  tag="p"
  placeholder="Short description…"
/>
```

When the Home card currently falls back from an empty material description to `item.category_name` or a fixed message, keep that fallback read-only: it is derived display copy, not a safe write target. Make the actual material description editable whenever it exists or the editor is active, and show the existing fallback only for public empty records.

In `LibraryView.vue`, make these concrete replacements:

```vue
<EditableContentText entity="category" :item="currentCategory" field="name" tag="span" />
<EditableContentText entity="category" :item="currentCategory" field="description" tag="span" />
<EditableContentText entity="category" :item="child" field="name" tag="span" />
<EditableContentText entity="material" :item="item" field="title" tag="span" />
<EditableContentText v-if="item.description || builder.editMode" entity="material" :item="item" field="description" tag="p" />
```

For a breadcrumb or category label supplied as `category_name`, find the authoritative category in the existing draft category collection by `category_id` or `category_slug`; render `EditableContentText` only when found. Keep raw API fallbacks visible but non-editable if the API has no authoritative category record.

Do not wrap filter option labels, result counts, search controls, `material_type` filters, or user-facing system messages in the component.

- [ ] **Step 4: Run the public source test**

Run: `node --test frontend/src/editorClientFeedback.test.js`

Expected: PASS.

- [ ] **Step 5: Commit Home/Library/navigation bindings**

```bash
git add frontend/src/layouts/PublicLayout.vue frontend/src/components/K5TopNavItem.vue frontend/src/components/K5DrawerCategoryTree.vue frontend/src/components/K5CategorySidebar.vue frontend/src/views/HomeView.vue frontend/src/views/LibraryView.vue frontend/src/editorClientFeedback.test.js
git commit -m "feat: edit catalog content directly across public pages"
```

## Task 6: Wire Resource, Download, presentation, favorites, and account views

**Files:**

- Modify: `frontend/src/views/ResourceView.vue`
- Modify: `frontend/src/views/DownloadView.vue`
- Modify: `frontend/src/views/PresentationView.vue`
- Modify: `frontend/src/views/FavoritesView.vue`
- Modify: `frontend/src/views/AccountView.vue`
- Modify: `frontend/src/editorClientFeedback.test.js`

**Interfaces:**

- Consumes: Task 3 component and Task 1 `contentTextValue` for a conditional hero override binding.
- Produces: direct material/category copy in all resource-oriented public surfaces, while buttons, download flow, PDF preview, and account fields stay protected.

- [ ] **Step 1: Add failing source assertions for resource-oriented screens**

```js
test('resource-oriented views bind material text and preserve protected actions', () => {
  for (const file of ['views/ResourceView.vue', 'views/DownloadView.vue', 'views/PresentationView.vue', 'views/FavoritesView.vue', 'views/AccountView.vue']) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.ok(source.includes('EditableContentText'), `${file} must expose record text`);
  }
  const download = readFileSync(new URL('./views/DownloadView.vue', import.meta.url), 'utf8');
  assert.ok(download.includes('@click="confirmDownload"'));
  assert.ok(download.includes('EditableContentText'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test frontend/src/editorClientFeedback.test.js`

Expected: FAIL with missing direct content bindings on these views.

- [ ] **Step 3: Bind resource page title/subtitle safely**

In `ResourceView.vue`, keep the current `displayTitle`/`displaySubtitle` values for public behavior, then add computed bindings which select the real source:

```js
const titleBinding = computed(() => pageLayout.value.hero.title
  ? { entity: 'material', id: editableResource.value?.id, field: 'page_layout.hero.title' }
  : { entity: 'material', id: editableResource.value?.id, field: 'title' });
const subtitleBinding = computed(() => pageLayout.value.hero.subtitle
  ? { entity: 'material', id: editableResource.value?.id, field: 'page_layout.hero.subtitle' }
  : { entity: 'material', id: editableResource.value?.id, field: 'description' });
```

Render `<EditableContentText v-bind="titleBinding" :item="editableResource" tag="h1" />` and the equivalent subtitle. This means a custom hero title remains a custom hero title, while a blank custom hero title edits the resource title; neither choice changes the resource route.

Replace the split paragraph loop for `content_description` with one `EditableContentText` in edit mode and keep the existing paragraph loop for visitors:

```vue
<EditableContentText
  v-if="builder.editMode && builder.canEdit"
  entity="material"
  :item="editableResource"
  field="content_description"
  tag="div"
  class="k5-desc k5-desc-wide mt-4"
  placeholder="What is in this file…"
/>
<div v-else-if="contentParagraphs.length" class="k5-desc k5-desc-wide mt-4">
  <p v-for="(para, index) in contentParagraphs" :key="index">{{ para }}</p>
</div>
```

Use direct bindings for authoritative category records in breadcrumbs, the sidebar, download-page breadcrumb/title, presentation title, favorites title/category, and account resource title. Retain existing click handlers and `RouterLink` targets. Do not make `fileLabel`, quota text, download CTA, preview action, favorite state, or server error messages editable.

- [ ] **Step 4: Run the resource source test**

Run: `node --test frontend/src/editorClientFeedback.test.js`

Expected: PASS.

- [ ] **Step 5: Commit resource-oriented bindings**

```bash
git add frontend/src/views/ResourceView.vue frontend/src/views/DownloadView.vue frontend/src/views/PresentationView.vue frontend/src/views/FavoritesView.vue frontend/src/views/AccountView.vue frontend/src/editorClientFeedback.test.js
git commit -m "feat: edit resource content across public flows"
```

## Task 7: Harden publish validation and retain stable links

**Files:**

- Modify: `backend/routes/editor.js`
- Modify: `backend/routes/editorContract.test.js`
- Create: `backend/routes/editor.behavior.test.js`

**Interfaces:**

- Consumes: existing `CATEGORY_FIELDS`, `MATERIAL_FIELDS`, `pickFields`, `publicationInputError`, and database memory adapter.
- Produces: editor category/material updates reject non-string/oversize direct text values, accept intentional empty optional values, require nonempty title/name, and never regenerate slugs during update.

- [ ] **Step 1: Write failing contract and behavior tests**

Add this assertion to `editorContract.test.js`:

```js
test('editor update keeps public slugs stable while allowing content title changes', () => {
  assert.ok(source.includes('normalizeEditorTextFields'));
  assert.doesNotMatch(
    source,
    /if \(next\.name && next\.name\.trim\(\) !== existing\.name\) \{[\s\S]*?next\.slug\s*=/,
  );
  assert.doesNotMatch(
    source,
    /if \(next\.title && next\.title\.trim\(\) !== existing\.title\) \{[\s\S]*?next\.slug\s*=/,
  );
});
```

Create `editor.behavior.test.js` with the same temporary memory database/server setup used by `reliability.behavior.test.js`, plus these concrete helpers:

```js
async function editorContent() {
  const response = await fetch(`${baseUrl}/api/editor/content`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function publishOperations(operations) {
  const content = await editorContent();
  const form = new FormData();
  form.set('settings', '{}');
  form.set('content', JSON.stringify({
    quickTopics: content.quickTopics,
    operations,
    baseRevision: content.revision,
  }));
  form.set('base_revision', String(content.revision));
  form.set('file_manifest', '[]');
  return fetch(`${baseUrl}/api/editor/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: form,
  });
}

test('publishing category and material title edits preserves existing slugs', async () => {
  const beforeCategory = await db.categoryFindById(1);
  const beforeMaterial = await db.resourceFindById(1);
  const response = await publishOperations([
    { opId: 'cat-title', entity: 'category', action: 'update', id: 1, data: { name: 'New category name' } },
    { opId: 'mat-title', entity: 'material', action: 'update', id: 1, data: { title: 'New material title' } },
  ]);
  assert.equal(response.status, 200);
  assert.equal((await db.categoryFindById(1)).slug, beforeCategory.slug);
  assert.equal((await db.resourceFindById(1)).slug, beforeMaterial.slug);
});

test('publish rejects an empty required title and accepts an empty optional description', async () => {
  const rejected = await publishOperations([{ opId: 'bad', entity: 'material', action: 'update', id: 1, data: { title: '' } }]);
  assert.equal(rejected.status, 400);
  const accepted = await publishOperations([{ opId: 'ok', entity: 'material', action: 'update', id: 1, data: { description: '' } }]);
  assert.equal(accepted.status, 200);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test backend/routes/editorContract.test.js backend/routes/editor.behavior.test.js`

Expected: FAIL because updates currently regenerate `slug` and do not normalize direct text fields.

- [ ] **Step 3: Normalize text fields and remove update-time slug generation**

Add a local helper in `editor.js`:

```js
const REQUIRED_EDITOR_TEXT_FIELDS = new Set(['name', 'title']);
const OPTIONAL_EDITOR_TEXT_FIELDS = new Set([
  'description', 'content_description', 'age_range', 'grade_level', 'material_type', 'keywords',
]);

function normalizeEditorTextFields(next) {
  for (const key of [...REQUIRED_EDITOR_TEXT_FIELDS, ...OPTIONAL_EDITOR_TEXT_FIELDS]) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
    if (typeof next[key] !== 'string') throw publicationInputError(`${key} must be text.`);
    if (next[key].length > 12000) throw publicationInputError(`${key} is too long.`);
    if (REQUIRED_EDITOR_TEXT_FIELDS.has(key)) {
      next[key] = next[key].trim();
      if (!next[key]) throw publicationInputError(key === 'name' ? 'Category name is required.' : 'Material title is required.');
    }
  }
  return next;
}
```

Call it immediately after `pickFields` in both category and material update branches. Delete only the two update-time blocks that assign `next.slug = await uniqueSlug(...)`; retain slug generation for **create** operations. Do not alter the standard `/resources/:id` admin route, because this plan changes only visual-editor publishing behavior.

- [ ] **Step 4: Run backend tests**

Run: `node --test backend/routes/editorContract.test.js backend/routes/editor.behavior.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the publish hardening**

```bash
git add backend/routes/editor.js backend/routes/editorContract.test.js backend/routes/editor.behavior.test.js
git commit -m "fix: preserve slugs for visual editor text changes"
```

## Task 8: Prove direct editing and protected behavior in a browser

**Files:**

- Modify: `qa/playwright/tests/public-and-flows.spec.mjs`

**Interfaces:**

- Consumes: known Playwright seed category `hebrew-language`, `RESOURCE_SLUG`, `authenticatePage`, `installDiagnostics`, and the existing three browser projects.
- Produces: regression proof for direct text editing, clean paste, undo/discard, responsive editor behavior, and unchanged search/download behavior.

- [ ] **Step 1: Write failing desktop Playwright tests**

```js
test('editor changes a category title and description directly across Library surfaces', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) <= 760, 'Covered by the compact editor test.');
  installDiagnostics(page);
  await authenticatePage(page);
  await page.goto('/library/category/hebrew-language?edit=1&area=library', { waitUntil: 'networkidle' });

  const title = page.locator('.k5-title [data-editor-content$=":name"]').first();
  await title.click();
  await expect(title).toHaveAttribute('contenteditable', 'true');
  await title.fill('Hebrew language updated');
  await title.blur();
  await expect(page.locator('.k5-sidebar').getByText('Hebrew language updated', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(title).not.toHaveText('Hebrew language updated');
  await page.getByRole('button', { name: 'Discard' }).click();
  assertDiagnostics(page);
});

test('editor changes a material title with plain-text paste and keeps download protected', async ({ page }) => {
  installDiagnostics(page);
  await authenticatePage(page);
  await page.goto(`/resource/${RESOURCE_SLUG}?edit=1&area=resource`, { waitUntil: 'networkidle' });
  const title = page.locator('.k5-resource-intro [data-editor-content$=":title"]').first();
  await title.click();
  await title.evaluate((element) => element.dispatchEvent(new ClipboardEvent('paste', {
    bubbles: true,
    clipboardData: new DataTransfer(),
  })));
  await title.fill('Editable material title');
  await title.blur();
  await expect(page.getByRole('button', { name: 'Worksheet', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Discard' }).click();
  assertDiagnostics(page);
});
```

Before adding the test, give `EditableContentText` deterministic attributes:

```vue
:data-editor-content="`${entity}:${item.id}:${field}`"
```

The suffix locators avoid assuming that a category slug is its numeric record id. Assert that the resulting `data-editor-content` begins with `category:` or `material:` in the corresponding test before filling it.

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm run test:e2e -- --grep "category title and description|material title with plain-text" --project=desktop`

Expected: FAIL because the new direct text attributes/components are absent.

- [ ] **Step 3: Make the browser tests deterministic and complete**

Implement the tests with these assertions:

1. Category title edits update heading, breadcrumb, and sidebar from the same draft record; `Undo` restores it; `Discard` returns latest published content.
2. Category description is editable directly on its category page.
3. Material title and description are editable directly on Resource and reflected on the Download page in the same authenticated SPA context.
4. HTML-flavored clipboard content produces text only; assert `innerHTML` has no tag such as `<b>` after paste.
5. “More options” opens the Content panel without navigating the public link.
6. The existing search toggle/filter test and authenticated download test continue to pass unchanged.
7. On tablet and mobile, direct text stays within the logical preview canvas and the editor panel can still be toggled; no editor tools appear after navigating to a non-edit URL.

Use `page.getByRole('button', { name: 'Discard' })` after every test that changes a draft. Do not click `Publish` in browser regression tests, so memory-seed state remains isolated.

- [ ] **Step 4: Run targeted tests on all viewport projects**

Run: `npm run test:e2e -- --grep "editor changes a category|editor changes a material"`

Expected: PASS for desktop, tablet, and mobile, with intentional skips only where a desktop-only control is unavailable.

- [ ] **Step 5: Commit the browser coverage**

```bash
git add qa/playwright/tests/public-and-flows.spec.mjs
git commit -m "test: cover direct content editing in the visual editor"
```

## Task 9: Run release validation and deploy only after a preview smoke test

**Files:**

- No source changes expected.

**Interfaces:**

- Consumes: all completed tasks, release environment configuration, Firebase project `jewish-educational-resources`.
- Produces: verified preview deployment and, after explicit smoke-test success, production hosting deployment.

- [ ] **Step 1: Run all source, backend, and build checks**

Run in PowerShell without printing the release key:

```powershell
$firebaseKeyLine = Get-Content -LiteralPath 'frontend\.env.production' | Where-Object { $_ -match '^\s*VITE_FIREBASE_API_KEY\s*=' } | Select-Object -First 1
$env:VITE_FIREBASE_API_KEY = ($firebaseKeyLine -replace '^\s*VITE_FIREBASE_API_KEY\s*=', '').Trim().Trim('"').Trim("'")
try { npm run verify:release } finally { Remove-Item Env:VITE_FIREBASE_API_KEY -ErrorAction SilentlyContinue }
```

Expected: all backend and frontend tests pass and the production Vite build succeeds.

- [ ] **Step 2: Run complete browser regression**

Run: `npm run test:e2e`

Expected: PASS on desktop, tablet, and mobile with no diagnostics, console errors, or failed same-origin requests.

- [ ] **Step 3: Deploy a time-limited Firebase preview**

Run:

```powershell
npm exec --yes --package=firebase-tools@13.35.1 -- firebase hosting:channel:deploy editor-v2 --expires 7d --project jewish-educational-resources --non-interactive
```

Expected: a preview URL is returned. Smoke-test that URL as an admin: edit one category title, a topic label, a material title/description, use Undo and Discard, then verify normal visitor search, login, preview, and download behavior in a separate session.

- [ ] **Step 4: Deploy production only after the preview smoke test passes**

Run:

```powershell
npm exec --yes --package=firebase-tools@13.35.1 -- firebase deploy --only hosting --project jewish-educational-resources --non-interactive
```

Expected: Firebase reports the hosting release completed. Confirm `/`, `/library/category/hebrew-language`, `/resource/alfabeto-hebraico-aleph-bet`, and `/login` return successfully and public pages do not expose `[contenteditable="true"]`.

- [ ] **Step 5: Record the validated release state**

Report the preview URL, production URL, exact commands/tests that passed, and any intentionally non-editable system fields retained by the global constraints.

## Self-Review

### Spec coverage

- Direct category/material/topic text editing: Tasks 1–6.
- Resource custom hero overrides: Tasks 1 and 6.
- Plain-text paste, direct preview, More options, undo/redo/discard/draft preservation: Tasks 2–4 and 8.
- Responsive desktop/tablet/mobile behavior and no visitor editor UI: Task 8.
- Protected search, forms, account actions, payment, preview, and download flows: Tasks 5, 6, and 8.
- Atomic existing publication pipeline, revision conflict retention, upload staging, admin authorization: preserved by Task 2’s store integration and verified by Task 9.
- Backend field restrictions and stable URLs: Task 7.
- Preview before production: Task 9.

### Placeholder scan

The red-flag scan is clean; every task includes concrete test code and exact commands.

### Type consistency

The component’s `{ entity, id, field }` binding matches the store’s `selectedContentText` and transactional APIs. `contentTextBinding`, `contentTextValue`, and `contentTextPatch` are defined in Task 1 and used under those exact names in Tasks 2, 3, and 6. The only nested allowed paths are `page_layout.hero.title` and `page_layout.hero.subtitle`.
