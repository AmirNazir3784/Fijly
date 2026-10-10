# FIJLY — Hostinger upload

Upload **the contents of `site/`**, including the hidden `.htaccess` file, into the domain's `public_html/` directory. `index.html` must be directly inside `public_html`, with `css/`, `js/`, and `assets/` alongside it. No installation, build, npm, or server application is required.

Only the contents of `site/` are deployed. Keep `qa/`, `docs/`, `scripts/`, `supabase/` and the root `README.md` outside the web root.

## Owner checks before public launch

- The source supplied `fijly.com` and `hello@fijly.com`; ownership and mailbox availability have not been confirmed. If the purchased domain differs, update the canonical URL, `og:url`, and `og:image` in `site/index.html`, plus the URLs in `site/robots.txt` and `site/sitemap.xml`. Confirm or replace the marketing email links.
- **Privacy and Terms are live** (no longer placeholders). Both pages are indexable and listed in `sitemap.xml`. They commit FIJLY to specific practices (12-month retention of contact submissions, portal data kept for the service agreement plus 90 days, a 30-day response to data requests, a liability cap), so confirm these match how the business actually operates.
- The portals (`studio.html`, `admin.html`) require sign-in through `login.html` (Supabase Auth). Admins go to the Admin portal, clients to the Client portal. Both portals read and write the Supabase database. A client account must be linked to its workspace (`profiles.client_id`); without one the Client portal shows a "workspace is being set up" message. Asset files are uploaded to the private Supabase Storage bucket `client-assets` (one folder per client, 50MB limit, downloads through one-hour signed links). Video draft versions still store file names only. Search, notification, date-selection, storyboard-editing, and logo-change controls remain unavailable.
- **Enable leaked password protection in Supabase** (Dashboard → Authentication → Settings). The Supabase security advisor reports it as disabled; it rejects passwords known from data breaches.
- **Enable public sign-up in Supabase before launch** (Authentication → Sign In / Providers → "Allow new users to sign up" on). The Create account tab on `login.html` creates the customer's account, and `order.html` requires one. While sign-up stays off, every sign-up is saved as an account request instead (see "Sign-up and orders") and the customer can't reach the order page until you create their account. The `handle_new_user` trigger now always creates `client` profiles, so open sign-up can't create admins. New accounts have no workspace until you link one; the Client portal shows "workspace being set up" meanwhile.
- Portfolio stills, product brands, results, and the testimonial are explicitly marked as sample/concept content. Supply approved films and verified client evidence before representing these as real engagements. Prices and existing sample metrics have been preserved.
- Unavailable About, Careers, LinkedIn, X / Twitter, and YouTube links have been removed. Add social links only when real URLs are supplied.
- The OG image is included at `assets/images/og-image.png` (1200 × 630), derived from the existing homepage; no replacement is required unless the owner prefers another image.

## Deploying with Git (Hostinger)

The repository is not the website: the live site is only the contents of
`site/`. A GitHub Actions workflow keeps a separate **`deploy`** branch whose
root *is* the website root, so Hostinger can pull it straight into
`public_html` without the `qa/`, `docs/` or `supabase/` folders coming with it.

**How it runs.** Every push to `main` that touches `site/**` runs
`.github/workflows/deploy.yml`, which does a `git subtree split --prefix site`
and force-pushes the result to `deploy`. Pushes that only change `qa/`, `docs/`
or the README do not rebuild it. The branch is rewritten each time, so never
commit to `deploy` by hand — anything added there is lost on the next run.

**One-time Hostinger setup**

1. **Activate SSL first.** `.htaccess` forces HTTPS, so deploying before the
   certificate is live redirects every visitor to an address that does not work
   yet. See "Hosting checks" below.
2. **Empty `public_html`.** Hostinger refuses to attach a repository to a
   directory that already has files in it.
3. hPanel → **Advanced → Git** → Create a new repository:
   - Repository: `https://github.com/AmirNazir3784/Fijly.git`
     (private repo: use `git@github.com:AmirNazir3784/Fijly.git` and add the
     deploy key Hostinger shows you to GitHub → Settings → Deploy keys)
   - Branch: `deploy`
   - Directory: leave **empty** — that means `public_html`
4. Click **Deploy** once to pull the current `deploy` branch.

**Automatic deploys.** In the same Git panel, turn on **Auto Deployment** and
copy the webhook URL it gives you into GitHub → Settings → Webhooks → Add
webhook (content type `application/json`, "Just the push event"). After that a
push to `main` rebuilds `deploy` and Hostinger pulls it on its own.

**Redeploying by hand.** GitHub → Actions → "Publish site to deploy branch" →
**Run workflow** (it also accepts `workflow_dispatch`). Then hit **Deploy** in
hPanel if the webhook is not set up.

**Checking what shipped.** The `deploy` branch root should look exactly like
the website root: `index.html`, `.htaccess`, `robots.txt`, `sitemap.xml`,
`assets/`, `css/`, `js/`. If `site/` appears as a folder on `deploy`, the
subtree split did not run and Hostinger is serving the wrong level.

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

## Sign-up and orders

**The flow:** every "Start Your Video" button leads to `login.html?mode=signup`, and each pricing card adds the length it offers (`&duration=60`). `login.html` is the one account page: a **Sign in** tab and a **Create account** tab (name, work email and password, or Google), with `?mode=signup` opening the second one and tab switches rewriting `?mode=` through `history.replaceState`. With an account, the customer continues to `order.html` — which pre-selects the length carried in `?duration=` — then video type, company and brief, and a review step that shows the price. "Submit brief" saves the order to the `orders` table with status `pending`. Payment isn't connected; the Pay button is a disabled placeholder. Signed-out visitors to `order.html` are sent to `login.html?mode=signup&next=order.html` and come straight back after signing in.

The homepage's `#contact` section is now a CTA band ("Ready to make your product video?") rather than a form, so old links and bookmarks to `#contact` still land somewhere sensible.

**Email confirmation is on**, so a new customer first gets a confirmation email; its link signs them in and opens `order.html`. Add `https://fijly.com/order.html` to Supabase → Authentication → URL Configuration → Redirect URLs (and set the Site URL to `https://fijly.com`), or the link will land on the Site URL instead.

**While sign-up is disabled:** the form saves an **account request** to `contact_submissions` (project type "Account request", the chosen length if any, never the password) and tells the customer you'll email their login within 24 hours. These requests aren't shown in the Admin portal: check Supabase → Table Editor → `contact_submissions`. Create the account (Authentication → Add user), their client workspace (Admin → Clients), link the two (`profiles.client_id`), and email the login; they can then sign in and order.

**Processing an order:** open Admin → Orders. If the customer has no workspace yet, create one in Admin → Clients and link it to their account (`profiles.client_id`). Move the order to Processing, then Completed. The database rejects any order whose price doesn't match its length (`check_order_price`).

- Sign-up and orders have honeypots and field-length limits but **no CAPTCHA or rate limit**; with open sign-up, consider Supabase Auth's CAPTCHA (Authentication → Attack Protection) and watch for spam accounts and orders.
- General questions now go to email: the homepage CTA links to hello@fijly.com.

## Supabase redirect URLs

Supabase only honours a `redirectTo` that is on the allow-list, so every page an
auth email or OAuth flow can return to has to be listed in **Supabase →
Authentication → URL Configuration → Redirect URLs**. Site URL: `https://fijly.com`.

| URL | Used by |
|---|---|
| `https://fijly.com/order.html` | Sign-up confirmation email, and Google sign-in from the landing page |
| `https://fijly.com/reset-password.html` | "Forgot password?" recovery email from `login.html` |
| `https://fijly.com/login.html` | Google sign-in from the sign-in page |

Add the local equivalents too, so the same flows can be tested before deploying:

```
http://localhost:8000/order.html
http://localhost:8000/reset-password.html
http://localhost:8000/login.html
```

Use whatever port `scripts/serve.sh` / `scripts/serve.bat` prints if you changed
it from 8000. **Until `reset-password.html` is on this list the recovery email
still sends, but its link lands on the Site URL instead of the reset form**, and
the customer cannot set a new password.

## Google sign-in setup

1. Go to Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID (Web application).
2. Authorized redirect URI: `https://eaddovqkarognynnybeh.supabase.co/auth/v1/callback`
3. Copy the Client ID and Client Secret.
4. In the Supabase dashboard → Authentication → Providers → Google → Enable.
5. Paste the Client ID and Secret, and save.
6. Make sure `https://fijly.com/order.html` and `https://fijly.com/login.html` are in Authentication → URL Configuration → Redirect URLs (Google sign-in returns to whichever page it started from).
7. In `site/js/core/config.js`, set `googleSignIn: true` and upload the file.

Until step 7, the "Continue with Google" button on both tabs of `login.html` is disabled with the note "Google sign-in will be available soon. Please use email for now." Google sign-in also needs public sign-up enabled for new customers.

Current interaction evidence: `qa/refinement-check-results.json` and `qa/functional-results.json`. The refinement covers 1440, 1280, 1024, 768, 390, and 375 pixel layouts. Files in `qa/` are not deployment files.
