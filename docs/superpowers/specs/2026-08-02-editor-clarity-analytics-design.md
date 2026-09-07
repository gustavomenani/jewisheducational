# Editor clarity and interaction analytics design

## Goal

Make the visual editor understandable for a first-time client and close the gaps found in the client's audio feedback: adding/removing buttons must be obvious, published buttons must work, and the site must distinguish page views, previews, page-card clicks, download-page opens, and file deliveries.

## User experience

The editor keeps the existing four workspaces (Add, Organize, Edit, Design), but the Add workspace becomes the default teaching surface. The first-use guide is a dismissible, non-blocking tip; it must never intercept clicks on the canvas or content cards. The Add workspace includes plain-language helper copy and a visible Button card.

When a block is selected, the properties panel exposes a prominent destructive action labeled “Remove button” for button blocks (and “Remove block” for other blocks). The existing compact toolbar remains available for experienced users. Removing a block always asks for confirmation and leaves the user in the Add workspace when no block is selected.

The button block separates editor behavior from visitor behavior: in editor mode, clicking selects the block; in visitor mode, the configured link follows normally. Text remains inline-editable, and the properties panel continues to expose link, alignment, style, width, and spacing.

## Analytics behavior

The client-facing event vocabulary is:

- `resource_preview_open`: cover/preview modal opened, with resource and file identifiers.
- `resource_page_click`: a specific worksheet/page card was clicked, with resource, file, and page label.
- `download_page_open`: the dedicated download screen was opened, with resource and file identifiers.
- `download_completed`: the protected file endpoint delivered a file; this is the server-side completion signal.

Google Analytics receives these events through the existing `gtag` integration. The backend receives the events through a validated authenticated/public analytics endpoint and stores them in the existing resilient database abstraction so the admin dashboard can show recent activity and per-file totals. Existing page-view and download-intent behavior remains backward compatible.

The resource page must emit a preview event when the preview modal opens and a page-card event before a file-page action. The existing dedicated download route must emit `download_page_open`; the file delivery route must record `download_completed` once the stream is authorized and started.

## Visual direction

Use the existing dark editor rail and light canvas, but strengthen the teaching hierarchy with one accent color for primary actions, a compact “How to edit” tip, and explicit action labels. The destructive action is red and textual, not icon-only. No new component library or visual dependency is introduced.

## Acceptance criteria

1. A first-time admin can add a button without closing or dismissing an overlay.
2. A selected button has a visible “Remove button” action in the properties panel; the action confirms and removes exactly that block.
3. A published button navigates to its configured link.
4. Existing text, image, layout, responsive preview, undo, duplicate, and publish flows still work.
5. Analytics can distinguish page views, preview opens, page-card clicks, download-page opens, and delivered files.
6. Existing automated tests, a fresh production build, and a headless localhost walkthrough pass with no console errors.
