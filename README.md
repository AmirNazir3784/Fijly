# FIJLY — Video Production for SaaS

Production website and client/admin portals for FIJLY, a premium video production agency for SaaS companies.

## Project structure

```
FIJLY/
├── .gitignore
├── README.md               This file
├── .github/
│   └── workflows/          deploy.yml — publishes site/ to the deploy branch
├── docs/
│   ├── DEPLOYMENT.md       Hosting, Supabase setup, redirect URLs, Google sign-in
│   ├── CODE-INVENTORY.md   File, function and CSS class map
│   └── audits/             Historical QA and milestone reports
├── scripts/
│   ├── devserver.py        Local server with clean-URL routing
│   ├── serve.bat           Runs devserver.py (Windows)
│   └── serve.sh            Runs devserver.py (Mac/Linux)
├── qa/                     Test scripts, fixtures, results and qa/README.md
├── site/                   Everything that gets deployed
└── supabase/               seed-data.sql and schema notes
```

Only the contents of `site/` are uploaded to the web host; `docs/`, `scripts/`,
`qa/` and `supabase/` stay out of the web root.

### Inside `site/`

CSS and JS are grouped by the area they serve: `core/` is loaded by everything,
`site/` is the public marketing pages, `portal/` is the signed-in Client and
Admin portals. Every page keeps its URL at the `site/` root, because the
Supabase redirect URLs, `sitemap.xml` and SEO depend on those URLs.

```
site/
├── *.html                 index, login, order, studio, admin, privacy, terms,
│                       reset-password, 404 — served as clean URLs (/login, /signup…)
├── .htaccess              Compression and cache headers
├── robots.txt             Crawler rules
├── sitemap.xml            Page list for search engines
├── assets/
│   ├── fonts/             Self-hosted woff2 subsets and their OFL licences
│   ├── images/            og-image.png and the concept illustrations
│   └── icons/             favicon.svg, favicon.ico
├── css/
│   ├── core/              Loaded by every page: variables, fonts, base, components
│   ├── site/              Marketing pages only
│   └── portal/            Client and Admin portals: dashboard, workflow, client-portal, admin
└── js/
    ├── core/              Config and the Supabase layer: config, supabase-client, supabase-data, video-store
    ├── site/              Public pages: main, hero, video-gallery, signup, order
    └── portal/
        ├── shared/        Used by both portals: portal-auth, studio-shell, workflow, profile
        ├── client/        Client portal: client-portal
        └── admin/         Admin portal: admin, admin-sections, admin-orders, admin-payments
```

Pages load `css/core/*` first, then their area's stylesheets; the load order
inside each page is what the cascade depends on, so keep it when editing.

## Tech Stack

Plain HTML + CSS + JavaScript. No build step, no framework, no dependencies.
Fonts are self-hosted. The landing page makes no external calls; the portals and
account page load the pinned Supabase JS SDK from jsDelivr (with subresource integrity)
and authenticate against Supabase. `/login` is the single account page: sign in
and create account as two tabs, with `/signup` opening the second. The Admin portal reads and writes the Supabase
database (`js/core/supabase-data.js`); so does the Client portal, scoped to the signed-in
client's workspace (`profiles.client_id`). Starter data and schema notes: [supabase/README.md](supabase/README.md).

## Run locally

Run `scripts/serve.bat` (Windows) or `./scripts/serve.sh` (Mac/Linux), then
open http://localhost:8000. Either script works from any directory.

Both scripts run `scripts/devserver.py`, which mimics the `.htaccess` rewrites
so the clean URLs (`/login`, `/signup`, `/order`…) work locally. A plain
`python -m http.server` inside `site/` will serve the files but 404 on those
paths, because it does not read `.htaccess`.

## Deployment

Upload the **contents** of `site/` to the web root on Hostinger.
See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed instructions.

## Domain

https://fijly.com
