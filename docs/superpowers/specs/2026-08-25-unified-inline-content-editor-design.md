# Unified inline content editor

## Goal

Every administrator-owned piece of visible editorial copy is edited by clicking it in the page preview. The editor must keep one clear rule across the site: click text to change the words; use the visible content controls to hide, move, duplicate, or remove content; publish only when the preview is correct.

This extends the existing direct setting editor and SiteDocument v2 editor to database-backed categories and materials. It does not turn search, authentication, payments, preview, download, or form input behavior into editable blocks.

## Content ownership rules

| Visible value | Owner | Editing behavior |
| --- | --- | --- |
| Template copy such as headings, button labels, help text, footer copy, and filter labels | Site settings | Existing `EditableSetting` direct editing |
| Category name and description | Category content record | New `EditableContentText` direct editing |
| Material title, description, detailed content description, type, grade, and age text | Material content record | New `EditableContentText` direct editing |
| SiteDocument visual blocks | SiteDocument v2 | Existing direct block editor |
| Counts, loading states, dates, errors, search terms, user input values, access state, and payment/download status | Runtime or protected workflow | Read-only; never persisted as editorial copy |

Changing a category or material field updates every occurrence in the active editor draft. For example, changing a category name updates the category page heading, breadcrumb, sidebar, header navigation, footer, home cards, and subtopic links. Slugs and navigation targets are not changed by copy edits.

## Editor component contract

Create `EditableContentText` as the single direct editor for content records. Its public input is an explicit content binding:

```js
{ entity: 'category' | 'material', id, field }
```

It accepts a text tag, supports plain-text paste, prevents link navigation in edit mode, and keeps normal navigation for visitors. It renders `contenteditable` only for an administrator in edit mode. It will allow only the approved fields in the ownership table and ignore an invalid entity, id, or field.

Typing updates the existing content draft through `builder.updateContentItem`. The store gains an inline-content edit transaction so one typing session creates one Undo entry rather than one entry per character. The existing local draft, Discard, revision conflict, and atomic Publish pipeline remain the only persistence path.

## Page coverage

- **Header and footer:** category navigation and category links use direct category-name editing; template labels continue with `EditableSetting`.
- **Home:** category labels, featured/recent material titles and descriptions, and generated content links use direct content bindings. Fixed campaign copy remains a setting or SiteDocument block.
- **Library and category pages:** breadcrumb names, sidebar category names, page title/subtitle, subtopic links, catalog material titles, category labels, and visible descriptive copy use direct bindings. Search/filter controls retain their behavior and only their labels are editable.
- **Resource pages:** material title, subtitle/description, body description, category labels, and non-action metadata use direct bindings. Preview, file actions, pricing, and access controls remain protected.
- **Download pages:** material name and descriptive copy use direct bindings; the download action and delivery state remain protected.
- **Login and account pages:** editorial template copy stays directly editable through settings or SiteDocument slots; credentials, account data, and payment controls remain protected.

All editor-visible text components use a consistent outline, keyboard focus treatment, clean paste, and an accessible selection target. The compact direct toolbar appears for editable template settings; content records receive the same select-and-edit affordance plus an explicit “More options” route to the Content panel for metadata, cover images, and archive controls.

## Safety and compatibility

- Content text is persisted as plain text only; no arbitrary HTML, scripts, or external styles are introduced.
- Existing category/material validation and admin-only editor content API remain authoritative.
- Links are inert while editing and behave normally for visitors.
- Empty strings are intentional edits and are never replaced by an old default.
- Protected widgets do not expose editor controls to visitors.
- Legacy Home layouts remain supported by the existing compatibility controls until a later, separately approved migration of advanced blocks.

## Testing and rollout

Add browser tests that edit a category title and description directly on its category page, then assert the draft appears in its breadcrumb/sidebar and can be discarded or published. Add equivalent material title/description coverage across library, resource, and download views. Verify a visitor does not see editor controls and that protected search, authentication, preview, payment, and download flows retain their existing integration tests.

Run the release gate and complete browser suite, deploy to the Firebase preview channel, smoke-test public routes and API health, then release the same build to production.

## Explicit non-goals

This change does not rename URL slugs, alter category hierarchy, make computed system messages editable, or allow arbitrary page positioning. Those remain structured actions in the existing Content panel or protected application behavior.
