# FIJLY Studio V1 — stabilization, September 21, 2026

This is a QA and stabilization pass, not a frontend freeze or production-readiness
declaration. The approved Client/Admin screens and workflow remain intact. No
backend, database, authentication, billing, account management or app API was added.

## Reconciled baseline

All existing Studio suites were run before changes. The prior audit and every QA
script were inspected. The final maintained command is `node qa/run-all.cjs`;
its machine-readable result is [stabilization-results.json](../../qa/stabilization-results.json).
All 17 maintained checks passed in the final complete run. A separate four-suite
regression pass also passed after the final mobile table/filter adjustments,
recorded in `stabilization-logs/post-visual-*.log` and the aggregate result's
`postVisualVerification` field. The final checks reported zero console/page
errors, zero missing resources and zero axe violations in the tested scope.

Legacy assertions were reconciled to intentional product changes:

- Team is not an active route. Navigation/history checks use the seven current
  Client screens; invalid routes still exercise the fallback.
- Projects now include pending requests, real status filters and search empty
  states; decorative progress bars are no longer test expectations.
- Requests submit to shared mock state; the old non-submission notice assertion
  was replaced with validation and actual mock-submission checks.
- Client Analytics no longer has the old performance table. Keyboard horizontal
  scrolling is checked on the existing Projects table.
- The marketing hero is `.hero-showcase`; the former marquee is gone. Tests now
  cover the approved motion study, reduced motion and current contact address.
- Desktop menu-resize assertions wait for the media-query change callback rather
  than racing it. Production focus behavior remains tested.
- Static fragment validation recognizes both portals' declared hash routes.
- Prototype comparison verifies immutable reference hashes and retained
  components instead of trying to launch the retired hidden prototype runtime.
- Render utilities consume existing local image evidence, never a separate
  hard-coded server. QA no longer rewrites the production Open Graph image.
- Accessibility/render tools now fail their process when findings exist instead
  of merely printing a report and exiting successfully.
- The stability suite distinguishes navigation-cancelled lazy images from failed
  assets and directly checks every cancelled URL still returns successfully.

## Production defects corrected

- Empty client sets now show a clear empty workspace on every Client screen;
  adding the first client restores the screens without a reload. Adding an asset
  without a client gives a clear message.
- Session repair retains valid work, normalizes absent optional fields/file
  metadata, and excludes orphaned relationships, duplicated IDs/versions and
  scripts with mismatched client/video ownership.
- Invalid calendar dates, unsafe/incomplete reference URLs, invalid contact and
  studio emails, invalid lengths and fractional turnaround values are rejected.
  Terminal workflow transitions remain guarded.
- Independent simultaneous tab edits no longer overwrite an entire other tab's
  snapshot. Per-record clocks merge changes with deterministic tie-breaking;
  deletion tombstones prevent deleted assets from reappearing.
- Client filter options refresh when clients are added or renamed. Open client
  profiles derive asset counts from the actual collection and update live.
- A removed asset closes an editor in another tab. Workflow errors appear in the
  foreground dialog. Repeated submit events cannot save a closed editor twice.
- Closing a re-rendered or nested dialog restores visible keyboard focus;
  changing routes closes open dialogs.
- Admin activity is derived from video history, not a second static fixture.
  Production durations use recorded completion dates, not arbitrary last
  activity. Paused clients are not counted as active. Trend buckets include full
  days and advance to the latest recorded work.
- Mobile Assets/Analytics tables retain readable column widths inside their
  keyboard-accessible scroll containers. Filters wrap into usable widths.
  Script revision controls wrap without clipping; long dialog text wraps safely.
- The marketing showcase caption now meets contrast requirements. Decorative SVG
  labeling, font URL entities and inline noscript styling are cleaned up.

## Verification scope

Both portals: all 15 routes at 1440, 1024, 768, 390 and 320px, plus legacy 375px
checks. Functional coverage includes request → production → version → review →
multiple revision rounds → approval → completion; append-only history; reload;
cross-tab synchronization; six-client isolation; cancelled dialogs; repeated
submission; invalid/terminal transitions; empty searches; missing metadata; long
text; and independent empty client/video/request/asset scenarios.

Reports include axe scans across active screens and important dialogs, console
and page errors, failed resources, reference preservation, overflow and readable
table row checks. Desktop/mobile screenshots were visually reviewed as well as
checked programmatically. See [studio-stability-results.json](../../qa/studio-stability-results.json)
and the other per-suite `qa/*-results.json` files.

## Optimization and cleanup

- The same approved Plus Jakarta Sans and JetBrains Mono fonts are served locally
  as variable WOFF2 subsets with OFL licenses. There is no runtime external-font
  request, avoiding the baseline DNS failures and font-load timeouts.
- Unchanged settings saves return without persistence, notifications or
  broadcasts. Ten such saves now produce zero DOM mutations, compared with
  1,350 Client / 900 Admin mutations in the baseline.
- Subscribers use changed-collection information to avoid unrelated screen
  renders. Client collection reads avoid repeated whole-array ID lookups.
- Dashboard projections are reused within a render. Shared completion-date logic
  avoids differing Admin/Client calculations.
- Preview timers run only during playback and stop on navigation/page hiding.
  Subscriptions return an unsubscribe function. No repeated page listener setup
  was introduced.
- Obsolete fixture asset counters, the static Admin activity fixture and unused
  marquee event code were removed.
- A shared Playwright loader replaces all machine-specific module paths.
- Removed obsolete one-off rewrite scripts: `cleanup.py`, `finish_static.py`,
  `refine.py`, `refine-final.py`, `refine-studio.py`, and this pass's temporary
  migration script. Historical QA evidence and reference files were preserved.

Detailed measurements, asset sizes and duplicate hashes are in
[performance-results.json](../../qa/performance-results.json); the original measurements
remain in `stabilization-baseline/performance.json`. Local browser timings are
diagnostic and vary with host load; they are not a production SLA.

Final three-sample median loads were 533 ms Client / 497 ms Admin, compared with
2,271 ms / 1,991 ms in the initial local baseline. Initial DOM sizes were 897 /
1,556 nodes. Linked JS/CSS totals were 182,172 / 196,730 bytes (estimated gzip:
46,685 / 49,464 bytes). No duplicate asset files were found. Ten unchanged settings
saves took 0.6 / 0.5 ms and produced zero DOM mutations in both portals.

## Remaining review boundaries

The mock still uses last-writer-wins for competing edits to the *same* record;
independent record edits are merged. Session storage is not durable multi-user
storage and the client facade is not authentication. Older completed fixtures
without completion dates remain explicitly undated. Files are metadata-only.

Automated browser verification uses Chromium with responsive viewports; final
human UX/polish review, including target physical devices, remains appropriate.
No unexplained failing Studio check remains in the verified scope.
This pass does not freeze the frontend or its data contract.
