# FIJLY frontend QA

Run from the repository root:

```powershell
node qa/run-all.cjs
```

The runner starts a local static file server on port 8766, or uses the existing
server there. It executes all 22 maintained checks, writes per-suite logs to
`qa/stabilization-logs/`, and exits nonzero if any check fails. Screenshots are regenerated
under `qa/screenshots/`, `qa/refinement-after/` and `qa/visual-sheets/` on each
run; they are run artifacts and are not kept in the repository.

Configuration:

- `PLAYWRIGHT_MODULE`: absolute module directory or resolvable module name. An
  explicit invalid setting fails clearly. Without it, the loader tries a local
  `playwright` / `playwright-core` install, then the existing Windows npm cache.
- `QA_PORT`: alternate local static-server port; verified with port 8771.
- `QA_BASE_URL`: base URL for individual HTTP suites against an existing server.
- `studio-v1.cjs` also deliberately exercises `file://` loading.

No dependencies are installed by the runner. Python needs the existing
BeautifulSoup and html5lib packages for static checks. Playwright's Chromium
browser must already be installed.

For the Admin Analytics presentation pass, run `node qa/admin-analytics-visual.cjs`
against the local server. It compares all client/date combinations with the
committed renderer, checks all five widths with axe and keyboard navigation,
and saves screenshots plus `qa/admin-analytics-visual-results.json`.

## Maintained checks

- `milestones`: the milestone workflow (part A), end to end — the four-step
  project wizard on `order.html` (per-step validation, `ensure_client_workspace`,
  uploads to `{client_id}/project-files/`, a price breakdown read from
  `public.pricing`, the two script / voice-over choices), `submit_project`
  (server-side pricing, the project opening as Awaiting Payment, the 15/45/40
  payment rows, one project per double click, the honeypot, a failed save),
  the client portal (stage badge, payments card, deposit banner, the retired
  request form), Admin Payments (Due as the default filter, the stage-aware
  sidebar badge, Mark paid / waived / refunded / Reset to due through
  `admin_set_payment_status`, and the stage moving to Project Submitted), the
  Awaiting deposit group, the admin project detail with signed-URL script and
  voice-over downloads and the manual stage dropdown, the 3×4 pricing grid,
  the included-revision settings, and every screen at 375/768/1280. Writes
  `qa/milestones-results.json`.
- Seven Studio suites: `studio-v1`, `studio-client`, `studio-admin-sections`,
  `studio-workflow`, `studio-workflow-probe`, `studio-workflow-sweep`,
  `studio-stability`.
- `auth`: login page, signed-out redirects, admin/client role routing, real names in the sidebar, sign-out, cross-tab sign-out, missing-profile refusal, blocked-SDK fallback and a public landing page. `runtime.cjs` serves the pinned Supabase SDK from `qa/vendor/` and mocks the Supabase endpoints; every other suite starts signed in as a mock admin whose name matches the mock Settings.
- Supabase in QA: `supabase-emulator.cjs` stands in for the Supabase REST API —
  one in-memory database per launched browser, seeded from
  `fixtures/demo-seed.json` (the demo records of the retired session mock),
  with the live project's column names (unknown columns fail as in PostgREST)
  and an RLS stand-in (admins see everything; a client only its workspace).
  It also serves `/rest/v1/rpc/*` for the four SECURITY DEFINER functions —
  `ensure_client_workspace`, `submit_project`, `admin_set_payment_status` and
  `review_storyboard` — mirroring the SQL: the price is read from
  `public.pricing` server-side, three payment rows are created, and settling a
  milestone advances `requests.stage`. `pricing` is readable by anyone, while
  `requests`, `payments` and `storyboards` are select-only for a client, so a
  direct insert into `requests` fails here exactly as it does live. Roles and
  workspaces are resolved from the `profiles` table, as `get_user_role()` and
  `get_user_client_id()` do, so a workspace created mid-test is picked up.
  By default the Admin portal acts as the admin user and the Client portal as
  the Northbeam client user, so one context can drive both portals against the
  same database; tabs refresh (`FijlyData.load()`) to see each other's writes.
  Older suites' `FijlyMock` refers to `FijlyData` in both portals.
- `orders`: per-video pricing and the landing page sign-up form (validation, sign-up disabled → account request, email confirmation, existing account, signed-in redirect, honeypot, Google once enabled, `login.html?next=order.html`), the signed-in order page shell (redirect when signed out, workspace pre-fill, the four steps, no prices with the video length, the disabled PayPal placeholder, deep links that cannot skip steps, sign out), and the Admin Orders screen for the retired single-payment orders (pending count, price-mismatch flag, filters, detail, status changes, RLS).
- `round-b`: queue/badge counts, triage, submission feedback, assets, script visibility, deadline links, mobile cards and analytics date boundaries.
- `studio-polish`: all portal headers, sidebar footer, logo navigation, profile editing/photo handling, shared references, keyboard focus and accessibility at all five widths; protected-file scope guard.
- `functional`, `accessibility`, `refinement-check`, `final_browser`: current
  Studio and marketing behavior, keyboard interaction and accessibility.
- `static_check.py`: HTML, paths, route hashes, ARIA references, source hygiene
  and forbidden prototype/runtime syntax in `site/`.
- `render`, `refinement-render`, `visual-sheets`: responsive screenshots and
  clipping/overflow checks. Visual sheets consume actual render files locally.
- `compare`: retained FIJLY Client Portal component structure and headings.
- `performance`: three fresh-browser-context loads for each portal, DOM size,
  unchanged-settings rendering cost, JS/CSS sizes and duplicate asset hashes.

Historical evidence in `baseline-client/`, `stabilization-baseline/` and the prior
audits is intentionally retained. The original design prototypes were removed
after the conversion was complete; they remain in git history. Old one-off
production rewrite scripts were removed; they are not QA suites and must not be
re-run against the completed Studio.
