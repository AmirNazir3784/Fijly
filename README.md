# FIJLY — Video Production for SaaS

Production website and client/admin portals for FIJLY, a premium video production agency for SaaS companies.

## Structure

- `site/` — Production files (upload contents to web host)
  - `index.html` — Marketing landing page
  - `login.html` — Portal sign-in (Supabase Auth)
  - `studio.html` — Client portal (7 screens)
  - `admin.html` — Admin portal (9 screens)
  - `css/` — Stylesheets (design tokens, components, layouts)
  - `js/` — Application logic (portals, workflow, mock data)
  - `assets/` — Images, fonts, icons
- `qa/` — QA test scripts and results

## Tech Stack

Plain HTML + CSS + JavaScript. No build step, no framework, no dependencies.
Fonts are self-hosted. The landing page makes no external calls; the portals and
sign-in page load the pinned Supabase JS SDK from jsDelivr (with subresource integrity)
and authenticate against Supabase. Portal data is still mock data until Part 3.

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
