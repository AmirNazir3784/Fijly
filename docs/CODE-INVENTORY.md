# FIJLY code inventory

A map of everything in `site/`, written before the cleanup and restructure so
each removal can be justified and reversed. Three commits follow it:

1. `docs: code inventory before cleanup` — this file, no code changes.
2. `Cleanup: remove unused functions, CSS and stale comments`.
3. `Restructure: group assets, CSS and JS by area`.

Method: every claim below was checked by grep across **all** of `site/*.html`
and `site/js/*.js`, counting dynamic construction (`'prefix-' + value`),
`classList` calls, template literals and window globals — not just literal
`class="..."` attributes. Where a first pass looked wrong it is called out.

---

## 1. Files in `site/`

### Pages (stay at the site root — Supabase redirect URLs, sitemap and SEO depend on these URLs)

| File | Purpose | Used |
|---|---|---|
| `index.html` | Marketing homepage, sign-up form (`#contact`), video gallery | yes |
| `login.html` | Sign-in; one inline `<script>` calling `signIn()` | yes |
| `order.html` | Project wizard (4 steps + payment). Large inline `<style>` block | yes |
| `studio.html` | Client portal shell and screens | yes |
| `admin.html` | Admin portal shell and screens | yes |
| `privacy.html`, `terms.html` | Legal pages | yes |
| `404.html` | Error page. Uses **root-absolute** paths (`/css/...`) | yes |
| `.htaccess` | Compression, cache headers, MIME types. **No path references** | yes |
| `robots.txt`, `sitemap.xml` | SEO. No asset paths | yes |

### CSS — which pages load it, in load order

| File | Lines | Loaded by | Purpose |
|---|---|---|---|
| `fonts.css` | 91 | all 8 pages (1st) | `@font-face` for JetBrains Mono + Plus Jakarta Sans; 10 `url(../assets/fonts/...)` |
| `variables.css` | 186 | all 8 pages (2nd) | Design tokens |
| `base.css` | 164 | all 8 pages (3rd) | Reset, typography, utilities |
| `components.css` | 767 | index, 404, privacy, terms, studio, admin | Reusable components |
| `marketing.css` | 1800 | index, 404, privacy, terms | Homepage sections |
| `dashboard.css` | 2188 | studio, admin | Portal layout and screens |
| `admin.css` | 784 | studio, admin | Admin composition |
| `workflow.css` | 209 | studio, admin | Shared operational UI |
| `client-portal.css` | 115 | studio only | Client portal composition |
| `studio-polish.css` | 73 | studio, admin (**last**) | Shell polish — merged into `dashboard.css` in commit 2 |

`login.html` and `order.html` load only `fonts.css`, `variables.css` and
`base.css`; the rest of their styling is inline. This matters below.

### JavaScript — which pages load it, in load order

| File | Lines | Loaded by | Purpose |
|---|---|---|---|
| `config.js` | 16 | index, order, studio, admin | `window.FIJLY_CONFIG`: `contactEmail`, `googleSignIn`, `paypalEnabled`, `videoStorage` |
| `supabase-client.js` | 117 | all but 404/privacy/terms | Supabase client, `signIn`, `requireAuth`, `onAuthStateChange` |
| `supabase-data.js` | 1385 | studio, admin | `window.FijlyData` — the whole data layer |
| `video-store.js` | 131 | studio, admin | `window.FijlyVideoStore` — single point for video files; Hostinger stub |
| `portal-auth.js` | 115 | studio, admin | `window.FIJLY_AUTH`, `window.FijlyAuthReady` — auth guard |
| `studio-shell.js` | 163 | studio, admin | Shared nav and responsive sidebar |
| `workflow.js` | 650 | studio, admin | `window.FijlyWorkflow` — milestones, storyboards, video |
| `profile.js` | 152 | studio, admin | Profile dialog |
| `main.js` | 156 | index | Site interactions |
| `hero.js` | 47 | index | Hero motion study |
| `video-gallery.js` | 257 | index | Category gallery |
| `signup.js` | 132 | index | Sign-up form |
| `order.js` | 629 | order | Project wizard; calls `submit_project()` |
| `client-portal.js` | 204 | studio | Client screens |
| `studio.js` | 15 | studio | **Dead — see §2** |
| `admin.js` | 309 | admin | Dashboard + Clients |
| `admin-sections.js` | 872 | admin | Assets, Scripts, Analytics, Settings; `window.FijlyAdminScripts` |
| `admin-orders.js` | 172 | admin | Orders screen (see §4) |
| `admin-payments.js` | 277 | admin | Payments + Pricing |

### Assets

| File | Referenced from | Used |
|---|---|---|
| `assets/favicon.svg` | all 8 pages (icon + apple-touch-icon + inline `<img>` on 404/privacy/terms) | yes |
| `assets/favicon.ico` | all 8 pages | yes |
| `assets/og-image.png` | `index.html` `og:image` + `twitter:image` (absolute `https://fijly.com/...`) | yes |
| `assets/concept-aiflow.svg` | index, studio | yes |
| `assets/concept-clouddesk.svg` | index, studio | yes |
| `assets/concept-finly.svg` | index, studio | yes |
| `assets/concept-taskpilot.svg` | studio | yes |
| `assets/fonts/*.woff2` (10) | `fonts.css` | yes |
| `assets/fonts/*-OFL.txt` (2) | licence files — **keep**, required by the font licence | n/a |

---

## 2. Top-level functions and exported methods

**Result: there are no orphaned top-level JS functions.** Every one of the 190
named top-level functions and function-valued consts has at least one caller,
counting same-file calls, cross-file calls, callers in inline HTML scripts and
calls through window globals.

Window globals, and who reads them:

| Global | Defined in | Read by |
|---|---|---|
| `window.FIJLY_CONFIG` | `config.js` | `signup.js`, `order.js`, `video-store.js` |
| `window.FijlyData` | `supabase-data.js` | `admin*.js`, `client-portal.js`, `workflow.js`, `profile.js` |
| `window.FijlyVideoStore` | `video-store.js` | `workflow.js`, `admin-sections.js` |
| `window.FIJLY_AUTH`, `window.FijlyAuthReady` | `portal-auth.js` | `studio-shell.js`, `client-portal.js`, `admin.js`, `profile.js` |
| `window.FijlyWorkflow` | `workflow.js` | `client-portal.js`, `admin*.js` |
| `window.FijlyAdminScripts` | `admin-sections.js` | `admin.js` |

Cross-file callers worth noting, because a naive same-file grep calls them unused:

- `signIn()` (`supabase-client.js`) — only caller is the inline `<script>` in `login.html`.
- `requireAuth()`, `onAuthStateChange()` (`supabase-client.js`) — only caller is `portal-auth.js`.

### The one dead file: `js/studio.js`

`studio.js` does exactly one thing: it finds
`.toggle-switch input[type="checkbox"]` and mirrors `role="switch"` /
`aria-checked` onto each.

- `.toggle-switch` markup exists **only in `admin.html`** (3 notification toggles in Settings).
- `studio.js` is loaded **only by `studio.html`**.

So its `querySelectorAll` matches nothing and the file is dead on the only page
that loads it. It is removed in commit 2 rather than merged, because merging it
into `client-portal.js` (also studio-only) would keep it equally dead.

**This also means the admin Settings toggles have no `role="switch"` /
`aria-checked` mirroring at all** — an accessibility gap that predates this
cleanup. Removing `studio.js` does not cause it and does not worsen it. Wiring
it into `admin-sections.js` would be a behaviour change, so it is left for the
user to decide (see §4).

### Dead branches

`FijlyData` hardcodes `persistent: true` (`supabase-data.js:899`) and it is the
only data provider, so the `false` side of these three ternaries can never run.
They are leftovers from the retired session mock:

| Location | Dead branch |
|---|---|
| `admin-sections.js:277` | `' in this mock session.'` |
| `admin-sections.js:841` | `'Settings saved for this mock session.'` |
| `admin.js:298` | `' saved in this mock workspace. Changes are shared in this mock session.'` |

`api.capabilities` is likewise always present, so `!api.capabilities ||` in
`admin-sections.js:28` and `workflow.js:108` is always false. **Kept** —
`capabilities` is a live feature-flag table, not mock scaffolding.

No `FijlyMock` / `mock-service.js` references remain in `site/`.

---

## 3. CSS classes

712 classes are defined across `site/css`. 45 of them never appear as a literal
token but **are live**, because they are built by string concatenation:

| Pattern | Built in | Values |
|---|---|---|
| `vgal__poster--*`, `vgal__shot--*` | `video-gallery.js:129,187` | 20 tones each; the CSS defines exactly the 20 tones the gallery data uses — no spares |
| `admin-trend__bar--*`, `admin-trend__key--*` | `admin-sections.js` | `completed`, `revisions` |
| `is-current` | `workflow.js:183` (`'progress-step is-' + step.state`) | `step.state === 'current'` is set in the same function |

Two near-misses a literal grep gets wrong in the other direction:

- `.field-error` (`workflow.css:51`) **is** unused. `order.html` uses
  `order__field-error`, a different class defined in its own inline `<style>`,
  and `order.html` does not load `workflow.css` at all.
- `.table-empty` (`dashboard.css:877`) **is** unused and is distinct from
  `.table-empty-cell` / `.table-empty-state`, which `workflow.js:598` does use.

That leaves **103 unused classes**, listed by file:

**`base.css` (3)** — `text-center`, `text-left`, `text-right`

**`components.css` (21)** — `avatar--amber`, `avatar--blue`, `avatar--dark`,
`avatar--green`, `avatar--ink`, `avatar--lg`, `avatar--red`, `avatar--violet`,
`btn-ghost-light`, `btn-white`, `icon-btn--sm`, `icon-btn__dot`,
`progress-bar__fill--info`, `progress-bar__fill--success`,
`progress-bar__fill--warning`, `stat-card--dark`, `status-pill__dot`,
`swatch-dot`, `swatch-dot--muted`, `swatch-dot--secondary`, `swatch-dot--soft`

Only `avatar--sm` is used (`admin.js:169`). `progress-bar` and
`progress-bar__fill` are used; only the three colour modifiers are not.

**`dashboard.css` (68)** — design-system reference leftovers (swatches, type
specimens, logo variants, team cards, mini-windows) plus unused table/cell
helpers: `assets-grid`, `assets-grid--2`, `btn-dashed`, `cell-progress`,
`cell-progress__value`, `cell-project__name`, `cell-project__sub`, `cell-type`,
`cell-updated`, `cell-video`, `chart-svg`, `chip-group`, `color-field`,
`color-field__chip`, `color-field__hex`, `comment__head`, `conv--aiflow`,
`conv--clouddesk`, `conv--finly`, `conv--taskpilot`, `funnel__donut`,
`list-card__meta`, `list-card__top`, `logo-mark`, `logo-mark--md`,
`logo-mark--sm`, `logo-stage`, `logo-variant`, `logo-variant--light`,
`logo-variants`, `logo-word`, `member`, `member__name`, `member__role`,
`mini-window`, `mini-window__bars`, `mini-window__chart`, `mini-window__dots`,
`request-form`, `request-form__note`, `script-scene--pending`,
`search__shortcut`, `shots`, `sidebar-link--site`, `sidebar-plan`,
`sidebar-plan__text`, `sidebar-plan__title`, `studio-topbar__site`,
`swatch__chip`, `swatch__chip--amber`, `swatch__chip--canvas`,
`swatch__chip--ink`, `swatch__chip--iris`, `swatch__chip--success`,
`swatch__hex`, `swatch__name`, `swatches`, `table-empty`, `team-card`,
`team-grid`, `thumb`, `type-specimen`, `type-specimen__body`,
`type-specimen__cap`, `type-specimen__cap--tight`, `type-specimen__display`,
`type-specimen__mono`, `videos-table`

Notes: `conv--*` would be applied to cloned `.project-card__media` artwork, but
no page or script ever adds them. `script-scene--pending` is never added —
`script-scene`, `script-scene__content`, `__label`, `__text`, `__no` all are.
`sidebar-plan` is not the `--sidebar-plan-*` custom property used in
`login.html` / `order.html`; those are unrelated.

**`admin.css` (3)** — `admin-nav-later`, `admin-nav-pending`, `admin-portal-label`

**`marketing.css` (2)** — `contact-form__plan`, `owner-review`

**`workflow.css` (1)** — `field-error`

**`studio-polish.css` (1)** — `client-switcher`

**Defined in more than one file (4)** — `btn-dark` (`admin.css`,
`components.css`, `dashboard.css`), `status-pill` (same three), `comment__time`
(`admin.css`, `dashboard.css`), `choice-chip` (`components.css`,
`dashboard.css`). Unused in every copy.

### Duplicate selectors at the same media-query level

| File | Selector | Lines |
|---|---|---|
| `admin.css` | `.admin-dialog-head .icon-btn` | 52, 106 |
| `admin.css` | `.admin-dialog-foot` | 65, 107 |
| `admin.css` | `#screen-analytics .table` | 97, 171 — **identical declarations** |
| `admin.css` | `.admin-body .studio-layout .table :is(th, td)` inside `@media (min-width: 601px)` | 328, 661 |
| `components.css` | `.stat-card__delta` | 259, 747 |
| `marketing.css` | `.footer__grid` inside `@media (max-width: 767px)` | 1136, 1377 |
| `dashboard.css` | `.team-grid` | 1460, 1781 — both removed as unused |

### Cascade hazard in the `studio-polish.css` merge

`studio-polish.css` currently loads **after** `admin.css` and `workflow.css`.
Appending it to the end of `dashboard.css` moves it **before** them. Comparing
every rule at equal specificity, exactly one declaration changes outcome:

- `studio-polish.css`: `.studio-body .btn { border-radius: 10px }`
- `admin.css:579`: `.admin-body .btn { border-radius: 9px }`

`admin.html` carries `class="studio-body admin-body"`, so both match at
specificity (0,2,0) and order decides. Today polish wins and admin buttons are
**10px**; after the merge admin.css would win and they would become 9px.

The `9px` declaration is therefore **currently dead**. Commit 2 removes that one
declaration from `admin.css`, which keeps the rendered radius at 10px on both
pages. Everything else in the file either differs in specificity (so order is
irrelevant) or lands in `dashboard.css`, which polish still overrides because it
is appended last. `.admin-body .studio-topbar__title { display: block }` also
duplicates polish's value, so its outcome is unchanged either way; it is left
alone.

---

## 4. Legacy features — flagged, NOT removed. The user decides.

### 4a. Admin "Orders" screen and the `orders` table

- The wizard on `order.html` calls the `submit_project()` RPC. It **never**
  writes to `orders`.
- The only client-side code touching `orders` is `supabase-data.js:315`
  (`select`) and `:318` (`update` — status only). **Nothing inserts.**
- `admin-orders.js` reads that list, shows a pending count badge, and lets an
  admin change an order's status.

So the screen is a read-only viewer over historical orders placed before the
wizard moved to `submit_project()`. It is dormant, not broken: no new rows can
appear, and the screen is harmless while old rows remain.

**Recommendation: keep for now, remove later.** It is the only way to see
pre-wizard orders. Once you have confirmed the `orders` table holds nothing you
still need, deleting `admin-orders.js`, the Orders sidebar entry and screen in
`admin.html`, and `listOrders`/`updateOrder` in `supabase-data.js` is a clean
cut. Deleting it now would hide real historical data, so it stays.

### 4b. `contact_submissions` "account request" fallback

`signup.js:88` inserts into `contact_submissions` with
`project_type: 'Account request'`. It is **not** behind a local flag — it runs
only when Supabase itself answers `signUp()` with `signup_disabled`
(`signup.js:52`).

So while public sign-up is enabled it never runs, and if sign-up is ever turned
off in Supabase it is what stops the form from simply failing.

**Recommendation: keep.** It is a runtime fallback, costs nothing while
sign-up is on, and is on the keep list. Remove it only if you decide sign-up
will never be disabled again.

Related: **`FIJLY_SELF_SIGNUP` does not exist anywhere in the repo.** There is
nothing to keep or remove under that name — the keep-list entry is moot.

### 4c. Client "Video Requests" list vs the new wizard

Not legacy. `studio.html`'s `#screen-requests` reads the same `requests` data
the wizard creates through `submit_project()`, so it is the current history view
for projects the wizard submitted, and `workflow.js` drives both portals from it.

**Recommendation: keep.** It is live, current code.

### 4d. Admin Settings toggles have no `aria-checked` mirroring

Surfaced by §2: the code that was meant to do this (`studio.js`) only ever ran
on `studio.html`, where no toggles exist. The three notification toggles in
`admin.html` Settings are plain checkboxes with no `role="switch"`.

**Recommendation: fix separately.** It is a real accessibility gap, but wiring
it up is a behaviour change and out of scope for a cleanup commit.

---

## 5. Stale comments

| Location | Text |
|---|---|
| `supabase-data.js:5` | "retired session mock." |
| `supabase-data.js:10` | "mock's shapes, the same read helpers and workflow rules," |
| `supabase-data.js:76` | "Formatting (same output as the mock)" |
| `supabase-data.js:414` | "State in the mock's shapes" |
| `supabase-data.js:615` | "Read helpers and workflow rules (ported from the retired session mock)" |
| `supabase-data.js:900` | "Fields the mock offered that the live schema has no column for." |
| `variables.css:138` | "Mock browser window dots" — the `.mini-window__dots` rules it labels are unused and go too |

These describe a mock that no longer exists and date the code to a migration
that is finished. Rewritten in commit 2 to say what the code does now.

Kept deliberately, because they explain live design decisions rather than a dead
one: `admin-orders.js:4`, `client-portal.js:19`, `order.js:22`,
`order.html:700` (manual invoicing), `signup.js:118` (Google sign-in coming
soon).

Already stale and **outside `site/`**: `qa/studio-polish.cjs` lists
`site/js/admin-data.js`, `site/js/contact.js` and `site/js/mock-service.js`,
none of which exist. Noted, not fixed — the QA suites are the user's.

---

## Removed

Commit 2, `Cleanup: remove unused functions, CSS and stale comments`.
Net effect across `site/`: **637 lines deleted, 122 added** — 515 lines net,
plus two files deleted.

### Files deleted

| File | Why |
|---|---|
| `js/studio.js` (15 lines) | Dead — see §2. Its only selector, `.toggle-switch`, exists only on `admin.html`, which never loaded this file. |
| `css/studio-polish.css` (73 lines) | Merged into the end of `css/dashboard.css`; `<link>` tags removed from `studio.html` and `admin.html`. |

### CSS removed

All 103 unused classes from §3 are gone — verified by re-deriving the defined
class set and diffing it against the referenced set:

- defined classes 712 → 609 (exactly the 103 listed, no others)
- classes removed while still referenced: **none**
- remaining defined-but-unreferenced: **45**, exactly the dynamic ones from §3

Lines removed per file: `dashboard.css` 442, `components.css` 119,
`admin.css` 10, `base.css` 3, `marketing.css` 2, `workflow.css` 1 — 577 from
class pruning, before the merges below.

Where an unused class sat inside an `:is(...)` list next to live classes, only
that entry was removed, never the whole rule — e.g.
`:is(.btn-primary, .btn-dark, .btn-success, .btn-danger)` became
`:is(.btn-primary, .btn-success, .btn-danger)`. None of these edits changes the
selector's specificity, because in every case the removed entry was not the most
specific argument. Comments above pruned rules were preserved.

Also removed: `--window-red`, `--window-yellow`, `--window-green` in
`variables.css`. Their only consumer was `.mini-window__dots`, which went with
the design-system leftovers.

### Duplicate selectors merged

| File | Selector | Action |
|---|---|---|
| `admin.css` | `.admin-dialog-head .icon-btn` | `flex: none` folded into the earlier rule |
| `admin.css` | `.admin-dialog-foot` | `flex-wrap`, `align-items`, `background` folded into the earlier rule |
| `admin.css` | `#screen-analytics .table` | Declarations were identical; the stray earlier copy deleted, the one inside the analytics block kept |
| `admin.css` | `.admin-body .studio-layout .table :is(th, td)` | `padding-block: 14px` folded into the existing `@media (min-width: 601px)` rule, after `padding`, so it still wins; the second `@media` block deleted |
| `components.css` | `.stat-card__delta` | The later `color: var(--success-dark)` folded into the first rule, replacing `var(--success)`, which it already overrode |
| `marketing.css` | `.footer__grid` (in `@media (max-width: 767px)`) | The later `repeat(2, minmax(0, 1fr))` / `gap: 24px` folded into the first rule, replacing the values it already overrode |
| `dashboard.css` | `.team-grid` | Both copies removed as unused |

In every merge the later declarations won before and still win, and no rule
between the two copies set those properties on those elements at equal
specificity, so the rendered result is unchanged.

### The `studio-polish.css` cascade fix

As predicted in §3, moving the polish rules before `admin.css` would have let
`.admin-body .btn { border-radius: 9px }` start winning over
`.studio-body .btn { border-radius: 10px }` on `admin.html`.

**`border-radius: 9px` was removed from `.admin-body .btn` in `admin.css`.** It
could never take effect before, and removing it keeps every admin button at the
10px it renders today. `.admin-body .input` keeps its own `border-radius: 9px` —
that one is live and untouched.

### Dead JS branches collapsed

`persistent: true` was the only value `FijlyData` ever exposed, so these three
ternaries always took the same branch. Each is now the plain string, and the
now-unread `persistent` property was removed from the `FijlyData` surface:

| File | Change |
|---|---|
| `admin-sections.js` | delete-confirm text: dropped `' in this mock session.'` |
| `admin-sections.js` | settings status: now always `'Settings saved.'` |
| `admin.js` | client save status: now always `item.name + ' saved.'` |

`api.capabilities` guards were left alone, as §2 said — that is a live
feature-flag table.

### Stale comments rewritten

The six mock references in `supabase-data.js` (header, `Formatting`, `State in
the mock's shapes`, `Read helpers`, the `capabilities` note) now describe what
the code does rather than what it replaced, and `variables.css`'s "Mock browser
window dots" went with its tokens.

**`site/` now contains no occurrence of "mock" or "FijlyMock".**

Comments listed in §5 as deliberate were kept: `admin-orders.js:4`,
`client-portal.js:19`, `order.js:22`, `order.html:700`, `signup.js:118`.

### Not removed

Everything on the keep list, and every legacy feature in §4: `paypalEnabled`
and the disabled PayPal buttons, the `videoStorage` / Hostinger stub,
`googleSignIn` and the Google button, the `contact_submissions` fallback, the
Admin Orders screen and the `orders` table, the client Video Requests list, and
the OFL font licences.

## Moved

Filled in by commit 3.
