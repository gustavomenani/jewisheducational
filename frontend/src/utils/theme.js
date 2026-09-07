export const APPEARANCE_DEFAULTS = {
  theme_color_primary: '#3bafb8',
  theme_color_primary_dark: '#2a929a',
  theme_color_secondary: '#5d6dbe',
  theme_color_secondary_dark: '#4a57a8',
  theme_color_accent: '#89d14f',
  theme_color_sky: '#7ec8f5',
  theme_color_sky_light: '#e0f2ff',
  theme_color_text: '#2c3e50',
  theme_color_text_muted: '#5a6a7a',
  theme_color_background: '#ffffff',
  theme_color_header_bg: '#ffffff',
  theme_color_footer_bg: '#1a2836',
  theme_color_border: '#dce8f0',
  theme_font_family: "'Nunito', system-ui, sans-serif",
  theme_font_size_base: '16',
  theme_border_radius: '12',
  theme_button_radius: '999',

  hero_title: 'WHERE LEARNING FLOURISHES',
  hero_lead: 'Hebrew, Torah, holidays and more for early childhood Jewish education and schools.',
  hero_cta_text: 'Explore library',
  hero_cta_link: '/library',
  hero_content_align: 'left',
  // Optional showcase: it must only appear after an administrator explicitly
  // publishes a Canva URL. Keeping this empty prevents examples from becoming
  // visitor-facing content when the setting has never been saved.
  home_canva_url: '',
  home_hero_cta_primary_show: 'true',
  home_hero_cta_secondary_show: 'true',
  grade_levels: 'Basic\nIntermediate\nAdvanced',
  home_quick_topics: JSON.stringify([
    { id: 'aleph-bet', label: 'Aleph-Bet', targetType: 'search', target: '/library?q=hebrew', icon: 'bi bi-translate', visible: true, sortOrder: 0 },
    { id: 'parashah', label: 'Parashah', targetType: 'search', target: '/library?q=parashah', icon: 'bi bi-book', visible: true, sortOrder: 1 },
    { id: 'chanukah', label: 'Chanukah', targetType: 'search', target: '/library?q=chanukah', icon: 'bi bi-stars', visible: true, sortOrder: 2 },
    { id: 'coloring', label: 'Coloring', targetType: 'search', target: '/library?q=coloring', icon: 'bi bi-palette', visible: true, sortOrder: 3 },
    { id: 'torah', label: 'Torah', targetType: 'search', target: '/library?q=torah', icon: 'bi bi-journal-bookmark', visible: true, sortOrder: 4 },
    { id: 'view-all', label: 'View all', targetType: 'url', target: '/library', icon: 'bi bi-collection', visible: true, sortOrder: 5 },
  ]),
  hero_bg_image: '',
  hero_show_illustration: 'false',
  block_hero_show: 'true',
  hero_block_size: '100',

  block_library_show: 'true',
  library_block_size: '100',
  section_library_title: 'Explore our resources',
  section_library_lead: 'Worksheets, PDFs and presentations organized by category — ready to print or use in the classroom.',
  section_library_cta: 'View library',

  block_potential_show: 'false',
  potential_block_size: '100',
  section_potential_title: 'Unlock the true potential of every student',
  section_potential_lead: 'Access PDFs, presentations and worksheets organized by category, with search, filters and integrated online preview.',
  section_potential_image: '/images/potential/landscape-scene.png',

  block_recent_show: 'true',
  recent_block_size: '100',
  section_recent_title: 'Recent materials',

  block_community_show: 'true',
  community_block_size: '100',
  section_community_title: 'Join our community!',

  block_access_show: 'true',
  access_block_size: '100',
  section_access_title: 'Get access today!',
  section_access_cta_text: 'Sign up free',
  section_access_cta_link: '/sign-up',
  section_access_bg_image: '/images/cta/banner-bg.png',
  section_access_mascot_image: '/images/cta/banner-mascot.png?v=11',

  block_contact_show: 'false',
  contact_block_size: '100',
  section_contact_title: 'Get in touch',
  section_contact_lead: 'Questions, suggestions or school partnerships — send us a message.',
  section_contact_image: '',
  section_contact_image_alt: 'Contact us',
  section_contact_background: '',
  section_contact_bg_color: '#f3f8fb',
  contact_name_label: 'Name',
  contact_email_label: 'Email',
  contact_message_label: 'Message',
  contact_notify_email: 'jewisheducationalresources1@gmail.com',
  contact_redirect_url: '',
  contact_redirect_delay: '0',

  footer_tagline: '',
  footer_copyright: '',
  footer_show: 'false',

  library_page_head_icon_show: 'false',
  library_category_subtitle_show: 'false',
  library_subtopics_show: 'false',
  library_results_heading_show: 'false',
  library_material_types_show: 'true',
  library_root_catalog_show: 'false',

  landing_activity_cards: JSON.stringify([
    { img: '/images/potential/activity-chanukah.png', title: 'Activity: Chanukah', pos: 'pos-1' },
    { img: '/images/potential/activity-parasha.png', title: 'Weekly Parashah', pos: 'pos-2' },
    { img: '/images/potential/activity-rosh-hashanah.png', title: 'Rosh Hashanah', pos: 'pos-3' },
    { img: '/images/potential/activity-purim.png', title: 'Activity: Purim', pos: 'pos-4' },
  ]),

  theme_custom_css: '',

  landing_blocks_order: JSON.stringify(['hero', 'library', 'recent', 'community']),
};

export const LANDING_BLOCK_DEFS = {
  hero: {
    id: 'hero',
    title: 'Hero / Top',
    icon: 'bi-image',
    showKey: 'block_hero_show',
    previewTone: 'sky',
    fields: [
      { key: 'hero_block_size', label: 'Block size', type: 'range', min: 75, max: 150, step: 5, hint: 'Hero height, spacing, and scale.' },
      { key: 'hero_title', label: 'Title', type: 'text' },
      { key: 'hero_lead', label: 'Supporting text', type: 'textarea', hint: 'Leave blank to use the site description.' },
      { key: 'hero_cta_text', label: 'Button text', type: 'text' },
      { key: 'hero_cta_link', label: 'Button link', type: 'text' },
      { key: 'hero_bg_image', label: 'Background image', type: 'image' },
      { key: 'hero_show_illustration', label: 'Show animated illustration', type: 'checkbox' },
    ],
  },
  library: {
    id: 'library',
    title: 'Learning library',
    icon: 'bi-journal-bookmark',
    showKey: 'block_library_show',
    previewTone: 'white',
    fields: [
      { key: 'library_block_size', label: 'Block size', type: 'range', min: 75, max: 150, step: 5, hint: 'Height of the three cards and section spacing.' },
      { key: 'section_library_title', label: 'Title', type: 'text' },
      { key: 'section_library_lead', label: 'Text', type: 'textarea' },
      { key: 'section_library_cta', label: 'Button text', type: 'text' },
    ],
  },
  potential: {
    id: 'potential',
    title: 'Unlock potential',
    icon: 'bi-lightning',
    showKey: 'block_potential_show',
    previewTone: 'peach',
    fields: [
      { key: 'potential_block_size', label: 'Block size', type: 'range', min: 75, max: 150, step: 5 },
      { key: 'section_potential_title', label: 'Title', type: 'text' },
      { key: 'section_potential_lead', label: 'Text', type: 'textarea' },
      { key: 'section_potential_image', label: 'Center image', type: 'image' },
    ],
  },
  recent: {
    id: 'recent',
    title: 'Recent materials',
    icon: 'bi-clock-history',
    showKey: 'block_recent_show',
    previewTone: 'light',
    fields: [
      { key: 'recent_block_size', label: 'Block size', type: 'range', min: 75, max: 150, step: 5 },
      { key: 'section_recent_title', label: 'Title', type: 'text' },
    ],
  },
  community: {
    id: 'community',
    title: 'Community / testimonials',
    icon: 'bi-people',
    showKey: 'block_community_show',
    previewTone: 'green',
    fields: [
      { key: 'community_block_size', label: 'Block size', type: 'range', min: 75, max: 150, step: 5 },
      { key: 'section_community_title', label: 'Title', type: 'text' },
    ],
  },
  access: {
    id: 'access',
    title: '"Get access today" banner',
    icon: 'bi-megaphone',
    showKey: 'block_access_show',
    previewTone: 'purple',
    fields: [
      { key: 'access_block_size', label: 'Block size', type: 'range', min: 75, max: 150, step: 5 },
      { key: 'section_access_title', label: 'Title', type: 'text' },
      { key: 'section_access_cta_text', label: 'Button text', type: 'text' },
      { key: 'section_access_cta_link', label: 'Button link', type: 'text' },
      { key: 'section_access_bg_image', label: 'Banner background', type: 'image' },
      { key: 'section_access_mascot_image', label: 'Mascot', type: 'image' },
    ],
  },
  contact: {
    id: 'contact',
    title: 'Contact form',
    icon: 'bi-envelope',
    showKey: 'block_contact_show',
    previewTone: 'sky',
    fields: [
      { key: 'contact_block_size', label: 'Block size', type: 'range', min: 75, max: 150, step: 5 },
      { key: 'section_contact_title', label: 'Title', type: 'text' },
      { key: 'section_contact_lead', label: 'Supporting text', type: 'textarea' },
      { key: 'section_contact_image', label: 'Contact image', type: 'image' },
      { key: 'section_contact_background', label: 'Background image', type: 'image' },
      { key: 'section_contact_bg_color', label: 'Background color', type: 'color' },
      { key: 'contact_name_label', label: 'Name field label', type: 'text' },
      { key: 'contact_email_label', label: 'Email field label', type: 'text' },
      { key: 'contact_message_label', label: 'Message field label', type: 'text' },
      { key: 'contact_notify_email', label: 'Notification email', type: 'text', hint: 'Change the email recipient in Admin → Settings → Contact form.' },
    ],
  },
};

export const DEFAULT_LANDING_BLOCK_ORDER = ['hero', 'library', 'potential', 'recent', 'community', 'access'];

/** Blocos que só entram na página quando você clicar em "Adicionar bloco". */
export const OPTIONAL_LANDING_BLOCKS = ['contact'];

export function blockSizeKey(blockId) {
  return `${blockId}_block_size`;
}

export function blockSizePercent(settings, blockId, fallback = 100) {
  const raw = settingText(settings, blockSizeKey(blockId), String(fallback));
  const n = Number(raw);
  if (Number.isNaN(n)) return fallback;
  return Math.min(150, Math.max(75, n));
}

export function blockSizeStyle(settings, blockId) {
  const scale = blockSizePercent(settings, blockId) / 100;
  return { '--k5-block-size': String(scale) };
}

export const BLOCK_SIZE_RANGE = { min: 75, max: 150, step: 5, default: 100 };

export const COLOR_KEYS = [
  { key: 'theme_color_primary', label: 'Primary color (teal)' },
  { key: 'theme_color_primary_dark', label: 'Dark primary color' },
  { key: 'theme_color_secondary', label: 'Secondary color (buttons)' },
  { key: 'theme_color_secondary_dark', label: 'Dark secondary color' },
  { key: 'theme_color_accent', label: 'Accent color' },
  { key: 'theme_color_sky', label: 'Sky / hero color' },
  { key: 'theme_color_sky_light', label: 'Light hero background' },
  { key: 'theme_color_text', label: 'Primary text' },
  { key: 'theme_color_text_muted', label: 'Secondary text' },
  { key: 'theme_color_background', label: 'Page background' },
  { key: 'theme_color_header_bg', label: 'Header background' },
  { key: 'theme_color_footer_bg', label: 'Footer background' },
  { key: 'theme_color_border', label: 'Borders' },
];

export const FONT_OPTIONS = [
  { value: "'Nunito', system-ui, sans-serif", label: 'Nunito (default)' },
  { value: "'Inter', system-ui, sans-serif", label: 'Inter' },
  { value: "'Poppins', system-ui, sans-serif", label: 'Poppins' },
  { value: "'Open Sans', system-ui, sans-serif", label: 'Open Sans' },
  { value: "'Merriweather', Georgia, serif", label: 'Merriweather' },
  { value: "Georgia, 'Times New Roman', serif", label: 'Georgia' },
];

export function settingBool(settings, key, fallback = true) {
  const value = settings?.[key];
  if (value === undefined || value === null || value === '') return fallback;
  return value === 'true' || value === true;
}

export function settingText(settings, key, fallback = '') {
  const value = settings?.[key];
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

export function parseActivityCards(settings) {
  try {
    const raw = settings?.landing_activity_cards;
    if (!raw) return JSON.parse(APPEARANCE_DEFAULTS.landing_activity_cards);
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : JSON.parse(APPEARANCE_DEFAULTS.landing_activity_cards);
  } catch {
    return JSON.parse(APPEARANCE_DEFAULTS.landing_activity_cards);
  }
}

export function parseLandingBlockOrder(settings) {
  try {
    const raw = settings?.landing_blocks_order;
    const fallback = JSON.parse(APPEARANCE_DEFAULTS.landing_blocks_order);
    if (!raw) return fallback;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return fallback;
    const known = new Set([...DEFAULT_LANDING_BLOCK_ORDER, ...OPTIONAL_LANDING_BLOCKS]);
    const ordered = parsed.filter((id) => known.has(id));
    DEFAULT_LANDING_BLOCK_ORDER.forEach((id) => {
      if (!ordered.includes(id)) ordered.push(id);
    });
    return ordered;
  } catch {
    return [...DEFAULT_LANDING_BLOCK_ORDER];
  }
}

export function isLandingBlockEnabled(settings, blockId) {
  const def = LANDING_BLOCK_DEFS[blockId];
  if (!def) return false;
  return settingBool(settings, def.showKey, true);
}

export function getOrderedVisibleBlocks(settings) {
  return parseLandingBlockOrder(settings).filter((id) => isLandingBlockEnabled(settings, id));
}

export function blockPreviewTitle(settings, blockId) {
  const def = LANDING_BLOCK_DEFS[blockId];
  if (!def) return blockId;
  const titleField = def.fields?.find((f) => f.type === 'text');
  if (titleField) {
    const value = settingText(settings, titleField.key);
    if (value) return value;
  }
  return def.title;
}

let customStyleEl = null;

export function applyTheme(settings = {}) {
  const root = document.documentElement;
  const merged = { ...APPEARANCE_DEFAULTS, ...settings };

  const cssVars = {
    '--edu-teal': merged.theme_color_primary,
    '--edu-teal-dark': merged.theme_color_primary_dark,
    '--edu-teal-light': merged.theme_color_sky_light,
    '--edu-purple': merged.theme_color_secondary,
    '--edu-purple-dark': merged.theme_color_secondary_dark,
    '--edu-green': merged.theme_color_accent,
    '--edu-sky': merged.theme_color_sky,
    '--edu-sky-light': merged.theme_color_sky_light,
    '--edu-text': merged.theme_color_text,
    '--edu-text-muted': merged.theme_color_text_muted,
    '--edu-border': merged.theme_color_border,
    '--edu-white': merged.theme_color_background,
    '--edu-header-bg': merged.theme_color_header_bg,
    '--edu-footer-bg': merged.theme_color_footer_bg,
    '--jer-font': merged.theme_font_family,
    '--jer-font-size': `${merged.theme_font_size_base || 16}px`,
    '--jer-radius': `${merged.theme_border_radius || 12}px`,
    '--jer-button-radius': `${merged.theme_button_radius || 999}px`,
  };

  Object.entries(cssVars).forEach(([key, value]) => {
    if (value) root.style.setProperty(key, value);
  });

  if (!customStyleEl) {
    customStyleEl = document.createElement('style');
    customStyleEl.id = 'jer-theme-custom-css';
    document.head.appendChild(customStyleEl);
  }
  customStyleEl.textContent = merged.theme_custom_css || '';

  const font = merged.theme_font_family || APPEARANCE_DEFAULTS.theme_font_family;
  if (font.includes('Nunito') && !document.getElementById('jer-theme-font-nunito')) {
    /* already in main.css */
  } else if (font.includes('Inter') && !document.getElementById('jer-theme-font-link')) {
    const link = document.createElement('link');
    link.id = 'jer-theme-font-link';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap';
    document.head.appendChild(link);
  } else if (font.includes('Poppins') && !document.getElementById('jer-theme-font-link')) {
    const link = document.createElement('link');
    link.id = 'jer-theme-font-link';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap';
    document.head.appendChild(link);
  }
}
