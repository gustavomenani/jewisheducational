export const RESOURCE_PAGE_DEFAULTS = {
  blocks_order: ['hero', 'about', 'gallery', 'grid', 'viewer', 'sidebar', 'cta'],
  hero: {
    enabled: true,
    layout: 'split-right',
    bg_image: '',
    bg_color: '',
    title: '',
    subtitle: '',
    show_cover: true,
    show_save_btn: true,
    show_stats: false,
    show_meta: true,
    show_breadcrumb: true,
    primary_btn_text: '',
    show_download_btn: true,
  },
  about: {
    enabled: true,
    title: 'What is in this file',
  },
  gallery: {
    enabled: false,
    images: [],
  },
  grid: {
    enabled: true,
    title: 'Choose a letter or worksheet',
    subtitle: 'Click the letter you want:',
  },
  viewer: {
    enabled: true,
    title: 'Preview',
  },
  sidebar: {
    enabled: true,
    title: 'Available files',
    selected_title: 'Selected worksheet',
  },
  cta: {
    enabled: false,
    title: '',
    text: '',
    button_text: 'Sign up free',
    button_link: '/sign-up',
    bg_image: '',
    image: '',
    bg_color: '',
  },
  extras: [],
  theme: {
    page_bg_color: '',
    page_bg_image: '',
    page_bg_size: 'cover',
    page_bg_position: 'center center',
    page_bg_repeat: 'no-repeat',
    page_bg_fixed: false,
    page_bg_overlay: '',
    text_color: '',
    accent_color: '',
    custom_css: '',
  },
};

export const RESOURCE_PAGE_BLOCK_DEFS = {
  hero: {
    id: 'hero',
    title: 'Resource heading',
    icon: 'bi-card-heading',
    previewTone: 'sky',
  },
  about: {
    id: 'about',
    title: 'Content description',
    icon: 'bi-text-paragraph',
    previewTone: 'white',
  },
  gallery: {
    id: 'gallery',
    title: 'Image gallery',
    icon: 'bi-images',
    previewTone: 'peach',
  },
  grid: {
    id: 'grid',
    title: 'Letter/sheet grid',
    icon: 'bi-grid-3x3-gap',
    previewTone: 'light',
    requiresGrid: true,
  },
  viewer: {
    id: 'viewer',
    title: 'PDF viewer',
    icon: 'bi-eye',
    previewTone: 'green',
  },
  sidebar: {
    id: 'sidebar',
    title: 'File list',
    icon: 'bi-folder2-open',
    previewTone: 'purple',
  },
  cta: {
    id: 'cta',
    title: 'Call-to-action banner',
    icon: 'bi-megaphone',
    previewTone: 'purple',
  },
};

export const PAGE_BG_SIZE_OPTIONS = [
  { value: 'cover', label: 'Cover the area' },
  { value: 'contain', label: 'Fit within the area' },
  { value: 'auto', label: 'Original size' },
];

export const PAGE_BG_REPEAT_OPTIONS = [
  { value: 'no-repeat', label: 'Do not repeat' },
  { value: 'repeat', label: 'Repeat' },
  { value: 'repeat-x', label: 'Repeat horizontally' },
  { value: 'repeat-y', label: 'Repeat vertically' },
];

export const HERO_LAYOUT_OPTIONS = [
  { value: 'split-right', label: 'Cover on the right (default)' },
  { value: 'split-left', label: 'Cover on the left' },
  { value: 'centered', label: 'Centered with a large cover' },
  { value: 'minimal', label: 'Minimal (without a large cover)' },
];

function deepMerge(target, source) {
  const out = { ...target };
  if (!source || typeof source !== 'object') return out;
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = deepMerge(target[key] || {}, source[key]);
    } else if (source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}

export function parseResourcePageLayout(raw) {
  try {
    if (!raw) return structuredClone(RESOURCE_PAGE_DEFAULTS);
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const merged = deepMerge(RESOURCE_PAGE_DEFAULTS, parsed);
    if (!Array.isArray(merged.blocks_order)) {
      merged.blocks_order = [...RESOURCE_PAGE_DEFAULTS.blocks_order];
    }
    const known = new Set(Object.keys(RESOURCE_PAGE_BLOCK_DEFS));
    merged.blocks_order = merged.blocks_order.filter((id) => known.has(id));
    RESOURCE_PAGE_DEFAULTS.blocks_order.forEach((id) => {
      if (!merged.blocks_order.includes(id)) merged.blocks_order.push(id);
    });
    if (!Array.isArray(merged.gallery?.images)) merged.gallery.images = [];
    if (!Array.isArray(merged.extras)) merged.extras = [];
    return merged;
  } catch {
    return structuredClone(RESOURCE_PAGE_DEFAULTS);
  }
}

export function isPageBlockEnabled(layout, blockId, resource = null) {
  const block = layout?.[blockId];
  if (!block || block.enabled === false) return false;
  const def = RESOURCE_PAGE_BLOCK_DEFS[blockId];
  if (def?.requiresGrid && resource?.display_mode !== 'grid') return false;
  return true;
}

export function getOrderedPageBlocks(layout, resource = null) {
  if (!layout) return [...RESOURCE_PAGE_DEFAULTS.blocks_order];
  return layout.blocks_order.filter((id) => isPageBlockEnabled(layout, id, resource));
}

export function getResourcePageClasses(layout) {
  const theme = layout?.theme || {};
  return {
    'has-page-bg-image': !!theme.page_bg_image,
    'has-page-bg-overlay': !!theme.page_bg_overlay,
    'page-bg-fixed': !!theme.page_bg_fixed,
  };
}

export function getResourcePageStyle(layout, urlFn = (u) => u) {
  const theme = layout?.theme || {};
  const style = {};
  if (theme.page_bg_color) style.backgroundColor = theme.page_bg_color;
  if (theme.page_bg_image) {
    style.backgroundImage = `url(${urlFn(theme.page_bg_image)})`;
    style.backgroundSize = theme.page_bg_size || 'cover';
    style.backgroundPosition = theme.page_bg_position || 'center center';
    style.backgroundRepeat = theme.page_bg_repeat || 'no-repeat';
    if (theme.page_bg_fixed) style.backgroundAttachment = 'fixed';
  }
  if (theme.page_bg_overlay) style['--page-bg-overlay'] = theme.page_bg_overlay;
  if (theme.text_color) style.color = theme.text_color;
  if (theme.accent_color) style['--resource-accent'] = theme.accent_color;
  return style;
}

export function applyResourcePageTheme(layout) {
  const theme = layout?.theme || {};
  const css = theme.custom_css || '';
  let styleEl = document.getElementById('jer-resource-page-css');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'jer-resource-page-css';
    document.head.appendChild(styleEl);
  }
  const vars = [];
  if (theme.accent_color) vars.push(`--resource-accent: ${theme.accent_color}`);
  if (theme.text_color) vars.push(`color: ${theme.text_color}`);
  if (theme.page_bg_overlay) vars.push(`--page-bg-overlay: ${theme.page_bg_overlay}`);
  const baseRule = vars.length
    ? `.resource-detail-page { ${vars.join('; ')}; }\n`
    : '';
  styleEl.textContent = `${baseRule}${css}`;
}

export function blockPreviewLabel(layout, blockId) {
  const def = RESOURCE_PAGE_BLOCK_DEFS[blockId];
  if (!def) return blockId;
  const block = layout?.[blockId];
  if (blockId === 'hero' && block?.title) return block.title;
  if (block?.title) return block.title;
  return def.title;
}
