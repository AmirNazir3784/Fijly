# Client Portal refinement — September 21, 2026

The seven existing screens retain the FIJLY shell, typography, colours, cards,
panels, request form, preview, script scenes, responsive layout and shared workflow
dialogs. No backend, authentication, APIs, storage uploads, billing, or account
management was added.

## Data and behavior

- `FijlyMock.client` centralizes the current mock client, scoped reads and ownership
  checks for client mutations. Selection is tab-local and persisted in
  `fijly-current-client`; Northbeam remains the default. This is a frontend data
  boundary, not authentication. The entire mock still exists in browser memory.
- Existing workflow-v3 sessions gain scripts and per-client preferences without
  losing requests, versions, feedback, revision rounds or assets. All writes use
  the existing session persistence and BroadcastChannel synchronization.
- Overview derives four metrics and all work links from owned records. Static
  growth figures and progress percentages are removed. The existing animated
  preview and storyboard are explicitly illustrative; version metadata is real
  mock data, not a claim that a media file was uploaded.
- Projects includes pending requests and all eight client workflow statuses,
  title search, status filtering, dates, versions, feedback, rounds, history and
  final-delivery metadata through the existing workflow dialog. Admin controls
  remain restricted to the Admin UI.
- Requests include title, type, brief, platform, six lengths, requested deadline,
  priority, validated reference links and attachment metadata. History and Admin
  update immediately. Client preferences initialize untouched request fields.
- Review supports approval and revision feedback; previous versions and feedback
  stay intact. Scripts have scoped records, scenes, linked videos, status,
  approval and revision feedback. This is deliberately a small mock workflow.
- Assets use only the shared collection. Category summaries, search/filter,
  details and simulated additions retain file metadata only.
- Analytics derives production metrics, status counts, delivery activity and
  recorded production duration. Older completed fixtures without completion dates
  are explicitly shown as undated and excluded from duration calculations.
- Settings save company/contact information, website, notification preferences,
  default platform and length. Discard restores saved values; broadcasts preserve
  unsaved edits. Notifications are preferences only; no messages are sent.

## Verification

Run with `python -m http.server 8766 --directory site` and Node:

| Suite | Final result |
| --- | --- |
| `studio-client.cjs` | Seven screens, request → two revisions → approval → completed, V1–V3 preserved, assets, scripts, settings, six-client isolation, cross-tab sync; five widths; 17 clean axe scans; zero console/page errors |
| `studio-v1.cjs` | All 15 Client/Admin routes at five widths; 34 clean axe scans; zero page errors or application API requests |
| `studio-admin-sections.cjs` | Admin Assets/Analytics/Settings regression, cross-tab state, responsive and accessibility checks passed |
| `studio-workflow.cjs` | Existing complete workflow regression passed |
| `studio-workflow-probe.cjs` | 65 checks passed |
| `studio-workflow-sweep.cjs` | Every request/video/revision/client detail opened without errors |

Desktop and mobile screenshots are in ignored `qa/screenshots/client-*.png`.
The Client machine-readable report is `studio-client-results.json`. The V1 test's
All-project count was updated to include pending requests, matching the refined
Projects screen rather than the former videos-only table.

## Baseline findings outside this change

Existing QA was run before implementation; logs are in `baseline-client/`.
The active Admin/workflow suites passed. Several legacy tools already failed:

- `functional.cjs` expects the removed Team route and obsolete static filters and
  a non-submitting request form.
- `refinement-check.cjs` expects a removed marketing `.hero-frame`.
- `final_browser.cjs` fails an existing marketing desktop-resize focus assertion.
- `compare.cjs` cannot open the hidden original prototype sidebar.
- `static_check.py` flags existing routed fragments, unescaped font URL entities,
  an unnamed marketing SVG and inline noscript styling. It does not understand
  all Admin hash routes.
- The original render run saw external font connection failures; the refinement
  render completed 54 renders without overflow or errors. The visual-sheet utility
  initially ran before its source renders were available.
- An initial V1 run timed out loading an external font during reload; the final
  V1 regression passes.

These were not treated as regressions or grounds to change the approved marketing
site. The complete Studio frontend is ready for final frontend QA. A repository-
wide freeze should reconcile these pre-existing legacy QA failures first.

## Follow-up stabilization

The baseline failures above are historical. They have been reconciled in the [stabilization audit](STABILIZATION-AUDIT.md). Use `node qa/run-all.cjs` and its current results for the maintained QA status. No frontend freeze is declared.
