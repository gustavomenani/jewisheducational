import { normalizeLayout } from '../builder/layout.js';

export const CANVA_NATIVE_MODE = 'native';
export const CANVA_NATIVE_COLORS = { navy: '#003366', cream: '#f4f0e6', border: '#d9d5ca' };
const HERO_ID = 'canva-native-home-hero';
const INTRO_ID = 'canva-native-home-resources';

function text(id, type, value, size, extra = {}) {
  return { id, type, props: { text: value, level: type === 'heading' ? 2 : undefined,
    textStyle: { fontSize: size, fontWeight: type === 'heading' ? '800' : '400', color: CANVA_NATIVE_COLORS.navy, textAlign: 'center', lineHeight: type === 'heading' ? 1.06 : 1.5 }, ...extra } };
}
function image(id, src, alt) { return { id, type: 'image', props: { src, alt, size: 'full', align: 'center', radius: 20 } }; }
function button(id, label) { return { id, type: 'button', props: { text: label, link: '/library', align: 'center', variant: 'primary', icon: 'bi-arrow-right' } }; }

export function createCanvaHomeLayout(existing = { sections: [] }) {
  const preserved = (existing?.sections || []).filter(section => ![HERO_ID, INTRO_ID].includes(section.id));
  return normalizeLayout({ sections: [
    { id: HERO_ID, props: { bg: CANVA_NATIVE_COLORS.cream, paddingY: 56, maxWidth: 1240 }, columns: [
      { id: 'canva-native-hero-copy', span: 7, blocks: [
        text('canva-native-brand', 'heading', 'Digital Jewish Resources Hub', 24),
        text('canva-native-title', 'heading', 'Welcome to\nReady-to-Use\nJewish Digital\nMaterials', 68, { level: 1 }),
        text('canva-native-lead', 'paragraph', 'Our platform offers a wide variety of ready-to-use digital materials that enhance learning and engagement within the Jewish community.', 18),
        button('canva-native-explore', 'EXPLORE OUR RESOURCES'),
      ] },
      { id: 'canva-native-hero-photo', span: 5, blocks: [image('canva-native-hero-image', '/images/canva/jewish-materials.png', 'Golden menorah, Star of David and scrolls')] },
    ] },
    { id: INTRO_ID, props: { bg: CANVA_NATIVE_COLORS.cream, paddingY: 64, maxWidth: 1240 }, columns: [
      { id: 'canva-native-resources-photo', span: 5, blocks: [image('canva-native-resources-image', '/images/canva/digital-resources.png', 'Jewish educational resources')] },
      { id: 'canva-native-resources-copy', span: 7, blocks: [
        text('canva-native-resources-title', 'heading', 'Explore our digital PDF resources for learning', 48),
        text('canva-native-resources-lead', 'paragraph', 'Our collection offers a wide range of downloadable PDFs designed for educational and religious purposes. These resources are perfect for teachers, families, and community leaders looking to enhance their understanding of Jewish traditions.', 18),
        text('canva-native-resources-tagline', 'paragraph', 'Enhance your learning experience today', 20, { textStyle: { fontSize: 20, fontWeight: '700', color: CANVA_NATIVE_COLORS.navy, textAlign: 'center' } }),
        button('canva-native-resources-cta', 'DOWNLOADABLE JEWISH EDUCATIONAL PDFS'),
      ] },
    ] }, ...preserved,
  ] });
}

function parse(raw, fallback) { try { return typeof raw === 'string' ? JSON.parse(raw) : raw || fallback; } catch { return fallback; } }

// Keep independent Canva presentations and every other page's content. Only
// hide the library showcase that duplicates the design now used by the site.
export function hideReplacedLibraryCanva(raw, referenceUrl) {
  const document = structuredClone(parse(raw, null));
  if (!document?.pages?.library?.slots?.['before-library']) return raw;
  const slot = document.pages.library.slots['before-library'];
  for (const section of slot.sections || []) {
    let replaced = false;
    for (const column of section.columns || []) {
      for (const block of column.blocks || []) {
        if (block.type === 'canva' && block.props?.url === referenceUrl) {
          block.props.hidden = true;
          replaced = true;
        }
      }
    }
    if (replaced && section.columns.every(column => column.blocks.every(block => block.props?.hidden))) {
      section.props = { ...section.props, hidden: true };
    }
  }
  return JSON.stringify(document);
}

export function createCanvaNativeSettings(previous, css) {
  const reference = previous.canva_design_reference_url || previous.home_canva_url || '';
  const layout = createCanvaHomeLayout(parse(previous.page_home_layout_published, { sections: [] }));
  const existingCss = (previous.theme_custom_css || '').replace(/\/\* Canva native site design:start \*\/[\s\S]*?\/\* Canva native site design:end \*\//g, '').trim();
  const patch = {
    canva_integration_mode: CANVA_NATIVE_MODE,
    canva_design_reference_url: reference,
    home_canva_url: '',
    page_home_layout_published: JSON.stringify(layout),
    hero_title: 'Welcome to Ready-to-Use Jewish Digital Materials',
    hero_lead: 'Our platform offers a wide variety of ready-to-use digital materials that enhance learning and engagement within the Jewish community.',
    home_hero_show: 'false', home_cards_show: 'false', home_topics_show: 'false', home_featured_show: 'false',
    home_recent_show: 'true', home_benefits_show: 'false', home_prefooter_show: 'false',
    section_recent_title: 'Latest resources', library_root_catalog_show: 'true',
    theme_color_primary: CANVA_NATIVE_COLORS.navy, theme_color_primary_dark: '#00264d',
    theme_color_secondary: '#156782', theme_color_secondary_dark: '#0d4f65',
    theme_color_accent: '#c3a36b', theme_color_text: CANVA_NATIVE_COLORS.navy, theme_color_text_muted: '#51657a',
    theme_color_background: CANVA_NATIVE_COLORS.cream, theme_color_header_bg: CANVA_NATIVE_COLORS.cream,
    theme_color_footer_bg: CANVA_NATIVE_COLORS.cream, theme_color_border: CANVA_NATIVE_COLORS.border,
    theme_font_family: "Arial, sans-serif", theme_border_radius: '20', theme_button_radius: '8',
    theme_custom_css: `${existingCss}\n/* Canva native site design:start */\n${css}\n/* Canva native site design:end */`,
  };
  if (previous.site_document_v2_published) patch.site_document_v2_published = hideReplacedLibraryCanva(previous.site_document_v2_published, reference);
  return patch;
}
