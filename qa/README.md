# FIJLY frontend QA

Run from the repository root:

```powershell
node qa/run-all.cjs
```

The runner starts a local static file server on port 8766, or uses the existing
server there. It executes all 17 maintained checks, writes per-suite logs to
`qa/stabilization-logs/`, and exits nonzero if any check fails. Screenshots stay
under `qa/screenshots/`, `qa/refinement-after/` and `qa/visual-sheets/`.

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
- `functional`, `accessibility`, `refinement-check`, `final_browser`: current
  Studio and marketing behavior, keyboard interaction and accessibility.
- `static_check.py`: HTML, paths, route hashes, ARIA references, source hygiene
  and immutable reference hashes.
- `render`, `refinement-render`, `visual-sheets`: responsive screenshots and
  clipping/overflow checks. Visual sheets consume actual render files locally.
- `compare`: immutable prototype hashes and retained FIJLY component structure.
  The retired `.dc.html` runtime is not a runnable product and its demo text is
  not an assertion about the operational portals.
- `performance`: three fresh-browser-context loads for each portal, DOM size,
  unchanged-settings rendering cost, JS/CSS sizes and duplicate asset hashes.

Historical evidence in `baseline-client/`, `stabilization-baseline/`, the prior
audits and the original design snapshots is intentionally retained. Old one-off
production rewrite scripts were removed; they are not QA suites and must not be
re-run against the completed Studio.
