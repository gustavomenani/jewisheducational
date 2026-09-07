// Layout model helpers for the visual page builder.
// A page layout is a tree: sections -> columns -> blocks.
// Stored as JSON in the settings key/value store, one draft + one published per page.

import { normalizeTextStyle } from './textStyle.js';

export const DRAFT_SUFFIX = '_layout_draft';
export const PUBLISHED_SUFFIX = '_layout_published';
export const GRID_COLUMNS = 12;
export const MAX_BLOCK_SPACING = 160;

export function draftKey(slug) {
  return `page_${slug}${DRAFT_SUFFIX}`;
}

export function publishedKey(slug) {
  return `page_${slug}${PUBLISHED_SUFFIX}`;
}

// Browser-safe unique id (Date.now/Math.random are fine in the app runtime).
export function uid(prefix = 'b') {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

export function emptyLayout() {
  return { sections: [] };
}

export function makeColumn(span = 12, blocks = []) {
  return { id: uid('col'), span, blocks };
}

export function makeSection(columns, props = {}) {
  return {
    id: uid('sec'),
    props: { bg: '', paddingY: 48, maxWidth: 1140, ...(props || {}) },
    columns: columns && columns.length ? columns : [makeColumn(12, [])],
  };
}

// Parse a layout coming from settings (string JSON or object); never throw.
export function parseLayout(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return normalizeLayout(raw);
  try {
    return normalizeLayout(JSON.parse(raw));
  } catch {
    return null;
  }
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

export function normalizeBlockPlacement(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const span = clampInteger(source.span, 1, GRID_COLUMNS, GRID_COLUMNS);
  const start = clampInteger(source.start, 1, GRID_COLUMNS - span + 1, 1);
  return {
    span,
    start,
    marginTop: clampInteger(source.marginTop, 0, MAX_BLOCK_SPACING, 0),
    marginBottom: clampInteger(source.marginBottom, 0, MAX_BLOCK_SPACING, 0),
  };
}

export function alignBlockPlacement(raw, alignment) {
  const placement = normalizeBlockPlacement(raw);
  if (alignment === 'right') placement.start = GRID_COLUMNS - placement.span + 1;
  else if (alignment === 'center') {
    placement.start = Math.floor((GRID_COLUMNS - placement.span) / 2) + 1;
  } else placement.start = 1;
  return placement;
}

function uniqueId(candidate, prefix, seen) {
  let id = typeof candidate === 'string' && candidate.trim() ? candidate : uid(prefix);
  while (seen.has(id)) id = uid(prefix);
  seen.add(id);
  return id;
}

export function normalizeLayout(layout) {
  if (!layout || !Array.isArray(layout.sections)) return emptyLayout();
  const seenIds = new Set();
  return {
    sections: layout.sections.map((rawSection) => {
      const section = rawSection && typeof rawSection === 'object' ? rawSection : {};
      const rawColumns = Array.isArray(section.columns) && section.columns.length
        ? section.columns
        : [{}];
      return {
        id: uniqueId(section.id, 'sec', seenIds),
        props: { bg: '', paddingY: 48, maxWidth: 1140, ...(section.props || {}) },
        columns: rawColumns.map((rawColumn) => {
          const column = rawColumn && typeof rawColumn === 'object' ? rawColumn : {};
          return {
            id: uniqueId(column.id, 'col', seenIds),
            span: clampSpan(column.span),
            blocks: (Array.isArray(column.blocks) ? column.blocks : []).map((rawBlock) => {
              const block = rawBlock && typeof rawBlock === 'object' ? rawBlock : {};
              const props = block.props && typeof block.props === 'object' ? { ...block.props } : {};
              if (block.type === 'heading' || block.type === 'paragraph') {
                props.textStyle = normalizeTextStyle(props.textStyle, props);
              }
              return {
                id: uniqueId(block.id, 'b', seenIds),
                type: typeof block.type === 'string' ? block.type : '',
                props,
                layout: normalizeBlockPlacement(block.layout),
              };
            }),
          };
        }),
      };
    }),
  };
}

export function clampSpan(span) {
  return clampInteger(span, 1, GRID_COLUMNS, GRID_COLUMNS);
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// Walk helpers — find a block / its column anywhere in the tree.
export function findBlock(layout, blockId) {
  for (const section of layout?.sections || []) {
    for (const column of section.columns) {
      const idx = column.blocks.findIndex((b) => b.id === blockId);
      if (idx !== -1) return { section, column, block: column.blocks[idx], index: idx };
    }
  }
  return null;
}
