# FIJLY — Hostinger upload

Upload **the contents of `site/`**, including the hidden `.htaccess` file, into the domain's `public_html/` directory. `index.html` must be directly inside `public_html`, with `css/`, `js/`, and `assets/` alongside it. No installation, build, npm, or server application is required.

Only the contents of `site/` are deployed. Keep `qa/`, the root `README.md`, `serve.bat`, `serve.sh`, and this document outside the web root.

## Owner checks before public launch

- The source supplied `fijly.com` and `hello@fijly.com`; ownership and mailbox availability have not been confirmed. If the purchased domain differs, update the canonical URL, `og:url`, and `og:image` in `site/index.html`, plus the URLs in `site/robots.txt` and `site/sitemap.xml`. Confirm or replace the marketing email links.
- **Privacy and Terms are live** (no longer placeholders). Both pages are indexable and listed in `sitemap.xml`. They commit FIJLY to specific practices (12-month retention of contact submissions, portal data kept for the service agreement plus 90 days, a 30-day response to data requests, a liability cap), so confirm these match how the business actually operates.
- The portals (`studio.html`, `admin.html`) require sign-in through `login.html` (Supabase Auth). Admins go to the Admin portal, clients to the Client portal. Both portals read and write the Supabase database. A client account must be linked to its workspace (`profiles.client_id`); without one the Client portal shows a "workspace is being set up" message. Asset files are uploaded to the private Supabase Storage bucket `client-assets` (one folder per client, 50MB limit, downloads through one-hour signed links). Video draft versions still store file names only. Search, notification, date-selection, storyboard-editing, and logo-change controls remain unavailable.
- **Enable leaked password protection in Supabase** (Dashboard → Authentication → Settings). The Supabase security advisor reports it as disabled; it rejects passwords known from data breaches.
- **Disable public sign-ups in Supabase** (Authentication → Sign In / Providers → "Allow new users to sign up" off). As of this change the project still reports sign-ups enabled, so anyone with the public anon key could register; the portals refuse accounts without a `profiles` row, but RLS and any profile-creation trigger must not grant access to such accounts.
- Portfolio stills, product brands, results, and the testimonial are explicitly marked as sample/concept content. Supply approved films and verified client evidence before representing these as real engagements. Prices and existing sample metrics have been preserved.
- Unavailable About, Careers, LinkedIn, X / Twitter, and YouTube links have been removed. Add social links only when real URLs are supplied.
- The OG image is included at `assets/og-image.png` (1200 × 630), derived from the existing homepage; no replacement is required unless the owner prefers another image.

## Hosting checks

**The HTTPS redirect is now in `.htaccess`.** Activate the domain's SSL certificate in Hostinger *before* uploading `.htaccess`; otherwise every visit is redirected to an HTTPS address that doesn't work yet. Hostinger's own "Force HTTPS" setting is not needed as well.

After upload, check the homepage, `login.html`, `studio.html#settings`, both legal pages, and an unknown URL. The unknown URL should return HTTP 404 and show the custom page. Confirm `http://` addresses redirect to `https://`.

`.htaccess` supplies the HTTPS redirect, HSTS (one year, including subdomains), a custom 404, compression, cache lifetimes (CSS/JS/images 7 days, fonts and favicon 30 days), and basic security headers. HSTS makes browsers refuse plain HTTP for a year, and `includeSubDomains` applies that to every subdomain of the domain, so make sure any subdomain in use also has SSL. Because CSS and JS are cached for 7 days without versioned file names, returning visitors may see old files for up to a week after an update; rename or add a query string to changed files if that matters. Verify the Apache behavior on Hostinger; the local test server serves static files and does not interpret `.htaccess`.

## Verification evidence

- `qa/render-results.json`: marketing and all eight Studio screens at 1440, 1024, 768, 375 and 390 pixels.
- `qa/content-comparison.json`: retained component layout and headings for all seven Client Portal screens.
- `qa/functional-results.json`: navigation, keyboard, focus, filters, switches, preview, FAQ, table scrolling, link and direct-file checks.
- `qa/accessibility-results.json`: automated desktop accessibility checks plus practical keyboard checks in the interaction suite.
- `qa/final-browser-results.json`: final desktop/mobile accessibility scans for all pages, including the open sidebar, and additional public navigation checks.
- `qa/static-results.json`: HTML parsing, IDs, ARIA references, local assets/links, and forbidden runtime/template syntax.
- Screenshots are regenerated into `qa/screenshots/` and `qa/refinement-after/` on each QA run; they are not kept in the repository.

Browser tests use locally available Playwright tooling solely for QA; it is not a website dependency.

## Orders

`order.html` (linked from "Start Your Video" and each pricing card) saves orders to the Supabase `orders` table: name, email, company, video type, length, price and brief, with status `pending`. Payment isn't connected; the Pay button is a disabled placeholder.

**Processing an order (manual for now):** open Admin → Orders, then create the customer's account (Supabase → Authentication → Add user), their client workspace (Admin → Clients) and link the two (`profiles.client_id`), email their login, and move the order to Processing, then Completed. The customer's password from the order form is never saved; they get the login you send them.

- **Check the price before invoicing.** The price is sent by the browser, so the Orders screen flags any order whose price doesn't match its length ("Check price"). A database check that ties `price` to `duration` would block tampered orders outright.
- **Before ever enabling public sign-up:** the `handle_new_user` trigger copies `role` from sign-up metadata, so a visitor could register as an admin. Make it always create `client` profiles first. The order form can then create logins itself by setting `window.FIJLY_SELF_SIGNUP = true` (see `site/js/order.js`).
- Orders have the same honeypot as the contact form and no CAPTCHA; watch for spam.

## Contact form configuration

The homepage form saves briefs to the Supabase table `contact_submissions` (anonymous insert only; only admins can read them in Supabase → Table Editor). `site/js/config.js` holds the Supabase URL, the public anon key and `contactEmail`. If saving fails, the SDK can't load, or the Supabase settings are removed from `config.js`, the form keeps the brief and offers a prefilled email draft to `contactEmail` instead. Requests time out after 15 seconds.

**Spam:** the form has a hidden honeypot field (bots that fill it see a success message and nothing is saved) and the database enforces field-length limits, but there is **no CAPTCHA or rate limit**. Check `contact_submissions` regularly for spam; if it becomes a problem, add a CAPTCHA or move the insert behind a rate-limited Edge Function. New submissions don't send notifications, so someone needs to check the table.

Current interaction evidence: `qa/refinement-check-results.json` and `qa/functional-results.json`. The refinement covers 1440, 1280, 1024, 768, 390, and 375 pixel layouts. Files in `qa/` are not deployment files.
