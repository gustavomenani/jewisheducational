# Beginner Visual Editor and Admin User Creation Design

Date: 2026-07-31

## Goal

Make the site editor approachable for a client familiar with Google Sites and Wix while preserving the site's responsive layout and dynamic behavior. Add an administrator-only flow for creating users with a temporary password.

## Product Direction

The editor will follow a constrained Google Sites-style model rather than a free-positioning Wix canvas. Administrators can edit existing content directly and insert structured content blocks, but they cannot place elements at arbitrary coordinates or overlap them.

This balance provides useful personalization without creating desktop-only layouts that break on mobile devices.

## Editor Entry and First-Use Guidance

- The Appearance screen remains the entry point and uses one prominent `Edit site` action.
- The first editor visit shows a dismissible three-step introduction: select content, make changes, preview and publish.
- The introduction can be reopened from a `Help` action.
- The page opens in a beginner-friendly Basic mode. Advanced controls remain available under `More options`.
- All editor copy is English and uses non-technical language.

## Editor Shell

The editor has three primary regions:

1. A compact top bar with page selection, viewport preview, undo, redo, help, discard, preview, and publish.
2. The live page canvas, where editable elements show a subtle hover outline and a clear selected state.
3. A contextual right-side panel that displays only controls relevant to the selected content.

On narrow screens, the contextual panel becomes a slide-over. The editor must remain usable with mouse, keyboard, and touch.

## Basic and Advanced Modes

### Basic mode

Basic mode is the default and exposes:

- Text and rich-text content.
- Image replacement and presentation.
- Button label and destination.
- Section visibility and order.
- Adding structured content blocks.
- Preview and publish actions.

### More options

Advanced options contain:

- Theme colors and typography.
- Technical field catalog access.
- Custom block settings already supported by the application.
- Reset controls and identifiers useful for troubleshooting.

Advanced options must not be required for ordinary editing.

## Direct Editing

- One click selects editable content.
- Text editing uses a visible input or safe rich-text control rather than relying on hidden gestures.
- Images expose visible actions for replacing, resizing, aligning, duplicating, and removing.
- Buttons expose label, internal or external destination, style, alignment, visibility, and new-tab behavior.
- Selection never activates public navigation while edit mode is active.

## Add Content

An `Add content` action inserts a structured block before or after an existing safe content block. The initial library contains:

- Text.
- Image.
- Button.
- Divider.
- Spacer.
- Two-column layout.

Blocks can be reordered with accessible move-up and move-down actions. Desktop drag-and-drop may be included as an additional interaction, but it must not be the only way to reorder content.

Free positioning, arbitrary coordinates, overlapping elements, custom HTML, custom JavaScript, and unrestricted CSS are not supported.

## Image Blocks

An image block supports:

- Uploading or replacing an image with the existing media validation rules.
- A preview before publication.
- Alternative text.
- Optional caption.
- Optional safe link.
- Left, center, or right alignment.
- Small, medium, large, or full-width presets.
- A constrained resize control that preserves the aspect ratio.
- Duplicate, move, reset, and remove actions.

Images participate in normal document flow. They may appear between blocks or inside a two-column layout, but they do not float over unrelated content. Mobile preview stacks columns and constrains images to the viewport width.

## Two-Column Layout

- Each column can contain supported text, image, button, divider, or spacer blocks.
- Presets include equal columns, wide-left, and wide-right.
- Columns stack vertically on mobile, following their desktop reading order.
- The administrator can swap columns without recreating their content.
- Nested column layouts are not supported.

## Safe Page Boundaries

Structured blocks are available only in explicitly safe content regions. They cannot replace or interrupt:

- Authentication controls.
- Library filters or search results.
- Resource data and file lists.
- Download authorization.
- Payment flows.
- Administrative screens.

Home supports the broadest block insertion. Library, Resource, and Download pages expose only designated introduction, supporting-content, or call-to-action regions. Header and Footer retain structured navigation controls rather than arbitrary blocks.

## Draft and Publishing Behavior

- Changes enter the active draft immediately.
- Undo and redo cover existing fields and structured block changes.
- The status is always visible as `Saved`, `Unsaved changes`, `Publishing`, `Published`, or `Publish failed`.
- Preview shows the complete draft in desktop, tablet, and mobile widths without changing the public site.
- Discard requires confirmation when unpublished changes exist.
- Leaving with unpublished changes triggers a warning.
- Publishing applies the pending settings and layout as one logical operation. A partial failure cannot be reported as success.
- Existing published content and draft formats remain compatible or are migrated by an explicit versioned migration.

## Administrator User Creation

The Users screen adds a primary `Add user` action. It opens an accessible dialog with:

- Name.
- Email address.
- Temporary password.
- Role: User or Admin.
- Plan: Free, Paid, or School.
- An optional show/hide password control.

The form validates required fields, a normalized valid email address, a minimum password length of six characters, an allowed role, and an allowed plan. Duplicate email addresses return a clear conflict error.

Only an authenticated administrator can call the creation endpoint. The backend hashes the temporary password with the same algorithm used by public registration and never returns the password or password hash. The created account is active immediately and can sign in through the normal email/password flow.

The successful response returns the safe user record with resolved plan information. The new row is added to the Users table without a full page refresh, and the dialog closes with a visible success message.

This version does not send an invitation email and does not force a password change on first login because neither capability is currently supported by the authentication model. The administrator is responsible for sharing the temporary password securely.

## Backend and Data Compatibility

- Reuse the existing database abstraction and `userCreate` behavior across Firestore, MySQL, and memory implementations.
- Add an administrator-protected `POST /api/admin/users` endpoint.
- Keep public registration behavior unchanged.
- Preserve existing users, roles, plans, subscriptions, signup metadata, and account access.
- Do not create a Firebase Authentication record for password accounts; the existing application authenticates password accounts against its own hashed user records.
- Normalize email addresses to lowercase before duplicate checks and storage.

## Error Handling

- Invalid or unsupported block placement is rejected before saving.
- Unsupported image types, oversized files, unsafe URLs, and missing alternative text warnings are shown next to the relevant control.
- Failed editor operations leave the draft intact and provide a retry action.
- User creation errors leave non-password form fields intact. The password field is cleared after an authentication or server failure.
- Backend errors must not expose password hashes, stack traces, credentials, or database internals.

## Accessibility and Responsive Behavior

- All controls have visible labels and accessible names.
- Selection, block insertion, reordering, resizing presets, and publishing are keyboard accessible.
- Color is not the only state indicator.
- Focus returns to the triggering action when a dialog or slide-over closes.
- The live canvas includes desktop, tablet, and mobile preview widths.
- Image and two-column blocks must not create horizontal page scrolling at supported preview widths.

## Verification

- Unit tests for block normalization, safe placement, responsive column behavior, URL validation, draft migration, undo, and redo.
- Component or source-contract tests for Basic mode, `More options`, first-use help, contextual image controls, Add content, and viewport previews.
- Backend route tests for administrator authorization, required fields, email normalization, duplicates, password hashing, allowed roles, and allowed plans.
- Users screen tests for opening, validation, successful creation, error handling, and immediate table insertion.
- Production frontend build and complete backend test suite.
- Browser smoke checks for editing existing content, inserting and reordering each block type, centered images, two-column layouts, desktop/mobile preview, draft recovery, discard, and publish.
- Browser smoke checks for creating a Free user and signing in with the temporary password.
- Existing Library, authentication, Resource, Download, payment, and administrative behavior must remain functional.

## Acceptance Criteria

1. A first-time administrator can discover how to edit content without documentation.
2. Basic mode presents only the most common content controls; advanced settings do not dominate the initial experience.
3. Administrators can insert, move, resize, align, caption, link, duplicate, and remove images in safe page regions.
4. Administrators can combine images and text with responsive two-column layouts.
5. Inserted content stays in document flow and remains usable on mobile.
6. Draft, preview, undo, redo, discard, and publish states are clear and reliable.
7. Dynamic site behavior cannot be removed or covered by custom content.
8. An administrator can create an active User or Admin account with a temporary password and selected plan.
9. User creation is validated and administrator-only, and no password or password hash is returned.
10. Existing accounts, published content, editor drafts, and public site behavior remain compatible.

## Out of Scope

- Arbitrary element coordinates or overlapping content.
- Custom HTML, JavaScript, or unrestricted CSS.
- Nested column layouts.
- Invitation emails.
- Mandatory password change on first login.
- New roles beyond User and Admin.
- Editing PDF contents.
