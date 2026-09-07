# Growing Download Catalog Design

Date: 2026-07-31

## Goal

Turn the Library into a clear, growing visual catalog where visitors can see downloadable materials side by side and administrators never have to build download squares manually in the visual editor.

## Interpretation of the Client Request

The client's “quadradinhos para baixar” are material cards. She expects to keep adding materials over time and wants visitors to see the available downloads next to each other. Therefore, cards must be generated from material records managed in `Admin → Materials`, not created as unrelated visual-editor blocks.

## Chosen Approach

Use an automatic responsive catalog with progressive loading:

- Every published material becomes one card automatically.
- The Library root shows materials even when subject folders are also available.
- Cards form a stable grid: four columns on large desktops, three on smaller desktops, two on tablets and phones, and one only on exceptionally narrow screens.
- The first 24 materials load together.
- A `Load more materials` action appends the next 24 without replacing cards already visible.
- The interface shows `Showing X of Y materials` so visitors understand the collection size.
- Search, category, grade, type, access, and sorting changes reset the grid to the first batch.

This is preferable to manual editor cards because it prevents duplicated content, broken links, and ongoing layout work. It is preferable to a carousel because a carousel hides available items.

## Material Card

Each card contains:

- Cover image or a consistent file placeholder.
- Free or Premium badge when payments are enabled.
- Material title, limited to two lines.
- Material type and grade when present.
- A clear `Download` action for downloadable files.
- A clear `View slides` action for presentation-only materials.
- A `View details` action when no primary file is available.

The entire cover and title open the material detail page. Action labels accompany icons so visitors do not need to guess what a symbol means.

Cards in the same row maintain consistent proportions even when titles and metadata differ. Images use lazy loading and preserve the current square thumbnail format.

## Library Root and Categories

Subject folders remain visible for browsing, but they no longer suppress the material catalog on the Library root. The root displays:

1. Page heading and optional search/filter controls.
2. Subject folders.
3. `All materials` catalog.

Inside a category, the catalog displays that category and its descendant materials. Existing filters continue to narrow the current catalog.

## Loading and URL Behavior

- Initial and filter requests use `limit=24` and `page=1`.
- `Load more materials` requests the next page and appends unique records by material ID.
- Loading more does not add a page number to browser history.
- Shareable filter, sort, and category state remains in the URL.
- A failed load-more request keeps existing cards visible and shows an inline retry message.
- The button is disabled while loading and disappears after all results are visible.

## Administration Workflow

The client continues using the existing Material form:

1. Open `Admin → Materials`.
2. Create or edit a material, including its cover and file.
3. Publish it.
4. The material appears automatically in the Library grid according to the active sorting and filters.

No new editor block or duplicated catalog-maintenance screen is introduced.

## Accessibility and Responsive Behavior

- Card actions have visible text and accessible names.
- Loading state is announced and does not remove existing content.
- Keyboard focus remains on the Load more button after new cards are appended.
- The grid never causes horizontal scrolling.
- Cards remain readable at 200% zoom.
- Badges do not rely on color alone.

## Error Handling

- Initial-load failure displays a catalog error with a Retry action.
- Load-more failure retains the existing cards and exposes Retry.
- Duplicate results returned across pages are removed by ID.
- Materials without covers or primary files still render a useful card.
- Empty filtered results retain the existing Clear filters action.

## Verification

- Source tests for root visibility, default batch size, responsive grid breakpoints, visible card actions, and Load more behavior.
- Logic tests for appending unique materials and resetting results after filter changes.
- Frontend production build.
- Existing backend tests; the current resources endpoint already supports paginated limits up to 100 and requires no API contract change.
- Browser verification is omitted because the user explicitly requested that no browser window be opened.

## Acceptance Criteria

1. Visitors see material cards on the Library root even when subject folders exist.
2. Published materials appear automatically without manual visual-editor cards.
3. Cards display side by side with four, three, two, or one responsive columns.
4. The first 24 cards load initially and additional cards append through `Load more materials`.
5. Visitors can distinguish Download, View slides, and View details actions without relying on icons.
6. Search and filters reset the catalog and continue to work with progressive loading.
7. Existing cards remain visible if loading another batch fails.
8. The frontend build and automated tests pass.

## Out of Scope

- Manually creating one visual-editor block per material.
- A horizontal carousel.
- Loading the entire unbounded catalog in one request.
- Changing the Material data model or resources API contract.
- Modifying payment or download authorization rules.
