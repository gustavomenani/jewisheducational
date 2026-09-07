import { computed, ref } from 'vue';
import { PREVIEW_MODES } from './preview';

export const EDITOR_PANEL_TABS = Object.freeze([
  { id: 'insert', label: 'Insert', icon: 'bi-plus-square' },
  { id: 'content', label: 'Content', icon: 'bi-pencil-square' },
  { id: 'pages', label: 'Pages', icon: 'bi-files' },
  { id: 'themes', label: 'Themes', icon: 'bi-palette' },
]);

export const EDITOR_PAGES = Object.freeze([
  { id: 'home', label: 'Home', icon: 'bi-house', path: '/' },
  { id: 'library', label: 'Library', icon: 'bi-collection', path: '/library' },
  { id: 'resource', label: 'Resource Page', icon: 'bi-file-earmark-text', path: '/library' },
  { id: 'download', label: 'Download Page', icon: 'bi-download', path: '/library' },
  { id: 'auth', label: 'Login & account pages', icon: 'bi-person-lock', path: '/login' },
  { id: 'global', label: 'Header & Footer', icon: 'bi-window', path: '/' },
]);

export const EDITOR_SELECTION_KINDS = Object.freeze(['setting', 'block', 'section', 'document-block', 'document-section']);

export function useEditorUi() {
  const activePanel = ref('insert');
  const previewMode = ref('desktop');
  const insertionTarget = ref(null);
  const inspectorOpen = ref(false);
  // On narrow screens the tools panel used to cover the whole preview as
  // soon as the editor opened, so the first click could never select content.
  // Start with the preview unobstructed and reopen the panel on selection.
  const sidebarOpen = ref(typeof window === 'undefined' ? true : window.innerWidth > 760);

  const previewDefinition = computed(() =>
    PREVIEW_MODES.find((mode) => mode.id === previewMode.value) || PREVIEW_MODES[0]
  );

  function openPanel(panel) {
    if (EDITOR_PANEL_TABS.some((tab) => tab.id === panel)) {
      activePanel.value = panel;
      inspectorOpen.value = false;
    }
  }

  function openInspector() {
    inspectorOpen.value = true;
    sidebarOpen.value = true;
  }

  function closeInspector() {
    inspectorOpen.value = false;
    insertionTarget.value = null;
  }

  function setPreviewMode(mode) {
    if (PREVIEW_MODES.some((item) => item.id === mode)) previewMode.value = mode;
  }

  function setInsertionTarget(target) {
    insertionTarget.value = target ? { ...target } : null;
  }

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value;
  }

  return {
    activePanel,
    previewMode,
    previewDefinition,
    insertionTarget,
    inspectorOpen,
    sidebarOpen,
    openPanel,
    openInspector,
    closeInspector,
    setPreviewMode,
    setInsertionTarget,
    toggleSidebar,
  };
}
