# Contact Management Design

Date: 2026-07-24

## Goal

Give the site administrator full control of the public contact form without code changes. Messages must remain recoverable in Firestore, be manageable from the admin panel, optionally notify the client's email, and optionally redirect the visitor after a successful submission.

The default notification address is `jewisheducationalresources1@gmail.com`.

## Chosen Approach

Keep the existing native contact form and extend it with:

1. Persistent message storage in Firestore.
2. A protected Contact Messages screen in the admin panel.
3. Optional email notification when SMTP is configured.
4. An administrator-editable post-submit redirect.

This avoids depending on an external form service and preserves messages even if email delivery fails.

## Administrator Settings

Add a Contact section to Admin → Settings with:

- `contact_notify_email`: notification recipient, defaulting to the client's Gmail address.
- `contact_redirect_url`: optional destination after a successful submission.
- `contact_redirect_delay`: delay in seconds before redirecting, constrained to 0–10 seconds.

The redirect accepts:

- A site-relative path beginning with `/`.
- A complete `https://` URL.

Other protocols, JavaScript URLs, malformed values, and protocol-relative URLs are rejected by both frontend and backend validation.

The existing appearance editor continues to control whether the contact block is visible and its title, supporting text, size, and submit-button label.

## Public Contact Flow

1. The visitor submits name, email, and message.
2. The backend validates and normalizes the values.
3. The backend creates the Firestore record first.
4. If a notification recipient and SMTP transport are configured, the backend attempts to email a copy.
5. Email failure is logged but does not discard or fail the saved message.
6. The API returns the success message and a validated redirect URL, if configured.
7. The frontend displays success feedback and redirects after the configured delay. Without a redirect, it remains on the page.

## Contact Message Data

Each `contact_messages` document contains:

- `id`
- `name`
- `email`
- `message`
- `status`: `unread` or `read`
- `created_at`
- `read_at`, nullable
- `notification_status`: `not_configured`, `sent`, or `failed`

Existing documents without the new fields are interpreted as unread and remain visible.

## Admin Contact Messages Screen

Add Admin → Contact Messages with:

- Newest-first message list.
- Unread indicator and unread count.
- Name, email, received date, and message content.
- `mailto:` reply action.
- Mark as read/unread.
- Delete with explicit confirmation.
- Loading, empty, and error states.

All message-management endpoints require an authenticated administrator.

## Backend Interfaces

Public:

- `POST /api/contact`: store a message, attempt notification, and return the optional redirect.

Admin:

- `GET /api/admin/contact-messages`
- `PATCH /api/admin/contact-messages/:id`
- `DELETE /api/admin/contact-messages/:id`

Database adapters for Firestore, MySQL, and the in-memory development database expose the same list, update, and delete operations.

## Email Delivery

Use the existing `nodemailer` dependency. SMTP is enabled only when all required runtime variables are present:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- optional `SMTP_FROM`

SMTP credentials are deployment secrets and are not editable or returned through the public settings API. The notification recipient is editable because it is not a credential.

Email subjects and bodies are in English. User-supplied content is escaped before being inserted into HTML.

## Error Handling and Security

- Validate name, email, message length, notification email, redirect, and redirect delay.
- Never expose SMTP credentials.
- Save the message before attempting email delivery.
- Require administrator authorization for reading, updating, or deleting messages.
- Escape message content in notification HTML.
- Return generic public errors while logging operational email failures server-side.

## Tests and Verification

- Unit tests for redirect validation and SMTP-configuration detection.
- API tests for valid and invalid contact submissions.
- Database-adapter tests for listing, read/unread updates, and deletion.
- Frontend production build.
- Browser tests covering:
  - Settings persistence.
  - Contact submission.
  - Success without redirect.
  - Safe redirect.
  - Admin inbox visibility and message actions.
- Production verification after deployment using Firebase Hosting and `/api/health`.

## Out of Scope

- Replies sent directly inside the admin panel.
- Attachments in contact messages.
- Newsletter or marketing automation.
- External CRM synchronization.
