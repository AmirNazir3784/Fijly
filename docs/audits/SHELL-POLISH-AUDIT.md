# Studio shell polish

Continues the current frontend, including the uncommitted Round B work. This
pass refines the existing shell; it does not rebuild pages or change production
workflows, status rules, requests, videos, revisions, dashboard calculations,
fixture data or the mock synchronization architecture.

## Requested results

1. **Duplicate headings:** all nine Admin routes and seven Client routes keep
   their existing main heading. The top bar now shows FIJLY ADMIN or FIJLY STUDIO
   instead of repeating the current page label. Browser document titles still
   identify the current route.
2. **Sidebar:** a separate profile footer sits at the bottom of the viewport-height
   sidebar. Navigation scrolls independently. The footer has a divider, Profile
   label, avatar, name, role, hover treatment and keyboard focus ring. It stays
   visible when an overlay sidebar is open, including short viewports.
3. **Profile panel:** one shared panel implementation supports both portals.
   Full name, optional phone and photo are editable. Email and role are read-only
   in the panel. Existing workspace Settings capabilities are preserved. Photos
   can be chosen, previewed, saved or removed. Closing without saving discards
   edits. Invalid images get useful feedback; successful saves are announced.
4. **Logo:** the existing FIJLY logo is an accessible link to `index.html`, with
   hover, pointer and focus treatment. It works with Enter as well as a click.
5. **Removed elements:** sidebar View website links, Client top-bar View site,
   the redundant Admin Portal pill, and repeated top-bar page labels. The mock
   disclosure is retained for assistive context without a second visible bar;
   the profile panel explains that photo changes stay in the mock workspace.
6. **Typography:** main headings use 32px/750 weight and the same colour on all
   routes and widths. Descriptions use muted 15.5px text. Table-heading typography
   and shell/button radii, weights and sizing follow shared rules. Table records
   and layouts were not changed.
7. **Spacing:** shared content padding, 10px title-to-description spacing, 28px
   header-to-content spacing, consistent top-bar alignment and responsive side
   gutters. Existing grids, cards and workflow sections are retained.
8. **Responsive verification:** 1440, 1024, 768, 390 and 320px across every route;
   additional 520px-height checks verify the persistent footer. Screenshots are
   saved under `qa/screenshots/polish-*.png` and were visually inspected at desktop,
   tablet and mobile widths.
9. **Accessibility:** semantic logo link and profile buttons, named dialog,
   associated labels, read-only field semantics, initial focus, forward/reverse
   modal focus containment, Escape and return focus. An open profile dialog takes
   precedence over the underlying sidebar's key handling. No workflow-dialog
   behavior is replaced.
10. **Remaining UI inconsistencies:** none identified within the shell/profile
    scope. Existing table/content layouts remain as requested. Browser verification
    is Chromium with responsive viewports; physical devices and other browser
    engines were not tested. No further polish round was started.

## Profile data and preservation

- Admin uses the existing `state.settings.adminName`, `adminEmail` and `adminRole`;
  optional `adminPhone` and `adminPhoto` stay on that same record.
- Client uses the existing client `contact` and `email`; optional `phone` and
  `profileImage` stay on that same client record. Company identity and production
  preferences are preserved. The displayed Client role describes the portal and
  adds no account or permission logic.
- Writes go through the existing `saveSettings` and `client.saveProfile` paths.
  No profile collection or separate persistent store was introduced. Temporary
  form drafts allow cancellation and preserve unsaved fields during broadcasts.
- Sidebar and Settings references subscribe to the shared state. Untouched fields
  refresh when another tab saves; explicit unsaved edits remain. Saving the panel
  uses fresh shared values, so an untouched field cannot overwrite a newer edit.
- PNG/JPG/WebP files up to 5 MB are resized to a small 192px JPEG avatar in the
  browser. Only this profile image value is saved in the existing mock session.
  No upload endpoint, asset workflow, backend, database or authentication was added.

## Files changed in this pass

Application:

- `site/admin.html`
- `site/studio.html`
- `site/js/studio-shell.js`
- `site/js/profile.js` (new)
- `site/js/mock-service.js` (optional personal fields only)
- `site/js/client-portal.js` (sidebar identity rendering only)
- `site/js/admin-sections.js` (avatar rendering only)
- `site/css/studio-polish.css` (new, portal-only)

Verification:

- `qa/studio-polish.cjs` and its result JSON (new)
- `qa/polish-baseline-hashes.json` (pre-pass scope snapshot)
- `qa/studio-v1.cjs`, `qa/functional.cjs` (new shell labels, logo and footer targets)
- `qa/run-all.cjs`, `qa/README.md`
- This audit, refreshed suite results and per-suite logs

The new suite hashes protected files against the **start of this pass**, preserving
the existing Round B changes. It also compares requests, videos, revisions,
scripts and assets before/after profile edits to verify that personal edits leave
production records unchanged.

## Final results

`node qa/run-all.cjs` passed all **19 maintained suites** on 2026-09-22T01:45:32.867Z (exit 0). The polish suite passed **100 accessibility scans**, with zero violations and zero console/page errors. `git diff --check` passed.

The full run preserves the existing workflow, revision/version, isolation, date/status, action-queue and analytics regression coverage. Desktop, tablet and mobile screenshots were visually reviewed. Existing narrow-screen table scrolling, including Admin Clients, remains outside this shell-only pass.

Verified application delta against the start-of-pass snapshot:

- `site/admin.html`
- `site/css/studio-polish.css`
- `site/js/admin-sections.js`
- `site/js/client-portal.js`
- `site/js/mock-service.js`
- `site/js/profile.js`
- `site/js/studio-shell.js`
- `site/studio.html`
