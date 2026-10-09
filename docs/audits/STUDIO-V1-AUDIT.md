# FIJLY Studio V1 — audit and first milestone

## Existing frontend audited

The Studio is a static HTML/CSS/JavaScript application, not a framework app. `site/studio.html` contained eight hash-routed screens. Shared design tokens and components live in `css/variables.css`, `css/base.css`, and `css/components.css`; the shell and screen layouts live in `css/dashboard.css`. `js/studio.js` supplied routing, the responsive sidebar, project filters, switches, and preview controls. There was no backend or authentication integration.

| Existing route | Existing components and behavior | V1 treatment |
| --- | --- | --- |
| `#overview` | Four metric cards; production preview; play/pause, restart, fullscreen and timeline; five-scene storyboard; four project cards | Preserved. Updated workspace/preview wording and current active/review counts. |
| `#projects` | Project table, progress indicators, status filter chips, empty state and horizontal scrolling | Preserved. |
| `#requests` | Request form, video-type choices, open-request cards; submit previously displayed a demo notice | Preserved layout. Added required-field validation and in-memory request creation with an updated sidebar count. Reload restores fixtures. |
| `#assets` | Logo variants, color swatches, typography, product screenshots, file inventory | Preserved. Removed “sample” from image descriptions. |
| `#scripts` | Script document, scene blocks, approval badge, existing comment thread | Preserved. No editor-account or collaboration features added. |
| `#analytics` | KPI cards, chart, funnel, performance table | Preserved as mock metrics. |
| `#team` | Existing member cards | Retained inside an inactive HTML template; removed from active navigation and routing. |
| `#settings` | Workspace information, notification switches, brand defaults | Preserved. Removed active plan wording; switches remain local to the current visit. |

The Pro-plan/credit block is retained in an inactive `future-subscription` template. Its existing styles remain reusable. The Team screen is retained in `future-team`. Template content is outside the live DOM, so neither routing nor keyboard navigation can activate it. A direct `#team` link falls back to Overview.

The original unavailable controls (global search, notifications, date-range selection, full storyboard editor, and logo change) remain explicitly unavailable. This milestone does not invent backend behavior for them. “Product Demo” remains a video format; it is not demo-workspace copy.

## Shared shell reuse

`site/js/studio-shell.js` is extracted from the existing Client navigation and sidebar code. Both portals use it for hash routing, active links, document titles, focus handling, mobile focus trapping, Escape/backdrop closure, and desktop resize behavior. It emits `studio:screenchange` so Client playback still pauses on navigation without requiring a player in Admin.

The Admin uses the existing dark sidebar, topbar, page headings, cards, panels, badges, tables, form fields, buttons, typography, colors and responsive breakpoints. `css/admin.css` only supplies Admin composition and client-dialog styles. No Client visual redesign or marketing-page changes were made in this milestone.

## Completed Admin frontend

- `site/admin.html#dashboard`: derived mock metrics, upcoming deadlines, production-stage counts, recent activity, client-status summary, and links to client profiles.
- `site/admin.html#clients`: six mock clients, company/contact/email search, status filtering, sorting, empty state, client profile dialogs, project history, production notes, and local add/edit forms.
- Client forms validate required values, email format, and duplicate company names. User-entered text is rendered with DOM `textContent`. Cancel discards edits. Saved edits update the list, profile, Dashboard metrics and linked client names for the current tab.
- The Admin sidebar contains the requested eight labels. At V1 only Dashboard and Clients were active; Video Requests, Videos and Revisions followed in Phase 2, and Assets, Analytics and Settings in Phase 3. All eight are now live.

`js/admin-data.js` holds fictional fixture data; `js/admin.js` keeps edits in memory. No local persistence, backend, database, APIs, authentication, account invitations, billing, editor accounts or team management were added. The Client and Admin are separate frontend fixtures; the Admin “Client portal” link opens the existing Northbeam Client workspace, not an impersonation/session switch.

## Verification

Run `node qa/studio-v1.cjs` from the repository root. The script uses the same installed Playwright runtime as the existing QA scripts; `PLAYWRIGHT_MODULE` can override its module path.

The regression covers all nine active screens at 1440, 1024, 768, 390 and 320px; navigation/history/focus and mobile sidebars; inactive features; Client filters, playback, storyboard, switches and requests; Admin search/filter/sort, form validation, safe text rendering, client creation/edit/cancel, metric consistency and reset-on-reload behavior. Accessibility scans include desktop/mobile screens and client dialogs. Screenshots are written to the ignored `qa/screenshots/` directory; the machine-readable report is `qa/studio-v1-results.json`.

Stop point for V1: Client cleanup, Admin shell, Dashboard and Clients.

---

# Phase 2 — request-to-delivery workflow

## Shared state

`site/js/mock-service.js` holds the single session mock every screen reads. It
keeps `requests`, `videos`, `revisions`, `clients` and `activity` in one record
set, persists to `sessionStorage` under `fijly-studio-workflow-v2`, and
synchronises open tabs over a `BroadcastChannel`. The completed Dashboard and
Clients screens were not re-pointed at new fixtures: a read-only `projects`
projection derives their existing shape from the same `videos` records, so
there is no second source of truth.

`site/js/workflow.js` renders the shared operational UI (lists, filters, detail
dialog, editor dialog, confirmations) for both portals from that service.
`site/css/workflow.css` supplies only the composition for those pieces and
reuses the existing tokens, buttons, badges, panels and table styles.

## Workflow covered

Client submits → Admin receives → Admin reviews/edits → Move to Production →
video record created → add V1 → Draft Ready → Client Review → client requests a
revision → Admin Revisions → In Revision → add V2/V3 without overwriting → back
to Client Review → client approves → Admin marks Completed.

Transitions are guarded in the service rather than the UI: Draft Ready is
unavailable until a version exists, a revised version is required before a
revision round can return to Draft Ready, Completed is terminal, and versions
are append-only. Illegal transitions throw a readable message instead of
silently changing state.

## Admin screens completed in Phase 2

- **Video Requests** — search across title/client/editor, client, status and
  priority filters, five sort orders, empty state with a clear-filters reset,
  detail view with instructions, reference links and attachment metadata, full
  edit (title, platform, type, instructions, references, attachments,
  priority, Assigned Editor, deadline), Review request, and Move to Production
  with confirm/cancel.
- **Videos** — production statuses, detail view, link back to the original
  request, Assigned Editor and deadline editing, version history, client
  feedback, revision history, activity timeline, Add version, Draft Ready,
  Send to Client Review, and the Approved → Completed flow.
- **Revisions** — client, video and round, the feedback that opened the round,
  Assigned Editor, deadline and status, Start revision, Add revised version,
  Send back to Client Review, Resolved state, and preservation of every
  earlier round.

Assigned Editor remains a free-text value on the request. No backend,
database, migrations, authentication, APIs, subscriptions, team/editor
accounts, or Assets/Analytics implementation were added.

## Phase 2 verification

| Script | Covers |
| --- | --- |
| `qa/studio-workflow.cjs` | Full client→admin→client→completion run in two tabs: submission, edit/review, cancel and confirm production, V1/V2/V3, two revision rounds, approval, completion, append-only history, cross-tab sync, reload persistence, combined filters and sorting, five viewport widths, axe scans. |
| `qa/studio-workflow-probe.cjs` | Every sort option on all three lists, empty states and filter reset, status vocabularies, client filter chips, a self-built three-round cycle proving V1→V4 and rounds 1–3 stay intact, refusal of illegal transitions, mid-workflow reload, overflow at five widths. |
| `qa/studio-workflow-sweep.cjs` | Opens the detail dialog for every record in all three Admin lists and every client project, watching for page and console errors. |
| `qa/studio-v1.cjs` | The V1 regression, updated for Phase 2 (see below). |

The V1 script was written when the three Admin screens were inactive and the
mock reset on reload. Its stale expectations were corrected rather than
removed: Admin now has five active routes instead of two, `#revisions`
resolves to its own screen while still-deferred `#assets` keeps the fallback
check, three nav items remain deferred instead of six, and the reload
assertions now verify session persistence instead of a fixture reset. Counts
driven by seed data are derived from the live state rather than hard-coded.

One defect was found and fixed during this pass: the client portal dereferenced
`videos[0]` unguarded when setting the preview label and status pill, which
would throw if the workspace ever had no videos. Both reads are now guarded.

---

# Phase 3 — Assets, Analytics and Settings

## Shared state

Two collections were added to the existing session mock rather than a second
store: `assets` and `settings`. The storage key moved to
`fijly-studio-workflow-v3` so an older session is rebuilt instead of loading a
record set without them. `requests`, `videos`, `revisions`, `clients` and
`activity` are untouched, and the Video Requests → Videos → Revisions workflow
was not modified.

New service operations: `saveAsset` (create and edit), `deleteAsset`,
`assetsFor(clientId)` and `saveSettings`. Each validates before committing and
goes through the same `commit()` path, so every screen and every open tab
updates together.

`site/js/admin-sections.js` renders the three screens. `site/css/admin.css`
gained composition-only rules; colours, cards, tables, badges, toggles and form
fields all come from the existing tokens.

## Assets

An operational library over client-supplied files. Search across file name,
client, category and notes; client and category filters that combine; five sort
orders (newest, oldest, name, client, largest); result count and an empty state
with a reset. A row opens a detail dialog showing category, file type, size,
uploaded date, owning client and notes.

Add, edit and remove are all mock operations. Choosing a file contributes only
its name, type and size — no bytes are read, uploaded or stored, and the record
is flagged `simulated`. The file picker is hidden when editing, because
re-picking a file for an existing record would imply an upload. Removal asks for
confirmation and cancelling returns to the detail view with the record intact.

Seventeen assets are seeded across all six clients and all eight categories.
The Client Portal's Brand Assets screen now renders that client's records from
the same collection, so an asset added in Admin appears there without a reload.

## Analytics

Every figure is computed from the shared records; none are written by hand.
Eight KPIs (active clients, new requests, in production, awaiting review,
completed, revision rounds, average production time, assets on file), a
production-status breakdown across all six video statuses, a six-week trend of
completions against revision rounds, a per-client activity table, and an
approval-quality summary (approved without a revision, needed a round, average
rounds when revised, rounds still open).

A client filter and a date range (7/30/90 days, all time) scope every figure
together. Average production time is measured from a request's submission to
its video's last activity entry, and reports `—` rather than `0` when nothing
completed in range. The trend bars are `aria-hidden` and the same numbers are
repeated as text beneath them, so the chart is decorative rather than the only
source of the information.

## Settings

Four panels: admin profile, studio information, notification preferences and
default workflow preferences. Saving validates the required names, the email
format and a 1–90 day turnaround, and persists through the shared service.
Discard restores the stored values.

The workflow defaults are applied, not merely stored. `defaultPriority` and
`defaultLeadDays` seed the client request form, and `defaultLength` is the
fallback `normalize()` uses when a request arrives without one. A value the
visitor has touched is never overwritten by a later default change.

No billing, plan, subscription, team permission, staff account or authentication
control was added.

## Phase 3 verification

`qa/studio-admin-sections.cjs` covers Assets search/filter/sort/empty state, the
create/edit/delete flow including validation and cancel, client-relationship
integrity, the Admin↔Client shared asset collection across two tabs, analytics
derivation and scoping, settings persistence and rejection of invalid values,
the workflow defaults reaching a created record, five viewport widths and axe
scans of both dialogs.

Three defects were found and fixed while building this phase:

- `form.elements.length` returns the number of fields in a form, not the field
  named `length`. The Phase 2 submit handler read it that way, so a client's
  chosen video length was silently replaced by the hard-coded fallback. Both the
  old and new reads now use `elements.namedItem('length')`.
- The Settings form was re-populated on every state broadcast, which would wipe
  unsaved edits when another tab changed anything. It now tracks a dirty flag
  and skips the reload while edits are pending.
- KPI cards used `h3` directly under the page `h1`, which axe flagged as a
  heading-order violation. They now use `h2`, matching the Dashboard stat cards.

The V1 regression was updated again for the three newly active routes: Admin now
declares eight active screens, `#assets` resolves to its own screen, an unknown
hash keeps the fallback check, and no nav item is deferred.

## Current stabilization status

The milestone notes above describe their original phases. Current state recovery, record-level tab synchronization, derived activity and completion-date calculations are documented in [STABILIZATION-AUDIT.md](STABILIZATION-AUDIT.md). Run all maintained QA with `node qa/run-all.cjs`; configuration is documented in [qa/README.md](../../qa/README.md). This is stabilization only, not a freeze.
