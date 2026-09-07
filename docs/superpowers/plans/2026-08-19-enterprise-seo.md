# Enterprise SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-safe SEO layer for the Vue/Firebase site that gives every public page a stable canonical URL, useful social metadata, valid structured data, and crawlable XML discovery while keeping private, filtered, download, and editor routes out of search indexes.

**Architecture:** Keep SEO behavior in one frontend utility that owns title, description, canonical, robots, Open Graph, Twitter, and JSON-LD tags. Route-level defaults run after every SPA navigation, while Home, Library, Category, and Resource views refine metadata after their database content loads. Firebase Hosting serves a static robots file and rewrites `/sitemap.xml` to a public backend endpoint that enumerates only published resources and public categories.

**Tech Stack:** Vue 3, Vue Router 4, Express, Firebase Hosting/Cloud Functions, Firestore/MySQL/memory database adapters, Node test runner, Vite.

**Status:** Implementation, automated regression gate, build, SSR checks, and browser smoke checks completed locally. Production publication remains pending the previously identified Firebase Secret Manager IAM permission and an explicit publish step.

## Global Constraints

- Canonical production origin is configurable with `VITE_SITE_URL` and defaults to `https://jewisheducationalresources.org` in production.
- Do not expose admin, account, authentication, download, presentation, editor, or filtered search URLs to indexing.
- Do not invent FAQ, review, rating, author, or educational claims that are not present in persisted data.
- Do not include protected file URLs in JSON-LD or sitemaps.
- Preserve the existing English-only public URL structure and Firebase-only production target.
- No new runtime dependency is required.

---

### Task 1: Create the SEO contract and pure builders

**Files:**
- Modify: `frontend/src/utils/seo.js`
- Create: `frontend/src/utils/seo.test.js`
- Modify: `frontend/index.html`
- Modify: `frontend/.env.production`
- Modify: `frontend/.env.development`

**Interfaces:**
- Produces `setSeo(options)`, `applyRouteSeo(route)`, `canonicalUrl(path)`, `buildBreadcrumbSchema(items)`, `buildWebSiteSchema()`, `buildCollectionPageSchema(input)`, and `buildLearningResourceSchema(input)`.
- `setSeo` accepts `{ title, description, canonical, image, type, robots, keywords, jsonLd, article }` and replaces only the tags owned by this site.

- [x] **Step 1: Add tests for canonical normalization, noindex policy, and schema output.**
- [x] **Step 2: Implement the pure URL/description/schema builders and DOM tag manager.**
- [x] **Step 3: Add complete default title, description, robots, canonical, Open Graph, Twitter, and theme metadata to `frontend/index.html`.**
- [x] **Step 4: Add `VITE_SITE_URL=https://jewisheducationalresources.org` to development and production environment templates.**
- [x] **Step 5: Run `node --test frontend/src/utils/seo.test.js` and verify all assertions pass.**

### Task 2: Apply metadata to every SPA route

**Files:**
- Modify: `frontend/src/router/index.js`
- Modify: `frontend/src/stores/index.js`
- Modify: `frontend/src/views/HomeView.vue`
- Modify: `frontend/src/views/LibraryView.vue`
- Modify: `frontend/src/views/ResourceView.vue`
- Modify: `frontend/src/views/PresentationView.vue`
- Modify: `frontend/src/views/DownloadView.vue`

**Interfaces:**
- Route navigation calls `applyRouteSeo(to)` before analytics page-view persistence.
- Public view data calls `setSeo` after settings/resources/categories load.

- [x] **Step 1: Add route policy defaults for public, private, filtered, and unknown pages.**
- [x] **Step 2: Remove the settings-store title overwrite that can replace resource metadata after asynchronous settings hydration.**
- [x] **Step 3: Add Home `WebSite` and `Organization` metadata using the configured site name/description.**
- [x] **Step 4: Add Library and Category `CollectionPage`, `ItemList`, and breadcrumb metadata; use `noindex,follow` for search/filter query states.**
- [x] **Step 5: Replace the resource-only metadata call with `LearningResource`, image, article dates, category, and breadcrumb metadata.**
- [x] **Step 6: Mark login, account, admin, download, presentation, reset, and other protected states `noindex,nofollow` and remove their canonicals.**
- [x] **Step 7: Run the focused SEO and existing frontend tests.**

### Task 3: Add crawl discovery and dynamic sitemap generation

**Files:**
- Create: `backend/routes/seo.js`
- Modify: `backend/app.js`
- Modify: `firebase.json`
- Create: `frontend/public/robots.txt`
- Create: `backend/routes/seo.test.js`

**Interfaces:**
- `GET /sitemap.xml` returns `application/xml` with the canonical home, library, public category, and published resource URLs.
- The endpoint works through all database adapters by using `categoryListAll` and public `resourceListFiltered` only.

- [x] **Step 1: Add tests for XML escaping, public category filtering, resource inclusion, and protected URL exclusion.**
- [x] **Step 2: Implement the public sitemap route with fixed canonical origin, safe XML escaping, cache headers, and a minimal fallback when a data read fails.**
- [x] **Step 3: Mount the route in Express before the API/private route set.**
- [x] **Step 4: Rewrite Firebase Hosting `/sitemap.xml` to the API Function.**
- [x] **Step 5: Add robots rules for private route prefixes and a canonical sitemap declaration.**
- [x] **Step 6: Run the backend SEO tests and a local HTTP check for content type/status.**

### Task 4: Harden SEO regression coverage and documentation

**Files:**
- Modify: `frontend/src/router/index.js`
- Modify: `frontend/src/analytics.js`
- Create: `docs/SEO.md`

- [x] **Step 1: Assert page-view tracking uses the final SEO title after route metadata is applied.**
- [x] **Step 2: Document the canonical origin, public indexable routes, noindex routes, sitemap endpoint, Search Console submission, and image/title requirements for editors.**
- [x] **Step 3: Run the full release verification command with the public Firebase key injected.**
- [x] **Step 4: Build the frontend and inspect generated `robots.txt`, route metadata code, and sitemap rewrite.**

### Task 5: Production-safe validation

**Files:**
- No production data mutation.

- [x] **Step 1: Smoke-test local public and private route behavior, sitemap, and robots output.**
- [x] **Step 2: Confirm private routes emit `noindex` and public routes emit canonical/JSON-LD without duplicate managed tags.**
- [x] **Step 3: Confirm the production deployment gate remains green before publication.**
- [ ] **Step 4: Publish only after Firebase IAM is fixed and verify production sitemap, robots, canonical, and structured-data responses.**
