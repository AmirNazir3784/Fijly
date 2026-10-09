# Supabase

## `seed-data.sql`

Starter data for a fresh project: a demo client workspace with projects,
scripts, storyboards, assets and payments, so both portals have something to
render before real work exists. Run it in the Supabase **SQL Editor**. It is
seed data only — it does not create or alter tables.

## The live schema is not in this folder

There are no migration files here. The production schema was built and changed
directly through the Supabase SQL editor, so this repository is **not** a
complete description of the database. Treat the live project as the source of
truth and read the current definitions there before changing anything.

Added or changed that way, and relied on by the site:

**Tables** — `pricing`, `payments`, `storyboards`

**Functions (RPC)**

| Function | Used by |
|---|---|
| `submit_project` | The order wizard (`site/js/site/order.js`). Prices the project server-side from `pricing` and creates its milestone payments. |
| `review_storyboard` | Storyboard approve / request-changes in both portals. |
| `review_video` | Preview and final video approve / request-changes. |
| `admin_set_payment_status` | Admin Payments screen, marking a milestone paid, waived or refunded. |
| `ensure_client_workspace` | Creates the signed-in account's client workspace on first use. |

Row Level Security governs every table; the anon key shipped in
`site/js/core/supabase-client.js` is public by design.

See [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) for project setup, redirect
URLs and the Google sign-in provider.
