# English-Only Site Migration Design

## Goal

Convert every user-visible part of Jewish Educational Resources from Portuguese to English. This includes public pages, the admin area, API and validation messages, transactional emails, settings-backed copy, seed data, SEO metadata, resource and category data shown on the site, and public URLs. PDF files and the text inside them are explicitly out of scope.

## Scope

- Make English the sole interface language and remove the Portuguese locale path and locale selector behavior.
- Translate all visible frontend copy: navigation, forms, dialogs, errors, loading states, accessibility labels, landing-page blocks, account and payment copy, and admin tooling.
- Translate backend user-facing responses, email subjects and bodies, and default values used for pages, plans, paywalls, and site settings.
- Translate seeded categories, resources, descriptions, labels, image alt text, and filenames only where they are shown as site copy. Do not alter PDF bytes or their rendered content.
- Translate existing persisted category, resource, plan, and settings values through an idempotent data migration.
- Replace Portuguese public routes with English routes and add client-side redirects from the previous Portuguese paths, retaining route parameters and query strings.
- Update documentation and developer-facing scripts where Portuguese wording is meaningful to operators. Do not translate technical identifiers that are not user-visible unless they are part of a public URL.

## Non-goals

- Translating, regenerating, renaming, or modifying PDF content.
- Adding a bilingual experience or language picker.
- Changing authentication, payments, permissions, resource availability, or visual design beyond copy and URL labels.
- Machine-translating arbitrary user-entered content that has no known source or safe deterministic mapping.

## Architecture

### Frontend

The Vue app will use English literals or a single English message catalog. The existing `pt` locale and locale-detection persistence will be retired. Components and views will be audited for hard-coded Portuguese strings, including browser prompts, `alert` calls, `aria-*` labels, form placeholders, and SEO utilities.

Router definitions will use English public segments, for example `/library`, `/sign-up`, `/forgot-password`, `/my-account`, and `/my-list`. A legacy redirect table will map the prior Portuguese routes to their English equivalents. Dynamic parameters and query strings will be preserved. Internal links and generated canonical URLs will point only to the English routes.

### Backend

All messages returned to users and all email templates will be translated. Default settings and seed constants will be changed to English so fresh installations start fully translated. Admin-facing copy rendered by the backend or populated through API defaults is included.

### Persisted content migration

An idempotent migration script will update known seeded/preset values in the active database: category names and descriptions, resource titles and descriptions, plan descriptions, and configurable settings copy. It will match known records by stable slugs or setting keys rather than by their current text. This protects repeat runs and avoids altering arbitrary new content that cannot be reliably translated from source.

For a database containing manually added Portuguese content beyond the repository's known records, the implementation will provide a reviewable mapping/report rather than silently guessing a translation. The seeded and repository-defined content is translated automatically.

### URLs and compatibility

The new English routes are canonical. Legacy Portuguese URLs remain usable by redirecting in the client router to the matching English route. The redirect behavior will be verified for static paths, resource routes, download routes, and query-string searches.

## Error handling

- Existing error status codes and API payload shapes remain unchanged; only user-visible message text changes.
- The content migration logs records it changed and skips unknown content safely.
- Missing or invalid legacy route parameters retain the current not-found or authentication behavior.

## Verification

- Search source files for Portuguese user-facing text, excluding historical PDFs and binary assets.
- Run the frontend production build.
- Exercise the legacy-to-English router redirects and confirm query strings survive.
- Verify representative public, account, payment, and admin flows render English copy.
- Run the data migration twice against a development dataset and confirm the second run makes no changes.
- Confirm PDF source files and generated PDF contents remain untouched.

## Acceptance criteria

1. All user-visible site text is English.
2. Existing Portuguese UI URLs redirect to their English equivalent without losing parameters or queries.
3. New installs use English defaults and seed content.
4. Existing known seeded/site content is migrated to English safely and idempotently.
5. PDFs are unchanged.
6. The frontend production build succeeds.
