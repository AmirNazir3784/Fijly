# FIJLY — Video Production for SaaS

Production website and client/admin portals for FIJLY, a premium video production agency for SaaS companies.

## Project structure

CSS and JS are grouped by the area they serve: `core/` is loaded by everything,
`site/` is the public marketing pages, `portal/` is the signed-in Client and
Admin portals. Every page keeps its URL at the `site/` root, because the
Supabase redirect URLs, `sitemap.xml` and SEO depend on those URLs.

```
site/                      Production files (upload the contents to the web host)
├── *.html                 index, login, order, studio, admin, privacy, terms, 404
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

qa/                        QA test scripts and results
supabase/                  SQL schema and seed data
docs/                      CODE-INVENTORY.md — file, function and CSS class map
```

Pages load `css/core/*` first, then their area's stylesheets; the load order
inside each page is what the cascade depends on, so keep it when editing.

## Tech Stack

Plain HTML + CSS + JavaScript. No build step, no framework, no dependencies.
Fonts are self-hosted. The landing page makes no external calls; the portals and
sign-in page load the pinned Supabase JS SDK from jsDelivr (with subresource integrity)
and authenticate against Supabase. The Admin portal reads and writes the Supabase
database (`js/core/supabase-data.js`); so does the Client portal, scoped to the signed-in
client's workspace (`profiles.client_id`). Starter data: `supabase/seed-data.sql` (run in the Supabase SQL Editor).

## Local Development

```bash
cd site
python -m http.server 8000
# Open http://localhost:8000
```

Or use `serve.bat` (Windows) / `serve.sh` (Mac/Linux).

## Deployment

Upload the **contents** of `site/` to the web root on Hostinger.
See `DEPLOYMENT.md` for detailed instructions.

## Domain

https://fijly.com
