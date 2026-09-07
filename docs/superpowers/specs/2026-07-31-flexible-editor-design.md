# Flexible Visual Editor Design

## Objective

Give non-technical administrators more freedom to position page content while keeping published pages responsive and difficult to break.

## Chosen approach

Use a constrained 12-column grid instead of absolute positioning. Every block keeps its normal document order for accessibility, but may choose a desktop width, horizontal position, and vertical spacing. Blocks can also be reordered or moved between section columns by dragging. At mobile widths, all blocks automatically stack at full width.

This is safer than pixel-based free positioning, which commonly creates overlaps, inaccessible reading order, and layouts that fail on phones.

## Editor experience

- Selecting a block opens a **Position & size** panel.
- Width presets: full, three quarters, two thirds, half, and one third.
- Alignment controls: left, center, and right.
- Fine movement controls nudge the block one grid unit left or right.
- Top and bottom spacing controls accept bounded pixel values.
- Drag handles reorder blocks and move them between existing columns.
- Destructive removal actions require confirmation.
- Desktop placement is visualized only while editing; mobile preview stacks content safely.

## Data model

Each block gains a separate `layout` object:

```json
{
  "span": 12,
  "start": 1,
  "marginTop": 0,
  "marginBottom": 0
}
```

Old published layouts remain compatible because normalization supplies these defaults. Values are clamped before rendering and persistence.

## Reliability improvements

- Add complete undo/redo support for structural edits.
- Capture inline-edit history before text changes rather than after them.
- Preserve blocks when reducing the number of columns in a section.
- Ignore no-op mutations so they do not dirty drafts or consume history.
- Repair malformed layouts during parsing, including empty columns and duplicate IDs.
- Implement the missing drag-leave handler and validate drag payloads.
- Keep drafts intact after publish failures.

## Verification

- Unit tests cover normalization, positioning bounds, malformed legacy data, and unique IDs.
- Contract tests cover position controls and structural undo/redo.
- Run the complete frontend test suite and production build.
- Verify the live editor and responsive previews through the local server.

## Scope

This change applies to the Home custom-content canvas. Existing inline editing for the other dynamic pages remains protected from structural changes.
