import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewCanvasStyle, previewWidth } from './preview.js';

const source = (file) => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');

test('preview modes keep real logical device widths and only scale to fit', () => {
  assert.equal(previewWidth('tablet'), 768);
  assert.equal(previewWidth('mobile'), 390);
  assert.equal(previewWidth('desktop'), null);
  assert.deepEqual(previewCanvasStyle('tablet', 900), { width: '768px', scale: 1, label: '768 px' });
  assert.deepEqual(previewCanvasStyle('tablet', 576), { width: '768px', scale: 0.75, label: '768 px · 75%' });
});

test('PublicLayout mounts the new workspace and preserves the framed canvas', () => {
  const layout = readFileSync(new URL('../layouts/PublicLayout.vue', import.meta.url), 'utf8');
  assert.ok(layout.includes("import EditorWorkspace from '@/builder/EditorWorkspace.vue'"));
  assert.ok(layout.includes('<EditorWorkspace />'));
  assert.ok(layout.includes('editor-preview-stage'));
  assert.ok(layout.includes('editor-preview-canvas'));
  assert.equal(layout.includes('<BuilderToolbar />'), false);
});

test('new editor shell is split into focused workspace components', () => {
  const workspace = source('EditorWorkspace.vue');
  const topBar = source('EditorTopBar.vue');
  const sidebar = source('EditorSidebar.vue');
  const inspector = source('EditorInspector.vue');
  const ui = source('editorUi.js');
  for (const phrase of ['EditorTopBar', 'EditorSidebar', 'EditorInspector', 'data-editor-workspace', 'data-editor-preview', 'beforeunload']) {
    assert.ok(workspace.includes(phrase), `Missing workspace contract: ${phrase}`);
  }
  for (const phrase of ['Undo', 'Redo', 'Discard', 'Publish', 'Saved', 'Unsaved changes', 'Publish failed']) {
    assert.ok(topBar.includes(phrase), `Missing top bar control: ${phrase}`);
  }
  for (const phrase of ['Insert', 'Pages', 'Themes', 'Image + text']) {
    assert.ok(sidebar.includes(phrase), `Missing sidebar control: ${phrase}`);
  }
  for (const phrase of ['Resource Page', 'Header & Footer']) assert.ok(ui.includes(phrase), `Missing page control: ${phrase}`);
  for (const phrase of ['Content', 'Layout', 'Actions', 'Duplicate', 'Move up', 'Remove', 'Center on page']) {
    assert.ok(inspector.includes(phrase), `Missing inspector control: ${phrase}`);
  }
  for (const phrase of ['EDITOR_PANEL_TABS', 'EDITOR_PAGES', 'EDITOR_SELECTION_KINDS']) {
    assert.ok(ui.includes(phrase), `Missing editor UI model: ${phrase}`);
  }
});

test('sidebar inserts only simple visual blocks into safe v2 zones on every editor page', () => {
  const sidebar = source('EditorSidebar.vue');
  const ui = source('editorUi.js');
  assert.ok(sidebar.includes('builder.addDocumentBlock'));
  assert.ok(sidebar.includes('builder.defaultDocumentZone'));
  assert.ok(sidebar.includes('legacyCanvasAllowed'));
  assert.ok(sidebar.includes('More options'));
  for (const page of ['Home', 'Library', 'Resource Page', 'Download Page', 'Login & account pages', 'Header & Footer']) {
    assert.ok(ui.includes(page), `Missing page: ${page}`);
  }
});

test('content panel exposes reversible topics, categories and materials', () => {
  const panel = source('EditorContentPanel.vue');
  const model = source('contentModel.js');
  for (const phrase of ['Topics', 'Categories', 'Materials', 'Visible', 'Removed', 'Restore', 'Duplicate', 'Hide', 'Move up', 'New category', 'New material', 'Cover image', 'Drop files here']) {
    assert.ok(panel.includes(phrase), `Missing content control: ${phrase}`);
  }
  for (const phrase of ['applyContentOperation', 'normalizeContentSnapshot', 'is_archived', 'quickTopics']) {
    assert.ok(model.includes(phrase), `Missing content model contract: ${phrase}`);
  }
});

test('hiding an open topic closes its editor form', () => {
  const panel = source('EditorContentPanel.vue');
  assert.match(
    panel,
    /if \(String\(topicForm\.value\?\.id\) === String\(action\.item\.id\)\) \{\s*topicForm\.value = null;/,
    'Hide should close the form for the topic that was just hidden',
  );
});

test('contextual inspector exposes constrained content, layout and safe actions', () => {
  const inspector = source('EditorInspector.vue');
  for (const phrase of ['selectedSetting', 'selectedBlock', 'selectedSection', 'setBlockProps', 'setBlockHidden', 'updateBlockLayout', 'updateSectionProps', 'Duplicate', 'Move up', 'Remove', 'Remove image', 'Remove text', 'Text removed from page', 'Image removed from page', 'Hide block', 'Restore block', 'Delete block', 'Delete section', 'Select section', 'Quick actions', 'Text block size in pixels', 'Hide this button', 'isImageSetting', 'isTextSetting', 'selectedImageRemoved', 'selectedTextRemoved', 'uploadSettingImage', 'visibilityKey', 'Visible on the page']) {
    assert.ok(inspector.includes(phrase), `Missing inspector behavior: ${phrase}`);
  }
  assert.ok(inspector.includes("field.type === 'select' || field.type === 'align'"));
  assert.ok(inspector.includes('type="file" accept="image/jpeg,image/png,image/webp"'));
  assert.match(inspector, /home_intro_primary.*home_intro_secondary/);
  assert.ok(inspector.includes('home_intro_primary_show'));
  assert.ok(inspector.includes('home_intro_secondary_show'));
});

test('home section controls use the native welcome visibility key', () => {
  const sidebar = source('EditorSidebar.vue');
  assert.ok(sidebar.includes("visibilityKey: 'home_intro_show'"));
  assert.ok(sidebar.includes('old `home_hero_show=false` cannot blank the new Home'));
});

test('inspector surfaces plain-language placement controls before advanced layout', () => {
  const inspector = source('EditorInspector.vue');
  for (const phrase of ['Place on page', 'Align left', 'Align center', 'Align right', 'Choose a width', 'Space around this item', 'Normal space', 'Section layout', 'Comfortable space']) {
    assert.ok(inspector.includes(phrase), `Missing simple placement control: ${phrase}`);
  }
  assert.ok(inspector.includes('setBlockPresentation'));
  assert.ok(inspector.includes('alignBlockPlacement'));
});

test('legacy canvas keeps direct text editing and clear remove controls in the workspace', () => {
  const renderer = source('BlockRenderer.vue');
  const store = source('store.js');
  assert.ok(renderer.includes('@click.stop="builder.editMode && builder.selectSection(section.id)"'));
  assert.ok(renderer.includes('body[data-editor-workspace] .br-section-bar'));
  assert.ok(renderer.includes('body[data-editor-workspace] .br-block-tools'));
  for (const phrase of ['Content section', 'Click text below to edit', 'Delete section', 'Delete text', 'Delete this section?', 'Delete this text?']) {
    assert.ok(renderer.includes(phrase), `Missing clear legacy control: ${phrase}`);
  }
  for (const phrase of ['selectSection', 'duplicateBlock', 'moveBlockBy', 'removeBlock', 'undo', 'redo']) {
    assert.ok(store.includes(phrase), `Missing builder action: ${phrase}`);
  }
  assert.ok(renderer.includes('class="br-add-point"'));
  assert.ok(renderer.includes("editor:insert-target"));
});

test('hidden sections and blocks stay out of the editor canvas', () => {
  const renderer = source('BlockRenderer.vue');
  assert.ok(renderer.includes('v-show="!section.props?.hidden"'));
  assert.ok(renderer.includes('v-show="!block.props?.hidden"'));
});

test('keyboard shortcuts protect typing and support undo, redo and moving selected items', () => {
  const workspace = source('EditorWorkspace.vue');
  assert.ok(workspace.includes('isTypingTarget'));
  assert.ok(workspace.includes("event.key.toLowerCase() === 'z'"));
  assert.ok(workspace.includes("event.key.toLowerCase() === 'y'"));
  assert.ok(workspace.includes('Alt + ↑/↓'));
  assert.ok(workspace.includes('moveBlockBy'));
  assert.ok(workspace.includes('moveSection'));
});

test('legacy toolbar imports remain safe while rendering only the new workspace', () => {
  const toolbar = source('BuilderToolbar.vue');
  assert.ok(toolbar.includes("import EditorWorkspace from './EditorWorkspace.vue'"));
  assert.ok(toolbar.includes('<EditorWorkspace />'));
  assert.equal(toolbar.includes('position: fixed; right:'), false);
});

test('inline record editing stays on canvas while More options opens the content form', () => {
  const workspace = source('EditorWorkspace.vue');
  const panel = source('EditorContentPanel.vue');
  assert.ok(workspace.includes('event.detail?.inline'));
  assert.ok(workspace.includes('builder.selectContentText'));
  assert.ok(panel.includes('detail.field'));
  assert.ok(panel.includes('editor:content-select'));
});

test('appearance dashboard continues to expose all supported editor areas', () => {
  const appearance = readFileSync(new URL('../views/admin/AppearanceView.vue', import.meta.url), 'utf8');
  for (const phrase of ['Home', 'Library', 'Header & Footer', 'Resource Page', 'Download Page']) {
    assert.ok(appearance.includes(phrase), `Missing editor area: ${phrase}`);
  }
});

test('responsive site styles keep container breakpoints for the logical canvas', () => {
  const homeCss = readFileSync(new URL('../assets/k5-home.css', import.meta.url), 'utf8');
  assert.ok(homeCss.includes('@container site-preview (max-width: 991px)'));
  assert.ok(homeCss.includes('@container site-preview (max-width: 575px)'));
});
