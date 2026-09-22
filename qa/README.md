# FIJLY frontend QA

Run from the repository root:

```powershell
node qa/run-all.cjs
```

The runner starts a local static file server on port 8766, or uses the existing
server there. It executes all 19 maintained checks, writes per-suite logs to
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

## Maintained checks

- Seven Studio suites: `studio-v1`, `studio-client`, `studio-admin-sections`,
  `studio-workflow`, `studio-workflow-probe`, `studio-workflow-sweep`,
  `studio-stability`.
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
