# Growing Download Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display every published material as an automatically generated responsive card and progressively append more cards as the catalog grows.

**Architecture:** Keep the existing `/api/resources` pagination contract and move incremental merge behavior into a small pure helper. Update LibraryView to request fixed batches of 24, show cards on the root, append unique results through Load more, and retain existing content after an incremental request fails. Update the shared catalog CSS with explicit responsive columns and visible card actions.

**Tech Stack:** Vue 3 Composition API, Vue Router, Axios, CSS Grid, Node.js built-in test runner, Vite.

## Global Constraints

- Material cards are generated from published material records managed in `Admin → Materials`.
- The existing resources API, payment rules, and download authorization remain unchanged.
- Initial and incremental catalog requests use a batch size of 24.
- The grid uses four, three, two, or one columns without horizontal scrolling.
- Browser verification must not open a window because the user explicitly declined browser interaction.

---

### Task 1: Progressive catalog data flow

**Files:**
- Create: `frontend/src/utils/catalogPagination.js`
- Create: `frontend/src/utils/catalogPagination.test.js`
- Modify: `frontend/src/views/LibraryView.vue`
- Create: `frontend/src/views/LibraryCatalog.test.js`

**Interfaces:**
- Produces: `CATALOG_BATCH_SIZE = 24`.
- Produces: `mergeUniqueResources(current, incoming)` returning records in first-seen order, deduplicated by stringified ID.
- Produces: `hasMoreResources(resources, total)`.

- [ ] **Step 1: Write failing helper and view contract tests**

```js
test('catalog batches contain 24 materials', () => {
  assert.equal(CATALOG_BATCH_SIZE, 24);
});

test('incremental results append without duplicate ids', () => {
  assert.deepEqual(
    mergeUniqueResources([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }]),
    [{ id: 1 }, { id: 2 }, { id: 3 }]
  );
});
```

The view contract checks for `Load more materials`, `Showing`, `mergeUniqueResources`, `loadingMore`, `catalogError`, and the absence of numbered pagination.

- [ ] **Step 2: Run tests and confirm failure**

Run: `node --test frontend/src/utils/catalogPagination.test.js frontend/src/views/LibraryCatalog.test.js`

Expected: FAIL because the helper and new view behavior do not exist.

- [ ] **Step 3: Implement pure catalog helpers**

```js
export const CATALOG_BATCH_SIZE = 24;

export function mergeUniqueResources(current = [], incoming = []) {
  const seen = new Set();
  return [...current, ...incoming].filter((item) => {
    const key = String(item?.id ?? '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function hasMoreResources(resources = [], total = 0) {
  return resources.length < Math.max(0, Number(total) || 0);
}
```

- [ ] **Step 4: Replace numbered paging with progressive loading**

Import the helpers. Set pagination limit to `CATALOG_BATCH_SIZE`. Split resource loading into initial/reset and append paths. `loadMore()` requests `pagination.page + 1`, appends through `mergeUniqueResources`, and changes the current page only after success. Filter and route changes reset to page 1. Remove the per-page selector, page-query management, and numeric pagination.

- [ ] **Step 5: Add count, retry, and Load more UI**

Show `Showing {{ resources.length }} of {{ pagination.total }} materials`. Keep existing cards visible while `loadingMore` is true. Display an inline error and Retry button. Disable Load more while the request is active and hide it when `hasMoreResources` is false.

- [ ] **Step 6: Show catalog on the Library root**

Remove the `!isRootOverview` condition from the material section and label the unfiltered root catalog `All materials:`. Keep subject folders above it.

- [ ] **Step 7: Run focused tests**

Run: `node --test frontend/src/utils/catalogPagination.test.js frontend/src/views/LibraryCatalog.test.js`

Expected: PASS.

### Task 2: Responsive cards with visible actions

**Files:**
- Modify: `frontend/src/views/LibraryView.vue`
- Modify: `frontend/src/assets/main.css`
- Modify: `frontend/src/views/LibraryCatalog.test.js`

**Interfaces:**
- Produces: visible `Download`, `View slides`, and `View details` actions.
- Produces: explicit 4/3/2/1 CSS Grid breakpoints.

- [ ] **Step 1: Expand the failing view contract**

Assert the three visible action labels, Free/Premium badges, and CSS tokens for four, three, two, and one columns.

- [ ] **Step 2: Run the test and confirm failure**

Run: `node --test frontend/src/views/LibraryCatalog.test.js`

Expected: FAIL because current actions are icon-only and the grid uses auto-fill.

- [ ] **Step 3: Upgrade card markup**

Keep cover/title detail links. Render a labeled action at the bottom of every card: presentation route with `View slides`, download route with `Download`, or resource route with `View details`. When payments are enabled, render a `Free` or `Premium` badge with the existing access badge classes.

- [ ] **Step 4: Upgrade grid and card CSS**

Use `grid-template-columns: repeat(4, minmax(0, 1fr))`, switch to three columns below 1200px, two below 900px, and one below 360px. Give cards a border, background, equal-height layout, internal padding, focus/hover state, and full-width action button. Preserve square cover images and lazy loading.

- [ ] **Step 5: Run all automated verification**

Run:

```powershell
$frontTests = @(rg --files frontend/src -g '*.test.js'); node --test $frontTests
$backendTests = @(rg --files backend -g '*.test.js'); node --test $backendTests
npm run build --prefix frontend
```

Expected: all tests and the Vite production build exit with code 0.

- [ ] **Step 6: Record repository limitation**

The workspace has an invalid/empty `.git` directory, so do not initialize replacement history or attempt a commit.
