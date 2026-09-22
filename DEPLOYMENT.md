# FIJLY — Hostinger upload

Upload **the contents of `site/`**, including the hidden `.htaccess` file, into the domain's `public_html/` directory. `index.html` must be directly inside `public_html`, with `css/`, `js/`, and `assets/` alongside it. No installation, build, npm, or server application is required.

Only the contents of `site/` are deployed. Keep `qa/`, the root `README.md`, `serve.bat`, `serve.sh`, and this document outside the web root.

## Owner checks before public launch

- The source supplied `fijly.com` and `hello@fijly.com`; ownership and mailbox availability have not been confirmed. If the purchased domain differs, update the canonical URL, `og:url`, and `og:image` in `site/index.html`, plus the URLs in `site/robots.txt` and `site/sitemap.xml`. Confirm or replace the marketing email links.
- Review and replace the clearly marked draft Privacy and Terms notices with approved text reflecting actual business practices. They deliberately remain `noindex, nofollow` and outside the public sitemap until approved.
- The portals (`studio.html`, `admin.html`) require sign-in through `login.html` (Supabase Auth). Admins go to the Admin portal, clients to the Client portal. Both portals read and write the Supabase database. A client account must be linked to its workspace (`profiles.client_id`); without one the Client portal shows a "workspace is being set up" message. Media files are not uploaded (versions and assets store file names only). Search, notification, date-selection, storyboard-editing, and logo-change controls remain unavailable.
- **Disable public sign-ups in Supabase** (Authentication → Sign In / Providers → "Allow new users to sign up" off). As of this change the project still reports sign-ups enabled, so anyone with the public anon key could register; the portals refuse accounts without a `profiles` row, but RLS and any profile-creation trigger must not grant access to such accounts.
- Portfolio stills, product brands, results, and the testimonial are explicitly marked as sample/concept content. Supply approved films and verified client evidence before representing these as real engagements. Prices and existing sample metrics have been preserved.
- Unavailable About, Careers, LinkedIn, X / Twitter, and YouTube links have been removed. Add social links only when real URLs are supplied.
- The OG image is included at `assets/og-image.png` (1200 × 630), derived from the existing homepage; no replacement is required unless the owner prefers another image.

## Hosting checks

Enable the domain's SSL certificate in Hostinger, then check the homepage, `studio.html#settings`, both legal notices, and an unknown URL. The unknown URL should return HTTP 404 and show the custom page. Enable HTTPS enforcement through Hostinger after SSL is active.

The conservative `.htaccess` config supplies a custom 404, optional compression/cache directives, and basic response headers. It contains no routing rewrites. Its Apache behavior must be verified on Hostinger; the local test server serves static files and does not interpret `.htaccess`.

## Verification evidence

- `qa/render-results.json`: marketing and all eight Studio screens at 1440, 1024, 768, 375 and 390 pixels.
- `qa/content-comparison.json`: retained component layout and headings for all seven Client Portal screens.
- `qa/functional-results.json`: navigation, keyboard, focus, filters, switches, preview, FAQ, table scrolling, link and direct-file checks.
- `qa/accessibility-results.json`: automated desktop accessibility checks plus practical keyboard checks in the interaction suite.
- `qa/final-browser-results.json`: final desktop/mobile accessibility scans for all pages, including the open sidebar, and additional public navigation checks.
- `qa/static-results.json`: HTML parsing, IDs, ARIA references, local assets/links, and forbidden runtime/template syntax.
- Screenshots are regenerated into `qa/screenshots/` and `qa/refinement-after/` on each QA run; they are not kept in the repository.

Browser tests use locally available Playwright tooling solely for QA; it is not a website dependency.

## Contact form configuration

`site/js/config.js` is the single configuration point for `contactEndpoint` and `contactEmail`. With an empty endpoint, the form validates and prepares a prefilled email link. It explicitly says the brief has **not** been sent. The visitor reviews and sends the draft in their email app. No form data is saved or sent to a server by this fallback.

To enable direct submission, provide an HTTPS endpoint accepting `multipart/form-data` with `name`, `email`, `company`, `project_type`, `message`, and `plan`. It must return a successful HTTP status only after accepting the enquiry. JSON responses containing `success: false`, `error`, or `errors` are treated as failures. Failures preserve the brief and offer email fallback; requests time out after 15 seconds. The endpoint must handle server validation, spam protection, CORS when needed, and delivery. Never put private credentials in the public config. Update the Privacy notice to match the chosen provider before enabling it.

Current interaction evidence: `qa/refinement-check-results.json` and `qa/functional-results.json`. The refinement covers 1440, 1280, 1024, 768, 390, and 375 pixel layouts. Files in `qa/` are not deployment files.
