# FIJLY — Video Production for SaaS

Production website for FIJLY, a premium video production agency for SaaS companies.

## Structure

- `site/` — Production files (upload contents to web host)
- `qa/` — QA scripts and test evidence
- `*.dc.html` + `support.js` — Original design prototypes (reference only)

## Tech Stack

Plain HTML + CSS + JavaScript. No build step, no framework, no dependencies.

## Studio V1 preview

- `site/studio.html` — existing Client Portal, with seven active screens.
- `site/admin.html` — Admin Portal: Dashboard, Clients, Video Requests, Videos, Revisions, Assets, Analytics and Settings.
- Both use mock data only, sharing one session store, so the client portal and Admin stay in sync across tabs and a reload. There is no backend, authentication, billing, or account creation.
- Audit and verification details: [Studio V1 audit](qa/STUDIO-V1-AUDIT.md).

## Deployment

Upload the **contents** of `site/` to the web root on Hostinger.
The site works by opening `index.html` directly — no server-side processing required.

## Domain

https://fijly.com

## Stabilization QA

Run `node qa/run-all.cjs` to serve and check the frontend locally. See [QA instructions](qa/README.md) and the [stabilization audit](qa/STABILIZATION-AUDIT.md). The frontend is ready for UX/polish review after the checks pass; it is not frozen.
