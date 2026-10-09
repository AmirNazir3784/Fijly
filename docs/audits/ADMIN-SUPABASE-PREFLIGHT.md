# Admin Supabase migration preflight

Inspected 2026-09-22. Migration is blocked pending the intended database schema
and migrated Client Portal source. No application files or database records
were changed during this preflight. Existing uncommitted UI/QA work was retained.

## Observed checkout

- Only the `master` branch is present. Its latest commit is `c4042c9`, the
  authentication foundation.
- Both `site/admin.html` and `site/studio.html` still load `admin-data.js` and
  `mock-service.js`.
- `client-portal.js` uses `FijlyMock.client`. Client submissions, approvals and
  revisions update session mock data, not Supabase.
- The only database query in the frontend is the authentication profile read
  from `profiles` in `supabase-client.js`.
- No SQL schema/migrations or Supabase domain services are present.
- Existing auth tests use intercepted Supabase endpoints. They cannot establish
  that live authentication, RLS or database persistence works.

## Live read-only observations

- The configured project Data API (`GET /rest/v1/`) returned HTTP 401 with
  `Invalid API key` using the configured public anon key. Schema discovery was
  unavailable.
- The Auth settings endpoint returned HTTP 200 and `disable_signup: false`.
  Server-side public signup is therefore not disabled, although the frontend
  has no signup form. No signup request was made.
- The project dashboard redirected to sign-in. No authenticated database
  management session was established.
- The frontend key declares the `anon` role. The source scan found no
  service-role key, `sb_secret_` key or PostgreSQL connection string.
- RLS definitions, grants, constraints, triggers, functions and authenticated
  cross-client isolation remain unverified.

## Existing Admin operations to preserve

| UI owner | Required service operations |
| --- | --- |
| `admin.js` | Dashboard totals/action queue/activity; client list, detail, create and edit |
| `workflow.js` | Requests, production creation, video transitions, appended versions, revision rounds, feedback and history |
| `admin-sections.js` | Asset metadata CRUD, script drafts/scenes/review, analytics and studio/workflow settings |
| `profile.js` | Admin profile reads and saves; shared Client Portal behavior must remain intact |
| `portal-auth.js` | Admin role guard; replace Admin mock identity seeding and initialize real data after auth |

The current controllers expect synchronous mutations. Migration must await
database writes before closing dialogs or reporting success, retain drafts on
errors and prevent duplicate submissions. Multi-record operations (production
creation, revision requests, approval/completion) need the existing database
transaction/function contract and uniqueness rules. They must not be replaced
by unprotected concurrent JSON snapshot writes.

## Inputs needed to proceed

1. Location of the completed Client Portal migration, or confirmation that this
   auth-only checkout is the intended starting point.
2. Existing schema and RLS definitions, including workflow functions/triggers
   and relationship/uniqueness constraints.
3. Working project URL/public publishable or anon key in the local configuration.
4. An authenticated test setup for an admin and two distinct client accounts
   to verify persistence and isolation. No service-role key is needed in the
   frontend or in chat.

No Admin pages or service migrations are claimed complete. Live login, the
client-to-admin workflow, persistence and RLS tests have not passed or failed:
they could not be run against the required foundation.
