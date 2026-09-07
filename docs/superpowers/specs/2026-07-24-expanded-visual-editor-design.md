# Expanded Visual Editor Design

Date: 2026-07-24

## Goal

Make the existing administrator editor substantially easier and more capable, so the client can safely change the site's visible content and presentation without editing source code.

"More permissions" means more editable elements and controls for existing administrators. It does not mean adding new user roles or granting editor access to non-administrators.

## Current Problems

- Editing is difficult to discover because text requires a double-click and images use a different interaction.
- The Appearance screen exposes only Home and Library even though editable content also exists in the shared header, footer, resource, and download experiences.
- Many settings can only be changed through the general Settings screen, while others can only be changed directly on a page.
- Text, image, button, link, visibility, and section-order controls do not share a consistent interface.
- Image editing lacks alt text, reset/removal, link, and clear sizing controls.
- The free-form block canvas can replace an entire page, which is too risky for dynamic pages such as Library.
- Drafts are primarily browser-local and are not a dependable cross-device editing workflow.
- Some edit-mode labels and placeholders are still in Portuguese or contain broken characters.

## Chosen Approach

Use a hybrid visual editor:

1. Preserve the site's existing structured pages and dynamic behavior.
2. Let an administrator select editable content with one click.
3. Open a consistent inspector panel for the selected element.
4. Add a page/area selector for Home, Library, Header, Footer, Resource, and Download content.
5. Add safe section management for visibility and ordering.
6. Keep the free-form block canvas available only for explicitly custom content areas.

This gives the client broad control while protecting filters, authentication, downloads, resource rendering, and other application behavior.

## Editor Shell

The editor has three coordinated parts:

- A top toolbar with page selection, viewport preview, undo, redo, draft state, discard, preview, and publish.
- The live site canvas, where editable elements display a subtle outline on hover and are selected with one click.
- A right-side inspector that shows only the controls supported by the selected element.

The inspector remains open while the administrator moves between nearby elements. The selected element receives a visible focus state in the canvas.

On narrow screens, the inspector becomes a slide-over panel. Editing controls must remain keyboard accessible and must not rely on hover alone.

## Editable Areas

### Global

- Site name and tagline.
- Logo and logo alternative text.
- Header navigation labels and destinations.
- Header call-to-action label, destination, and visibility.
- Footer headings, text, navigation labels, destinations, copyright text, and visibility.
- Facebook and Pinterest URLs and visibility.

### Home

- Hero eyebrow, title, highlighted title, description, buttons, button destinations, and hero image.
- Audience or grade labels and destinations.
- Featured-section titles, supporting text, cards, icons/images, and visibility.
- Benefits-section heading, card titles, descriptions, and icons.
- Updates-section heading and individual update items.
- Free-guide heading, description, button, link, cover image, and visibility.
- Contact-section heading, supporting text, submit-button label, size, and visibility.

### Library

- Page title, description, search placeholder, filter labels, shortcut labels, empty-state text, and section visibility.
- Grade labels and other administrator-managed filter labels.
- Presentation text around dynamic resource results.

The resource result data remains managed through Resources and Categories, not directly through the appearance canvas.

### Resource and Download

- Breadcrumb labels.
- Download, preview, favorite, access, and related-resource labels.
- Supporting headings, messages, and calls to action.

Resource-specific titles, descriptions, files, categories, grades, SEO fields, and publication state remain managed in the Resource editor.

## Inspector Controls

### Text

- Plain text or multiline text depending on context.
- Heading level only where changing it is structurally safe.
- Alignment.
- Optional text color from the approved theme palette.
- Reset to the default value.

Rich text is limited to safe formatting: bold, italic, lists, and links. Arbitrary HTML is not accepted.

### Buttons and Links

- Label.
- Destination.
- Open in new tab.
- Style variant.
- Alignment.
- Visibility.

Destinations accept site-relative paths, `https://` URLs, `mailto:`, and `tel:` where appropriate. Unsafe protocols are rejected.

### Images

- Upload or replace.
- Preview.
- Alternative text.
- Width.
- Alignment.
- Optional link.
- Reset or remove when the design allows an empty image.

Uploaded files retain the existing media validation rules. Image controls do not permit executable content or arbitrary remote markup.

### Sections

- Show or hide.
- Move up or down.
- Duplicate only for repeatable, data-safe sections.
- Reset section content.

Core structural sections may be hidden or reordered only where doing so cannot break page behavior. Dynamic Library results, authentication forms, and download authorization cannot be deleted or converted into free-form blocks.

## Navigation and Discovery

The Admin Appearance screen becomes the editor dashboard. It lists:

- Home
- Library
- Header and Footer
- Resource Page
- Download Page

Each entry explains what can be edited and provides an Edit button. The live editor also includes a page selector, so administrators do not need to return to the dashboard for every area.

The interface and all editor helper text are English-only. Portuguese edit-mode labels, broken encoding characters, and mixed-language placeholders are removed.

## Draft, Undo, and Publishing Model

- Field changes enter a draft immediately.
- Undo and redo operate on editor changes before publication.
- Navigating between supported editor pages preserves the active draft.
- The toolbar clearly shows `Saved`, `Unsaved changes`, `Publishing`, `Published`, or `Publish failed`.
- Publish sends all pending changes as one logical operation.
- Discard requires confirmation when changes exist.
- Leaving the editor with unsaved changes triggers a warning.

The first implementation may continue using the existing browser draft store for recovery, but the saved/public values remain server-backed. The storage format must be versioned so future editor changes can safely migrate drafts.

## Settings and Data Compatibility

- Continue using the existing settings keys wherever possible.
- Add narrowly scoped settings keys only for newly editable values.
- Do not replace dynamic resource, category, account, contact-message, or payment data with appearance settings.
- Existing published values remain valid after the editor upgrade.
- Missing new settings fall back to English defaults.
- Reset actions restore the repository-defined English default rather than an empty accidental value.

## Authorization

- Only authenticated administrators can open edit mode, read private editor metadata, save drafts to protected storage if added later, or publish changes.
- Public visitors receive only published site settings.
- Existing administrator accounts remain administrators.
- Existing non-administrator accounts keep their current access and receive no editor permissions.

## Error Handling and Stability

- Failed field saves remain in the local draft and display an actionable English error.
- A partial publish must not silently appear successful.
- Invalid URLs, unsupported files, and unsafe formatting are rejected before publication.
- The editor must not mutate the public page while previewing unpublished changes outside the administrator's session.
- Error boundaries protect the site canvas so one invalid editor control does not make the whole page blank.
- Dynamic page functionality is verified both in and outside edit mode.

## Accessibility and Usability

- Selection works with mouse, keyboard, and touch.
- Every control has a visible label and focus state.
- Color is not the only indicator of selected, saved, or error states.
- Buttons and icons have English accessible names.
- Destructive actions use explicit confirmation.
- The Grades menu and other hover menus remain reachable long enough to move the pointer into them and remain usable by keyboard.

## Verification

- Unit tests for inspector field normalization, URL validation, reset behavior, and draft history.
- Component tests for text, button/link, image, and section controls.
- Authorization tests confirming only administrators can publish.
- Frontend production build and existing backend test suite.
- Automated browser checks for:
  - Opening every editor area.
  - Selecting representative text, image, button, link, and section elements.
  - Editing, previewing, undoing, redoing, discarding, and publishing.
  - Refreshing and recovering an unfinished draft.
  - Verifying published changes in a clean public session.
  - Confirming Library filters, Grades navigation, authentication, resource pages, and downloads still work.
  - Confirming no visible Portuguese editor strings remain.
  - Checking desktop and mobile editor layouts.
- Browser console must contain no uncaught application errors during the tested flows.

## Acceptance Criteria

1. An administrator can edit the listed global, Home, Library, Resource, and Download presentation content without source-code changes.
2. Editable elements are discoverable and selectable with one click.
3. Text, images, links, buttons, visibility, and safe section ordering use a consistent inspector.
4. Draft, undo, redo, preview, discard, and publish states are clear and reliable.
5. Dynamic site behavior remains protected and functional.
6. The complete public site and editor interface display English text, excluding PDF contents.
7. Existing administrator and registered-user access remains unchanged.
8. Production build, automated tests, and browser smoke tests pass.

## Out of Scope

- New administrator or editor roles.
- Arbitrary HTML, CSS, or JavaScript editing.
- Turning authentication, Library results, downloads, or payment flows into removable free-form blocks.
- Editing PDF content.
- Replacing the Resources, Categories, Users, Contact Messages, or Settings administration screens.
