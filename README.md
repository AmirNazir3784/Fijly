# FIJLY — Video Production for SaaS

Production website and client/admin portals for FIJLY, a premium video production agency for SaaS companies.

## Structure

- `site/` — Production files (upload contents to web host)
  - `index.html` — Marketing landing page
  - `studio.html` — Client portal (7 screens)
  - `admin.html` — Admin portal (9 screens)
  - `css/` — Stylesheets (design tokens, components, layouts)
  - `js/` — Application logic (portals, workflow, mock data)
  - `assets/` — Images, fonts, icons
- `qa/` — QA test scripts and results

## Tech Stack

Plain HTML + CSS + JavaScript. No build step, no framework, no dependencies.
Fonts are self-hosted. Zero external CDN calls.

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
