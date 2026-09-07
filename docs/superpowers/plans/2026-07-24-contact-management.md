# Contact Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give administrators a reliable contact inbox, configurable notification recipient, and safe post-submit redirect while preserving every message in Firestore.

**Architecture:** Extend the existing contact route and all three database adapters behind their current common proxy. Keep redirect/config validation in a small pure utility, use the existing mailer for optional notifications, and add a protected Vue admin screen plus settings fields. The public form always saves first and treats notification delivery as a secondary operation.

**Tech Stack:** Vue 3, Vue Router, Express 4, Firebase Admin/Firestore, MySQL, Node test runner, Nodemailer.

## Global Constraints

- The default notification recipient is exactly `jewisheducationalresources1@gmail.com`.
- Messages must be stored before notification delivery is attempted.
- SMTP credentials remain runtime-only and must never be exposed through settings APIs.
- Redirects accept only a path beginning with `/` or a complete `https://` URL.
- Redirect delay is constrained to an integer from 0 through 10 seconds.
- Existing contact documents without status fields are treated as unread.
- All public and admin user-facing copy added by this plan is English.
- The workspace has an empty/invalid `.git` directory; implementation checkpoints are recorded with tests instead of commits until Git metadata is restored.

---

## File Structure

- `backend/utils/contactConfig.js`: pure validation, normalization, and HTML escaping.
- `backend/utils/contactConfig.test.js`: validation and escaping tests.
- `backend/utils/mailer.js`: expose SMTP availability and keep transport creation centralized.
- `backend/routes/contact.js`: public save-first contact workflow and notification attempt.
- `backend/routes/admin.js`: protected contact inbox endpoints.
- `backend/db/firestoreDb.js`: Firestore contact CRUD.
- `backend/db/mysqlDb.js`: MySQL contact CRUD.
- `backend/db/memoryDb.js`: development/test contact CRUD.
- `backend/db/index.js`: common contact CRUD exports.
- `backend/database/schema.sql`: current MySQL contact schema.
- `backend/database/migrate.js`: additive MySQL migration for contact state.
- `frontend/src/views/admin/ContactMessagesView.vue`: inbox UI.
- `frontend/src/views/admin/SettingsView.vue`: contact delivery/redirect settings.
- `frontend/src/layouts/AdminLayout.vue`: inbox navigation entry.
- `frontend/src/router/index.js`: protected inbox route.
- `frontend/src/views/HomeView.vue`: apply returned safe redirect.
- `frontend/src/utils/theme.js`: default notification recipient.
- `frontend/src/views/HomeView.copy.test.js`: guard public English copy.

---

### Task 1: Contact Configuration Validation

**Files:**
- Create: `backend/utils/contactConfig.js`
- Create: `backend/utils/contactConfig.test.js`

**Interfaces:**
- Produces: `DEFAULT_CONTACT_EMAIL`, `normalizeContactEmail(value)`, `normalizeContactRedirect(value)`, `normalizeRedirectDelay(value)`, and `escapeHtml(value)`.
- Consumes: no project modules.

- [ ] **Step 1: Write the failing utility tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONTACT_EMAIL,
  normalizeContactEmail,
  normalizeContactRedirect,
  normalizeRedirectDelay,
  escapeHtml,
} from './contactConfig.js';

test('contact defaults and safe redirects are normalized', () => {
  assert.equal(DEFAULT_CONTACT_EMAIL, 'jewisheducationalresources1@gmail.com');
  assert.equal(normalizeContactEmail(' CLIENT@EXAMPLE.COM '), 'client@example.com');
  assert.equal(normalizeContactEmail('invalid'), DEFAULT_CONTACT_EMAIL);
  assert.equal(normalizeContactRedirect('/thank-you'), '/thank-you');
  assert.equal(normalizeContactRedirect('https://example.com/thanks'), 'https://example.com/thanks');
  assert.equal(normalizeContactRedirect('//evil.example'), '');
  assert.equal(normalizeContactRedirect('javascript:alert(1)'), '');
});

test('redirect delay and HTML escaping are bounded', () => {
  assert.equal(normalizeRedirectDelay(-1), 0);
  assert.equal(normalizeRedirectDelay(4.9), 4);
  assert.equal(normalizeRedirectDelay(99), 10);
  assert.equal(escapeHtml('<b>A&B</b>'), '&lt;b&gt;A&amp;B&lt;/b&gt;');
});
```

- [ ] **Step 2: Run the test and confirm the missing-module failure**

Run: `node --test backend/utils/contactConfig.test.js`

Expected: FAIL because `backend/utils/contactConfig.js` does not exist.

- [ ] **Step 3: Implement the pure utility**

```js
export const DEFAULT_CONTACT_EMAIL = 'jewisheducationalresources1@gmail.com';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeContactEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : DEFAULT_CONTACT_EMAIL;
}

export function normalizeContactRedirect(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

export function normalizeRedirectDelay(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(10, Math.max(0, Math.floor(parsed)));
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
```

- [ ] **Step 4: Run the utility tests**

Run: `node --test backend/utils/contactConfig.test.js`

Expected: 2 tests pass and 0 fail.

---

### Task 2: Contact Message Persistence and Admin API

**Files:**
- Modify: `backend/db/firestoreDb.js`
- Modify: `backend/db/mysqlDb.js`
- Modify: `backend/db/memoryDb.js`
- Modify: `backend/db/index.js`
- Modify: `backend/database/schema.sql`
- Modify: `backend/database/migrate.js`
- Modify: `backend/routes/admin.js`
- Create: `backend/db/contactMessages.test.js`

**Interfaces:**
- Produces: `contactMessageCreate(data)`, `contactMessageList()`, `contactMessageUpdate(id, changes)`, and `contactMessageDelete(id)`.
- Produces admin endpoints `GET`, `PATCH`, and `DELETE /api/admin/contact-messages/:id?`.
- Consumes admin authentication middleware already used by `backend/routes/admin.js`.

- [ ] **Step 1: Write memory-adapter CRUD tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as memoryDb from './memoryDb.js';

test('contact messages can be listed, read, and deleted', async () => {
  const created = await memoryDb.contactMessageCreate({
    name: 'Client',
    email: 'client@example.com',
    message: 'A sufficiently long message.',
    notification_status: 'not_configured',
  });
  let rows = await memoryDb.contactMessageList();
  assert.equal(rows[0].id, created.insertId);
  assert.equal(rows[0].status, 'unread');
  await memoryDb.contactMessageUpdate(created.insertId, { status: 'read' });
  rows = await memoryDb.contactMessageList();
  assert.equal(rows[0].status, 'read');
  await memoryDb.contactMessageDelete(created.insertId);
  rows = await memoryDb.contactMessageList();
  assert.equal(rows.some((row) => row.id === created.insertId), false);
});
```

- [ ] **Step 2: Run the adapter test and confirm missing CRUD functions**

Run: `node --test backend/db/contactMessages.test.js`

Expected: FAIL because list/update/delete are not implemented and create has no returned identifier.

- [ ] **Step 3: Implement identical adapter behavior**

Memory records use numeric IDs, default `status: 'unread'`, nullable `read_at`, and default `notification_status: 'not_configured'`. Firestore uses `Timestamp.now()` and converts timestamps through `fromDoc`. MySQL uses:

```sql
ALTER TABLE contact_messages
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'unread',
  ADD COLUMN read_at TIMESTAMP NULL,
  ADD COLUMN notification_status VARCHAR(30) NOT NULL DEFAULT 'not_configured';
```

The adapter methods have these exact contracts:

```js
contactMessageCreate(data) => Promise<{ insertId: number }>
contactMessageList() => Promise<Array<ContactMessage>>
contactMessageUpdate(id, { status?, notification_status? }) => Promise<void>
contactMessageDelete(id) => Promise<void>
```

- [ ] **Step 4: Export CRUD through the database proxy**

```js
export const contactMessageList = (...a) => dbProxy.contactMessageList(...a);
export const contactMessageUpdate = (...a) => dbProxy.contactMessageUpdate(...a);
export const contactMessageDelete = (...a) => dbProxy.contactMessageDelete(...a);
```

- [ ] **Step 5: Add protected admin routes**

```js
router.get('/contact-messages', authenticate, requireAdmin, async (req, res) => {
  const messages = await db.contactMessageList();
  res.json({ messages });
});

router.patch('/contact-messages/:id', authenticate, requireAdmin, async (req, res) => {
  const status = req.body.status === 'read' ? 'read' : 'unread';
  await db.contactMessageUpdate(req.params.id, { status });
  res.json({ message: 'Contact message updated.' });
});

router.delete('/contact-messages/:id', authenticate, requireAdmin, async (req, res) => {
  await db.contactMessageDelete(req.params.id);
  res.json({ message: 'Contact message deleted.' });
});
```

- [ ] **Step 6: Run adapter and existing backend tests**

Run: `node --test backend/db/contactMessages.test.js backend/utils/*.test.js`

Expected: all tests pass.

---

### Task 3: Save-First Notification and Redirect Response

**Files:**
- Modify: `backend/utils/mailer.js`
- Modify: `backend/routes/contact.js`
- Create: `backend/routes/contactFlow.test.js`

**Interfaces:**
- Consumes Task 1 normalization/escaping helpers and Task 2 CRUD.
- Produces `isMailerConfigured()` and public response `{ message, redirect_url, redirect_delay }`.

- [ ] **Step 1: Add a source-level flow test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('contact route saves before attempting email and returns redirect settings', () => {
  const source = readFileSync(new URL('./contact.js', import.meta.url), 'utf8');
  const saveAt = source.indexOf('contactMessageCreate');
  const emailAt = source.indexOf('sendEmail');
  assert.ok(saveAt >= 0 && emailAt > saveAt);
  assert.ok(source.includes('redirect_url'));
  assert.ok(source.includes('notification_status'));
});
```

- [ ] **Step 2: Run the flow test and confirm failure**

Run: `node --test backend/routes/contactFlow.test.js`

Expected: FAIL because notification and redirect response are absent.

- [ ] **Step 3: Expose mailer readiness**

```js
export function isMailerConfigured() {
  return Boolean(
    process.env.SMTP_HOST
    && process.env.SMTP_USER
    && process.env.SMTP_PASS
  );
}
```

- [ ] **Step 4: Extend the public route**

Read `contact_notify_email`, `contact_redirect_url`, and `contact_redirect_delay` with `settingsGetByKeys`, normalize them using Task 1, call `contactMessageCreate` before `sendEmail`, escape all user values in HTML, and update the message's `notification_status` to `sent` or `failed`. If SMTP is absent, leave it `not_configured`. Return:

```js
res.status(201).json({
  message: 'Message sent. Thank you for getting in touch!',
  redirect_url: redirectUrl,
  redirect_delay: redirectDelay,
});
```

- [ ] **Step 5: Run contact and backend tests**

Run: `node --test backend/routes/contactFlow.test.js backend/utils/contactConfig.test.js backend/db/contactMessages.test.js backend/utils/*.test.js`

Expected: all tests pass.

---

### Task 4: Administrator Contact Inbox

**Files:**
- Create: `frontend/src/views/admin/ContactMessagesView.vue`
- Modify: `frontend/src/router/index.js`
- Modify: `frontend/src/layouts/AdminLayout.vue`
- Create: `frontend/src/views/admin/ContactMessagesView.test.js`

**Interfaces:**
- Consumes Task 2 admin endpoints.
- Produces route `/admin/contact-messages` and sidebar label `Contact Messages`.

- [ ] **Step 1: Write a source-level UI contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('admin contact inbox exposes message actions', () => {
  const source = readFileSync(new URL('./ContactMessagesView.vue', import.meta.url), 'utf8');
  for (const text of ['Contact Messages', 'Mark as read', 'Mark as unread', 'Reply', 'Delete']) {
    assert.ok(source.includes(text), `Missing inbox copy: ${text}`);
  }
});
```

- [ ] **Step 2: Run the contract test and confirm the missing-file failure**

Run: `node --test frontend/src/views/admin/ContactMessagesView.test.js`

Expected: FAIL because the view does not exist.

- [ ] **Step 3: Implement the inbox view**

The component loads `GET /admin/contact-messages`, sorts newest first, computes unread count, opens a selected message, calls `PATCH` to toggle status, calls `DELETE` after `window.confirm('Delete this contact message?')`, and uses:

```vue
<a :href="`mailto:${selected.email}`" class="btn btn-primary">
  <i class="bi bi-reply me-1"></i>Reply
</a>
```

It includes explicit loading, empty, and API error states.

- [ ] **Step 4: Register route and navigation**

```js
{ path: 'contact-messages', name: 'admin-contact-messages', component: () => import('@/views/admin/ContactMessagesView.vue') }
```

```js
{ to: '/admin/contact-messages', icon: 'bi-envelope', label: 'Contact Messages' }
```

- [ ] **Step 5: Run the UI contract test**

Run: `node --test frontend/src/views/admin/ContactMessagesView.test.js`

Expected: 1 test passes and 0 fail.

---

### Task 5: Client-Editable Contact Settings and Public Redirect

**Files:**
- Modify: `frontend/src/views/admin/SettingsView.vue`
- Modify: `frontend/src/views/HomeView.vue`
- Modify: `frontend/src/utils/theme.js`
- Modify: `backend/db/memoryDb.js`
- Modify: `frontend/src/views/HomeView.copy.test.js`
- Create: `frontend/src/views/admin/ContactSettings.test.js`

**Interfaces:**
- Consumes Task 3 response fields.
- Produces editable `contact_notify_email`, `contact_redirect_url`, and `contact_redirect_delay`.

- [ ] **Step 1: Write settings and redirect contract tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('contact settings are editable and homepage consumes redirect response', () => {
  const settings = readFileSync(new URL('./SettingsView.vue', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../HomeView.vue', import.meta.url), 'utf8');
  for (const key of ['contact_notify_email', 'contact_redirect_url', 'contact_redirect_delay']) {
    assert.ok(settings.includes(key), `Missing contact setting: ${key}`);
  }
  assert.ok(home.includes('data.redirect_url'));
  assert.ok(home.includes('window.location.assign'));
});
```

- [ ] **Step 2: Run the contract test and confirm failure**

Run: `node --test frontend/src/views/admin/ContactSettings.test.js`

Expected: FAIL because the settings and redirect consumption are absent.

- [ ] **Step 3: Add the Contact settings card**

Use email, URL/text, and bounded number inputs. Default the notification email to `jewisheducationalresources1@gmail.com`. Validate the recipient and redirect using the same accepted formats as the backend before calling `PUT /settings`.

- [ ] **Step 4: Apply the redirect after a successful submission**

```js
contactFeedback.value = data.message;
contactForm.value = { name: '', email: '', message: '' };
if (data.redirect_url) {
  const delay = Math.min(10, Math.max(0, Number(data.redirect_delay) || 0));
  window.setTimeout(() => window.location.assign(data.redirect_url), delay * 1000);
}
```

- [ ] **Step 5: Set defaults**

Add these exact defaults to `APPEARANCE_DEFAULTS` and the memory settings:

```js
contact_notify_email: 'jewisheducationalresources1@gmail.com',
contact_redirect_url: '',
contact_redirect_delay: '0',
```

- [ ] **Step 6: Run frontend contract and English-copy tests**

Run: `node --test frontend/src/views/admin/ContactSettings.test.js frontend/src/views/admin/ContactMessagesView.test.js frontend/src/views/HomeView.copy.test.js frontend/src/i18n/*.test.js`

Expected: all tests pass.

---

### Task 6: Full Verification and Firebase Deployment Readiness

**Files:**
- Verify all modified files.
- Update: `docs/superpowers/plans/2026-07-24-contact-management.md` checkboxes as work completes.

**Interfaces:**
- Consumes all earlier tasks.
- Produces a deployable frontend and backend.

- [ ] **Step 1: Run all Node tests**

Run: `node --test backend/**/*.test.js frontend/src/**/*.test.js`

Expected: 0 failures.

- [ ] **Step 2: Run syntax checks**

Run: `node --check backend/routes/contact.js; node --check backend/routes/admin.js; node --check backend/db/firestoreDb.js; node --check backend/db/mysqlDb.js; node --check backend/db/memoryDb.js`

Expected: exit code 0 for every file.

- [ ] **Step 3: Build the frontend**

Run: `npm run build`

Expected: Vite exits with code 0 and produces `frontend/dist`.

- [ ] **Step 4: Start the local site and run browser verification**

Run the existing development command, then verify:

1. Admin → Settings saves the Gmail recipient and both redirect fields.
2. The contact block submits a message.
3. Admin → Contact Messages displays it as unread.
4. Mark read/unread, Reply, and Delete behave correctly.
5. A relative redirect navigates only after a successful save.
6. An invalid redirect is rejected.

- [ ] **Step 5: Confirm production prerequisites**

Verify `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and optional `SMTP_FROM` are configured as Firebase secrets before claiming email delivery is active. Without them, report inbox storage as active and email notification as pending.

- [ ] **Step 6: Deploy only after the outstanding Firebase IAM permission is granted**

Run: `npx -y firebase-tools@latest deploy --project jewish-educational-resources --only "hosting,functions" --non-interactive`

Expected: Hosting and both Functions deploy successfully. If `secretmanager.secrets.setIamPolicy` returns 403, stop and report that the source implementation is complete but production Functions cannot receive secrets until an owner grants the required IAM permission.

