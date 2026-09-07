# English-Only Site Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every user-visible page, message, setting, e-mail, persisted site record, and public URL English while preserving every PDF file and its content.

**Architecture:** The Vue application becomes English-only and exposes canonical English routes, with compatibility redirects from Portuguese routes. Backend and seed copy is translated at its source, and a new idempotent migration applies the repository’s known English mappings to existing settings, categories, resources, and plans without modifying PDF files or unknown user-authored records.

**Tech Stack:** Vue 3, Vue Router 4, Vite 6, Express 4, Node.js 20, MariaDB/MySQL or Firestore, Node built-in test runner.

## Global Constraints

- English is the sole interface language; do not retain a language selector or Portuguese fallback.
- Translate all user-visible strings, including browser dialogs, accessibility labels, server responses, e-mails, settings-backed copy, metadata, admin copy, seeded categories/resources/plans, and public URL segments.
- Keep legacy Portuguese URLs working through client-side redirects that preserve params and query strings.
- Do not change PDF bytes, regenerate PDFs, translate `pdfContent`, rename uploaded PDF files, or alter resource-file records.
- Existing content migration must be idempotent, keyed by stable setting keys or slugs, and must not alter unknown manually-created records.
- Do not change API status codes, authorization behavior, payments, or visual design.
- This workspace has no Git repository; record the intended commit message in each task but do not run `git commit`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `frontend/src/i18n/messages.js` | Sole English message catalog. |
| `frontend/src/i18n/index.js` | Fixed English locale API for existing `useI18n()` callers. |
| `frontend/src/router/index.js` | Canonical English routes and explicit legacy redirects. |
| `frontend/src/router/legacyRoutes.js` | Pure path/query-preserving legacy URL mapping. |
| `frontend/src/router/legacyRoutes.test.js` | Unit tests for every route migration. |
| `frontend/src/**` | English UI literals, labels, tooltips, alerts, browser prompts, settings defaults, metadata, and admin copy. |
| `backend/utils/userCopy.js` | Single source for backend user-facing English errors and e-mail copy. |
| `backend/utils/subscriptionReminders.js` | English-only reminder e-mails and English canonical account link. |
| `backend/routes/*.js`, `backend/utils/*.js`, `backend/middleware/*.js`, `backend/db/index.js` | English API and operational user-visible text. |
| `backend/scripts/site-content-en.js` | Stable-slug/key translation mapping for existing known site data only. |
| `backend/scripts/migrate-site-content-to-english.js` | Idempotent content migration runner and change report. |
| `backend/scripts/migrate-site-content-to-english.test.js` | Unit tests against a fake DB adapter. |
| `backend/scripts/activities-data.js`, `backend/scripts/aleph-bet-data.js`, `backend/database/{schema,migrate}.js` | English defaults and seeded site-facing resource/category/settings copy; PDF generation payload stays unchanged. |
| `README.md`, `frontend/index.html` | English developer-facing instructions and document metadata. |

## Task 1: Add and verify English-only route compatibility

**Files:**
- Create: `frontend/src/router/legacyRoutes.js`
- Create: `frontend/src/router/legacyRoutes.test.js`
- Modify: `frontend/src/router/index.js`
- Modify: all Vue/JS consumers of `/biblioteca`, `/material`, `/cadastro`, `/recuperar-senha`, `/minha-conta`, `/perfil`, `/minha-lista`, `/admin/*` found with `rg -n "(/biblioteca|/material|/cadastro|/recuperar-senha|/minha-conta|/minha-lista|/usuarios|/aparencia|/pagamentos|/planos|/integracoes|/configuracoes|/novo|/categorys)" frontend/src`

**Interfaces:**
- Produces: `legacyPathRedirect(pathname: string): string | null`, returning an English path but never a query string.
- Consumes: `route.path`, `route.query`, and `route.hash` from Vue Router redirect records.

- [ ] **Step 1: Write the failing legacy-route test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyPathRedirect } from './legacyRoutes.js';

test('maps Portuguese public paths to canonical English paths', () => {
  assert.equal(legacyPathRedirect('/biblioteca'), '/library');
  assert.equal(legacyPathRedirect('/biblioteca/category/torah'), '/library/category/torah');
  assert.equal(legacyPathRedirect('/material/atividade-purim'), '/resource/atividade-purim');
  assert.equal(legacyPathRedirect('/material/atividade-purim/baixar/7'), '/resource/atividade-purim/download/7');
  assert.equal(legacyPathRedirect('/material/atividade-purim/apresentar/7'), '/resource/atividade-purim/present/7');
  assert.equal(legacyPathRedirect('/cadastro'), '/sign-up');
  assert.equal(legacyPathRedirect('/recuperar-senha/abc'), '/reset-password/abc');
  assert.equal(legacyPathRedirect('/minha-conta'), '/my-account');
  assert.equal(legacyPathRedirect('/admin/configuracoes'), '/admin/settings');
  assert.equal(legacyPathRedirect('/not-a-legacy-route'), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test frontend/src/router/legacyRoutes.test.js`

Expected: FAIL because `legacyRoutes.js` does not exist.

- [ ] **Step 3: Implement the mapping and canonical routes**

```js
// frontend/src/router/legacyRoutes.js
const staticPaths = new Map([
  ['/biblioteca', '/library'], ['/cadastro', '/sign-up'],
  ['/recuperar-senha', '/forgot-password'], ['/minha-conta', '/my-account'],
  ['/perfil', '/profile'], ['/minha-lista', '/my-list'],
  ['/admin/usuarios', '/admin/users'], ['/admin/aparencia', '/admin/appearance'],
  ['/admin/pagamentos', '/admin/payments'], ['/admin/planos', '/admin/plans'],
  ['/admin/integracoes', '/admin/integrations'], ['/admin/configuracoes', '/admin/settings'],
]);

export function legacyPathRedirect(pathname) {
  if (staticPaths.has(pathname)) return staticPaths.get(pathname);
  const dynamic = [
    [/^\/biblioteca\/category\/(.+)$/, '/library/category/$1'],
    [/^\/material\/([^/]+)$/, '/resource/$1'],
    [/^\/material\/([^/]+)\/baixar\/([^/]+)$/, '/resource/$1/download/$2'],
    [/^\/material\/([^/]+)\/apresentar\/([^/]+)$/, '/resource/$1/present/$2'],
    [/^\/recuperar-senha\/([^/]+)$/, '/reset-password/$1'],
    [/^\/admin\/materials\/novo$/, '/admin/materials/new'],
    [/^\/admin\/categorys\/novo$/, '/admin/categories/new'],
    [/^\/admin\/categorys\/([^/]+)$/, '/admin/categories/$1'],
  ];
  for (const [pattern, target] of dynamic) if (pattern.test(pathname)) return pathname.replace(pattern, target);
  return null;
}
```

In `frontend/src/router/index.js`, replace canonical Portuguese route paths with English ones, retain existing route names, add legacy redirect records before the canonical records, and use a `redirect: (to) => ({ path: legacyPathRedirect(to.path), query: to.query, hash: to.hash })` callback. Update every internal string path found by the command above to its English canonical route.

- [ ] **Step 4: Run route tests and build**

Run: `node --test frontend/src/router/legacyRoutes.test.js; npm run build --prefix frontend`

Expected: the route test passes and Vite reports `✓ built`.

- [ ] **Step 5: Record completion**

Intended commit message: `feat: migrate public and admin URLs to English`

## Task 2: Make the frontend English-only and translate all rendered copy

**Files:**
- Modify: `frontend/src/i18n/messages.js`
- Modify: `frontend/src/i18n/index.js`
- Modify: every `.vue` and `.js` file under `frontend/src` identified by the audit command below
- Modify: `frontend/index.html`
- Modify: `README.md`

**Interfaces:**
- Preserves: `useI18n(): { locale, t, isEn, setLocale }` so callers do not need a behavior rewrite.
- Produces: `locale.value === 'en'`, `document.documentElement.lang === 'en'`, and English text for every `t(key)` call.

- [ ] **Step 1: Write the failing English-only locale test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { messages, detectLocale } from './messages.js';

test('uses English only and has no Portuguese catalog', () => {
  assert.deepEqual(Object.keys(messages), ['en']);
  assert.equal(detectLocale(), 'en');
  assert.equal(messages.en.login, 'Log in');
});
```

Save it as `frontend/src/i18n/messages.test.js`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test frontend/src/i18n/messages.test.js`

Expected: FAIL because the `pt` catalog and locale detection remain.

- [ ] **Step 3: Implement English-only i18n**

```js
// frontend/src/i18n/index.js
import { ref, computed } from 'vue';
import { messages } from './messages.js';

const locale = ref('en');

export function useI18n() {
  const t = (key) => messages.en[key] || key;
  const isEn = computed(() => true);
  const setLocale = () => {};
  return { locale, t, isEn, setLocale };
}

export function initLocale() {
  document.documentElement.lang = 'en';
}
```

Replace `messages.js` with only the `en` object and make `detectLocale()` return `'en'` if retained for compatibility. Translate every literal detected by:

```powershell
rg -n --glob '!node_modules/**' --glob '!frontend/dist/**' "[À-ÿ]|\b(Entrar|Cadastrar|Salvar|Excluir|Atualizar|Material|materiais|Categoria|categorias|Biblioteca|Buscar|Baixar|Assinar|Conta|Senha|Usuário|Erro|Carregando|Próximo|Anterior|Grátis|Plano|Pagamento|Pasta|Favorito|Configurações|Aparência|Início|Descrição|Título|Enviar|Cancelar|Voltar|Criar|Editar|Visualizar|Nenhum|Todos|Atividade|Atividades|Você|Não)\b" frontend/src
```

Translate text nodes, props, `title`, `placeholder`, `aria-label`, alerts, confirms, prompts, error fallbacks, chart labels, CSV headings, builder preset labels, block defaults, and `document.title` values. Do not translate source-code identifiers, CSS class names, asset paths, API endpoints, or PDF-preview content.

- [ ] **Step 4: Run the locale test, textual audit, and build**

Run: `node --test frontend/src/i18n/messages.test.js; rg -n --glob '!node_modules/**' --glob '!frontend/dist/**' "[À-ÿ]" frontend/src; npm run build --prefix frontend`

Expected: test passes; remaining accented matches are only approved Hebrew/transliterated Jewish terms or comments; Vite build succeeds.

- [ ] **Step 5: Record completion**

Intended commit message: `feat: translate all frontend copy to English`

## Task 3: Translate backend responses and e-mails without changing contracts

**Files:**
- Create: `backend/utils/userCopy.js`
- Modify: `backend/routes/auth.js`, `backend/routes/admin.js`, `backend/routes/categories.js`, `backend/routes/contact.js`, `backend/routes/downloads.js`, `backend/routes/favorites.js`, `backend/routes/migrate.js`, `backend/routes/payments.js`, `backend/routes/resources.js`, `backend/routes/settings.js`
- Modify: `backend/middleware/auth.js`, `backend/middleware/upload.js`, `backend/utils/access.js`, `backend/utils/downloadLimits.js`, `backend/utils/paywall.js`, `backend/utils/subscriptionReminders.js`, `backend/utils/verifyFirebaseToken.js`, `backend/db/index.js`
- Modify: `backend/routes/auth.test.js`, `backend/utils/subscriptionReminders.test.js` (create if absent)

**Interfaces:**
- Produces: `USER_COPY` with English messages and `buildPremiumExpiryReminder(user, subscription)` returning `{ subject, html, text }`.
- Preserves: existing HTTP status codes and response object field names (`error`, `message`, etc.).

- [ ] **Step 1: Write failing backend copy tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { USER_COPY } from './userCopy.js';
import { buildPremiumExpiryReminder } from './subscriptionReminders.js';

test('backend error strings are English', () => {
  assert.equal(USER_COPY.invalidEmail, 'Enter a valid email address.');
  assert.equal(USER_COPY.emailAlreadyRegistered, 'Email address is already registered.');
});

test('subscription reminder always links to the English account route', () => {
  const email = buildPremiumExpiryReminder({ name: 'Ada' }, { ends_at: '2026-08-01' });
  assert.match(email.subject, /Premium subscription expires soon/);
  assert.match(email.html, /\/my-account/);
  assert.doesNotMatch(email.html, /minha-conta|Seu Premium|Olá/);
});
```

- [ ] **Step 2: Run backend copy tests to verify they fail**

Run: `node --test backend/utils/userCopy.test.js backend/utils/subscriptionReminders.test.js`

Expected: FAIL because the module/export and English-only reminder do not exist.

- [ ] **Step 3: Centralize and apply English copy**

```js
// backend/utils/userCopy.js
export const USER_COPY = Object.freeze({
  invalidEmail: 'Enter a valid email address.',
  emailAlreadyRegistered: 'Email address is already registered.',
  invalidCredentials: 'Invalid email address or password.',
  passwordResetSent: 'If that email address exists, we will send password reset instructions.',
  googleEmailUnavailable: 'Could not retrieve the email address for this Google account.',
  uploadFailed: 'Could not upload the file. Please try again.',
});
```

Replace hard-coded Portuguese user text in every listed backend file with precise English copy or `USER_COPY` constants. Remove `.br` language branching from subscription reminders, export `buildPremiumExpiryReminder`, and point both HTML and plain-text messages to `${SITE_URL}/my-account`. Keep internal logs English too where they appear in developer-visible output.

- [ ] **Step 4: Run backend tests and audit user-facing Portuguese strings**

Run: `node --test backend/utils/userCopy.test.js backend/utils/subscriptionReminders.test.js; rg -n --glob '!vendor/**' "[À-ÿ]" backend/routes backend/utils backend/middleware backend/db`

Expected: tests pass; no Portuguese text remains in response, e-mail, or user-visible error paths.

- [ ] **Step 5: Record completion**

Intended commit message: `feat: translate backend messages and emails to English`

## Task 4: Translate defaults and add a safe persisted-content migration

**Files:**
- Create: `backend/scripts/site-content-en.js`
- Create: `backend/scripts/migrate-site-content-to-english.js`
- Create: `backend/scripts/migrate-site-content-to-english.test.js`
- Modify: `backend/db/index.js`, `backend/db/mysqlDb.js`, `backend/db/firestoreDb.js`, `backend/db/memoryDb.js`
- Modify: `backend/database/schema.sql`, `backend/database/migrate.js`, `backend/scripts/activities-data.js`, `backend/scripts/aleph-bet-data.js`, `backend/scripts/seed-activities.js`, `backend/scripts/seed-aleph-bet.js`, `backend/package.json`, root `package.json`

**Interfaces:**
- Produces: `SITE_CONTENT_EN = { settings, categories, resources, plans }`, keyed by setting key or slug.
- Produces: `migrateSiteContentToEnglish(db): Promise<{ settings: number, categories: number, resources: number, plans: number, skipped: string[] }>`.
- Requires new DB methods: `planListAll(): Promise<Plan[]>`, `planUpdate(id: number, fields: Partial<Plan>): Promise<void>` and existing category/resource/settings find/update methods.

- [ ] **Step 1: Write a failing idempotency test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateSiteContentToEnglish } from './migrate-site-content-to-english.js';

test('updates only known seeded content and is idempotent', async () => {
  const updates = [];
  const db = {
    settingsGetAll: async () => ({ hero_title: 'Onde o aprendizado floresce', custom_copy: 'Portuguese custom text' }),
    settingsUpsert: async (key, value) => updates.push(['setting', key, value]),
    categoryFindBySlug: async (slug) => slug === 'atividades' ? { id: 1, slug } : null,
    categoryUpdate: async (id, fields) => updates.push(['category', id, fields]),
    resourceFindBySlug: async () => null,
    planListAll: async () => [],
    planUpdate: async () => assert.fail('unknown plans must not be changed'),
  };
  const first = await migrateSiteContentToEnglish(db);
  const second = await migrateSiteContentToEnglish(db);
  assert.equal(first.settings, 1);
  assert.equal(first.categories, 1);
  assert.equal(second.settings, 0);
  assert.equal(second.categories, 0);
  assert.equal(updates.some(([, key]) => key === 'custom_copy'), false);
});
```

- [ ] **Step 2: Run the migration test to verify it fails**

Run: `node --test backend/scripts/migrate-site-content-to-english.test.js`

Expected: FAIL because the migration module does not exist.

- [ ] **Step 3: Define mappings and implement the migration**

```js
// backend/scripts/migrate-site-content-to-english.js
import { SITE_CONTENT_EN } from './site-content-en.js';

export async function migrateSiteContentToEnglish(db) {
  const changed = { settings: 0, categories: 0, resources: 0, plans: 0, skipped: [] };
  const settings = await db.settingsGetAll();
  for (const [key, value] of Object.entries(SITE_CONTENT_EN.settings)) {
    if (settings[key] !== undefined && settings[key] !== value) { await db.settingsUpsert(key, value); changed.settings += 1; }
  }
  for (const [slug, fields] of Object.entries(SITE_CONTENT_EN.categories)) {
    const row = await db.categoryFindBySlug(slug);
    if (!row) { changed.skipped.push(`category:${slug}`); continue; }
    if (Object.entries(fields).some(([key, value]) => row[key] !== value)) { await db.categoryUpdate(row.id, fields); changed.categories += 1; }
  }
  // Repeat the same stable-slug compare-and-update pattern for resources and plans.
  return changed;
}
```

Populate `SITE_CONTENT_EN` with exact English translations for every known setting key and every repository-defined category, resource, and plan slug. Translate only resource `title`, `description`, `content_description`, age-range labels, and visible category/plan fields. Do not include `pdfContent`, `resource_files`, `file_name`, `original_name`, uploaded paths, or any unknown record in the mapping. Add `npm run db:migrate-content-en` to root and backend package scripts.

- [ ] **Step 4: Translate new-install defaults and seed site copy**

Update the default values in `schema.sql` and `migrate.js`; site-facing fields in both resource seed data files; and visible seed labels in the seed runners. Preserve every `pdfContent` object and do not call a PDF generation command. Ensure seeds use English resource/category/site copy while file IDs and existing uploaded PDF records are untouched.

- [ ] **Step 5: Run migration tests twice and check PDFs remain untouched**

Run: `node --test backend/scripts/migrate-site-content-to-english.test.js; npm run db:migrate-content-en --prefix backend; npm run db:migrate-content-en --prefix backend; rg -n "pdfContent|generate.*pdf|regenerate" backend/scripts/migrate-site-content-to-english.js backend/scripts/site-content-en.js`

Expected: unit test passes; the second migration reports zero changes; the two new migration files contain no PDF-generation code and no `pdfContent` key.

- [ ] **Step 6: Record completion**

Intended commit message: `feat: migrate known site content to English`

## Task 5: Complete the whole-site audit and production verification

**Files:**
- Modify: every remaining source file reported by the audit commands below, except PDF generation scripts/data that are explicitly out of scope.
- Modify: `docs/superpowers/specs/2026-07-24-english-only-site-design.md` only if implementation finds a necessary scope clarification.

**Interfaces:**
- Verifies: all public/admin UI, API/e-mail copy, defaults, known persisted data, and canonical routes satisfy the approved design.

- [ ] **Step 1: Create the final user-visible copy audit**

```powershell
rg -n --glob '!node_modules/**' --glob '!frontend/dist/**' --glob '!backend/vendor/**' --glob '!docs/superpowers/**' "[À-ÿ]" frontend backend README.md
rg -n --glob '!node_modules/**' --glob '!frontend/dist/**' "(/biblioteca|/material/[^']*baixar|/cadastro|/recuperar-senha|/minha-conta|/minha-lista|/admin/(usuarios|aparencia|pagamentos|planos|integracoes|configuracoes))" frontend/src
```

- [ ] **Step 2: Classify and resolve every result**

Translate every user-visible result. Retain only: Hebrew characters/transliteration, binary/vendor code, PDF-generation payload text, or data intentionally excluded from PDFs. Add a short inline comment next to any retained Portuguese text stating `PDF content intentionally unchanged`.

- [ ] **Step 3: Run all automated checks**

Run: `node --test frontend/src/router/legacyRoutes.test.js frontend/src/i18n/messages.test.js backend/utils/userCopy.test.js backend/utils/subscriptionReminders.test.js backend/scripts/migrate-site-content-to-english.test.js; npm run build --prefix frontend`

Expected: every test passes and Vite reports `✓ built`.

- [ ] **Step 4: Manually verify navigation and English content**

Check these URLs in the running frontend, preserving a query string where shown: `/biblioteca?grade=K-2`, `/material/atividade-purim`, `/cadastro`, `/recuperar-senha/token-example`, `/minha-conta`, `/admin/configuracoes`. Confirm each resolves to its English canonical route, keeps `?grade=K-2` where applicable, and renders English labels. Log in and verify account, download/paywall, password-reset, admin material/category/editor, plans, payments, settings, and subscription reminder outputs are English.

- [ ] **Step 5: Record completion**

Intended commit message: `chore: verify English-only site migration`
