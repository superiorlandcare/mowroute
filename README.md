# MowRoute

Mobile-first route + billing tool for a small landscaping crew. Built on
Next.js (App Router, TypeScript), Tailwind, and Supabase.

The source of truth is [`docs/CLAUDE_CODE_SPEC.md`](docs/CLAUDE_CODE_SPEC.md);
[`docs/MowRoute.jsx`](docs/MowRoute.jsx) is the visual prototype. It is built in
the phases listed in §15 of the spec.

## Status

**Phase 1 — Foundation** (done): database schema + RLS, Supabase auth with
admin/crew role gating, the `/login` screen, and route protection.

**Phase 2 — Setup** (done): the admin `/setup` screen — customers + services
CRUD with geocode-on-save, per-customer service reordering, and crew account
management (create via service-role, deactivate/reactivate). Geocoding only
keeps coordinates from a confident street-address match (Pelias `confidence`
≥ `GEOCODE_CONFIDENCE_THRESHOLD`, an `address`/`venue` layer, and not a
`fallback`); weak/coarse or empty matches save null coords and show the "Not
geocoded" flag, so typo'd addresses don't silently store junk coordinates.
Requires `SUPABASE_SERVICE_ROLE_KEY` (crew creation) and, for geocoding,
`ORS_API_KEY` — saving still works without the ORS key, customers just show a
"Not geocoded" flag.

**Phase 3 — Mow board** (done): the default `/` screen for crew + admin. The
whole route grouped by soft day labels with a single-day focus, a live
scoreboard (done/total, %, "$ booked", turf-stripe bar), tap-to-complete,
skip-with-reason, and undo — each writing the permanent `visits` row with
`performed_by` stamped automatically from the signed-in user. Pending visits are
created lazily for every service *due this cycle*: cadence is computed from each
service's `interval` + `anchor_date` (weekly every cycle, biweekly every other,
monthly/every-other-month on the calendar), anchored to the Monday of the cycle.
Non-weekly services with no anchor are shown every cycle and flagged "cadence not
set" so nothing is silently missed. Customers with a future `hold_until` drop
into an "On hold" tray. Board dollars (the scoreboard "$ booked" and per-service
prices) are admin-only — for crew they're stripped from the payload server-side,
not just hidden.

**Phase 4 — Realtime** (done): the board subscribes to the current cycle's
`visits` over Supabase Realtime, so a complete/skip/undo on one phone shows up on
every other within a moment (spec §6). Each change is used only as a trigger to
re-fetch the board through the server (so the refresh stays dollar-stripped for
crew); a small pulsing dot in the scoreboard header shows the live-connection
status. No schema change — `visits` was already in the `supabase_realtime`
publication from Phase 1. The clock bar, Start→Done timing, crew-note threads,
billing, and route optimization come in later phases.

## Getting started

### 1. Create the Supabase project + run the migration

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), and
   run it. This creates every table, the RLS policies, and the realtime setup.

### 2. Seed the first admin (Katy)

There is no public signup — admins create accounts. To bootstrap the owner:

1. Supabase dashboard → **Authentication → Users → Add user**. Enter Katy's
   email + password and tick **Auto Confirm User**.
2. In the SQL editor, run (swap in her email):

   ```sql
   insert into profiles (id, full_name, role)
   select id, 'Katy', 'admin' from auth.users where email = 'katy@example.com'
   on conflict (id) do update set role = 'admin', full_name = excluded.full_name;
   ```

To test crew role gating, repeat for a second user with `'crew'` instead of
`'admin'`. (The same snippets are included at the bottom of the migration file.)

### 3. Configure environment + run

```bash
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
# (Supabase dashboard → Settings → API)
npm install
npm run dev
```

Open <http://localhost:3000>. You'll be redirected to `/login`. Sign in as Katy
(admin) — you'll see the Setup/Billing links. Sign in as the crew user — those
links are hidden, and visiting `/setup` or `/billing` redirects you back home.

## What to verify before building more

- Unauthenticated requests redirect to `/login`.
- Admin login lands on `/` with Setup + Billing access.
- Crew login lands on `/`; `/setup` and `/billing` redirect to `/` (role gating).
- In the Supabase API docs / SQL editor, a crew token cannot insert or update
  `customers`, `services`, or `invoices` (enforced by RLS, not just the UI).

## Project layout

| Path | Purpose |
|---|---|
| `supabase/migrations/0001_init.sql` | Schema (§4) + RLS (§5) + realtime (§6) — paste into Supabase. |
| `lib/supabase/{client,server,admin}.ts` | Browser / server (RLS) / service-role Supabase clients. |
| `lib/auth.ts` | `getSessionProfile`, `requireUser`, `requireAdmin` — route protection lives here, enforced in each Server Component (no middleware). |
| `lib/geocode.ts` | OpenRouteService address → lat/lng (best-effort, on save). |
| `lib/data/setup.ts` | Server-side fetch of customers + services + profiles. |
| `lib/cycle.ts` | Cadence math: which services are due in the current Monday-anchored cycle (§9). |
| `lib/data/board.ts` | Server-side board load: due services + lazy pending-visit creation + held tray. |
| `app/board-client.tsx` | Mow board UI: scoreboard, day groups, stop cards, skip picker, held tray. |
| `app/board-actions.ts` | Visit mutations (complete/skip/undo) as auth-guarded server actions. |
| `app/login/` | Email + password sign-in. |
| `app/page.tsx` | Authenticated home = the Mow board (loads board data, renders `board-client`). |
| `app/setup/` | Admin Setup: customers + services CRUD, reorder, geocode, crew (`actions.ts` = server actions). |
| `app/billing/` | Admin-only route stub (full screen in Phase 6). |
