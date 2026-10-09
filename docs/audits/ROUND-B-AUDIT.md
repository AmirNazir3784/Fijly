# Round B — continuation of 1649f32

This round is limited to the 13 requested UX items. Round A's shared status
names/colours, date formatter, dialogs, scene editor, video/script versioning,
revision history, client isolation and cross-tab synchronization are retained.
The public landing page, backend, database, authentication, billing and editor
accounts were not changed. No upload, storage or download implementation was added.

| # | Item | Result | Evidence / behavior |
|---|---|---|---|
| 1 | Inactive client controls | Changed in Round B | Removed the top search, bell, inactive Overview period button and full storyboard editor button. Screen-specific search remains functional. |
| 2 | Admin action queue | Changed in Round B | One Dashboard queue covers unproduced Submitted/Under Review requests, actionable video revisions, Draft/Revision Requested scripts, drafts ready to send and approved videos awaiting finalization. Every title opens its record. |
| 3 | Sidebar counts | Changed in Round B | Requests, Videos, Revisions and Scripts badges derive from the exact same `adminActions()` result as the Dashboard queue. Zero counts are hidden; broadcasts refresh counts. |
| 4 | Notification UX | Already satisfied by Round A | The existing Overview draft-ready message and working review link are sufficient. Retained them as the notification experience; the inactive bell was removed under item 1. No competing notification system. |
| 5 | Destructive asset action | Changed in Round B | Both Remove asset buttons are red. The existing confirmation/cancel flow remains. |
| 6 | Request triage | Changed in Round B | Initial status filter is Needs review, using the shared action definition. All statuses remain accessible. Start review describes the status-changing action. Submitted and In Production already have distinct Round A colours; preserved. |
| 7 | Submission feedback | Changed in Round B | Visible success banner uses client-facing wording. Required title/brief/deadline errors appear beside fields; bad URLs appear beside Reference Links. Invalid fields have descriptions, invalid state and focus. Immediate Admin synchronization is retained. |
| 8 | Asset UX | Changed in Round B | One searchable/filterable file list replaces duplicate category panels. All eight categories remain available. Admin and Client use shared KB/MB formatting. Adding an asset confirms success and reveals the added record. Feedback is cleared when changing client. |
| 9 | Script review visibility | Changed in Round B | Unshared Draft scripts are absent from the client selector. Reviewable scripts sort first and say Needs your review. Approved scripts show review complete. Empty state explains when scripts will appear. Admin scene editing and revision/version workflow remain. |
| 10 | Deadline/video navigation | Changed in Round B | Dashboard deadline titles open the matching video. Client-profile project/request titles also open the matching record. Existing Client video links remain. |
| 11 | Mobile workflow records | Changed in Round B | At 600px and below, Client Projects and Admin Requests/Videos/Revisions/Scripts/Assets use labelled cards from the same table DOM. Dashboard deadlines also use cards. Desktop tables remain. Mobile horizontal-scroll instructions are hidden. |
| 12 | Presentation wording | Changed in Round B | Removed repeated green All recorded activity subtitles. Clarified Approved as awaiting delivery in Client analytics, while script approval means review complete. Corrected result-count singulars and showed readable trend period endpoints. |
| 13 | Analytics correctness | Changed in Round B | In production counts only the In Production status, including per-client rows. Requests use their submission timestamp within the chosen range, bounded by the current time; future records are excluded. Last N days starts at local midnight N−1 days ago. Seeded-data boundaries no longer control the endpoint. Round A's approved-without-revision calculation is retained. |

The queue is a read-only projection of existing collections. No queue collection,
notification collection or other source of truth is persisted. Client Review
means waiting on the client; their approval or revision request creates the
appropriate Admin action.

## Verification

Run `node qa/run-all.cjs` from the repository root. The runner includes all 17
previous maintained checks plus `round-b.cjs`. Final results are recorded in
`stabilization-results.json`, individual suite JSON files and
`stabilization-logs/`.

Round B's dedicated browser suite checks queue/badge derivation, zero state,
request defaults, inline validation and success, asset uniqueness/categories/
sizes, script visibility, deadline links, desktop tables, 375/390px cards and
analytics date boundaries with a frozen clock. It includes 31 accessibility scans.

Existing QA assertions were updated only where the requested behavior changed:
Start review naming; all-status selection in the generic sort probe; selected
script's actual related video after review-first ordering; mobile cards replacing
horizontal scrolling; one asset list replacing duplicate grids. Historical
completion-duration verification now explicitly selects All time.

Screenshots are retained locally under `qa/screenshots/round-b-*.png`. Desktop
and mobile screenshots were visually inspected as well as checked for overflow
and actionable controls. Automated browser coverage uses Chromium, not physical
devices or a cross-browser matrix.

## Remaining issues and final polish boundaries

No additional round was started. No known unfinished item within these 13 remains.
The final polish review may still include human review on physical devices and
other target browsers; those have not been verified here. Existing mock-only
storage, media and same-record conflict behavior remain outside this UX round.
No separate final-polish audit checklist was supplied; no further audit findings
are inferred or claimed closed beyond these 13 items.

## Final QA result

All 18 maintained suites passed on 2026-09-21T16:36:30.149Z. The dedicated Round B suite passed all checks, with 31 accessibility scans, zero violations and zero console/page errors. The full runner exited 0. `git diff --check` passed.

| Suite | Result |
|---|---|
| `qa/static_check.py` | Passed |
| `qa/studio-v1.cjs` | Passed |
| `qa/studio-workflow.cjs` | Passed |
| `qa/studio-workflow-probe.cjs` | Passed |
| `qa/studio-workflow-sweep.cjs` | Passed |
| `qa/studio-admin-sections.cjs` | Passed |
| `qa/studio-client.cjs` | Passed |
| `qa/studio-stability.cjs` | Passed |
| `qa/round-b.cjs` | Passed |
| `qa/functional.cjs` | Passed |
| `qa/accessibility.cjs` | Passed |
| `qa/refinement-check.cjs` | Passed |
| `qa/final_browser.cjs` | Passed |
| `qa/render.cjs` | Passed |
| `qa/refinement-render.cjs` | Passed |
| `qa/visual-sheets.cjs` | Passed |
| `qa/compare.cjs` | Passed |
| `qa/performance.cjs` | Passed |

## Files changed

Application files (8):

- `site/admin.html`
- `site/css/workflow.css`
- `site/js/admin-sections.js`
- `site/js/admin.js`
- `site/js/client-portal.js`
- `site/js/mock-service.js`
- `site/js/workflow.js`
- `site/studio.html`

QA scripts, documentation and regenerated evidence:

- `qa/README.md`
- `docs/audits/ROUND-B-AUDIT.md`
- `qa/compare.cjs`
- `qa/functional-results.json`
- `qa/functional.cjs`
- `qa/performance-results.json`
- `qa/round-b-results.json`
- `qa/round-b.cjs`
- `qa/run-all.cjs`
- `qa/stabilization-logs/functional.cjs.log`
- `qa/stabilization-logs/performance.cjs.log`
- `qa/stabilization-logs/round-b.cjs.log`
- `qa/stabilization-logs/studio-stability.cjs.log`
- `qa/stabilization-logs/studio-workflow-sweep.cjs.log`
- `qa/stabilization-results.json`
- `qa/studio-client.cjs`
- `qa/studio-stability-results.json`
- `qa/studio-stability.cjs`
- `qa/studio-workflow-probe.cjs`
- `qa/studio-workflow-sweep-results.json`
- `qa/studio-workflow.cjs`
