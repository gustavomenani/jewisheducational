import { parseResourcePageLayout } from '../utils/resourcePage.js';

// The visual editor deliberately works from a small, explicit allow-list.
// Templates cannot turn an arbitrary API field (a slug, a payment flag, or a
// file name) into an editable record merely by passing a string as `field`.
const BINDINGS = {
  topic: {
    label: { required: true, storageKey: 'quickTopics' },
  },
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

function layoutField(field) {
  return field.startsWith('page_layout.hero.') ? field.slice('page_layout.hero.'.length) : '';
}

export function contentTextBinding(entity, field) {
  const definition = BINDINGS[entity]?.[field];
  return definition ? { entity, field, ...definition } : null;
}

export function isContentTextBinding(entity, field) {
  return Boolean(contentTextBinding(entity, field));
}

export function contentTextValue(item, entity, field) {
  if (!contentTextBinding(entity, field) || !item) return '';
  const heroField = layoutField(field);
  if (!heroField) return String(item[field] ?? '');
  const layout = parseResourcePageLayout(item.page_layout);
  return String(layout.hero?.[heroField] ?? '');
}

export function contentTextPatch(item, entity, field, value) {
  if (!contentTextBinding(entity, field)) return null;
  const text = String(value ?? '');
  const heroField = layoutField(field);
  if (!heroField) return { [field]: text };
  const layout = parseResourcePageLayout(item?.page_layout);
  layout.hero[heroField] = text;
  return { page_layout: JSON.stringify(layout) };
}
