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
publication from Phase 1.

**Phase 5 — Timing + notes + clock** (done): the deferred Phase-3 items. A
**clock bar** (clock in → live elapsed → clock out) writes `time_entries` for the
signed-in user; an admin-only, live **"who's on the clock"** panel lists everyone
currently clocked in. **Start→Done timing**: the green Start ▶ sets `started_at`
+ status `in_progress` with a live on-site timer; tapping Done stamps
`completed_at` + `duration_minutes` (Start is optional — a card can still go
straight to Done). **Crew notes**: each stop card shows the standing note
(read-only) plus the customer's `crew_notes` thread and an input to add one,
persisted with author + time and updating live. Attribution stays the signed-in
user (per-login model) — the clock bar is shift time-tracking only, a deliberate
deviation from §8's shared-device "clocked-in mower is the attribution source".
The only schema change is `0002_crew_notes_realtime.sql` (adds `crew_notes` to
the realtime publication); everything else was already in `0001`.

**Phase 6 — Billing** (done): the admin-only `/billing` screen (spec §11). Month
nav (‹ June 2026 ›), a dark header with the month's total billed, cut count,
account count, and an Open vs Paid split, then one card per customer grouped from
that month's **completed** visits — each service a sub-line (`N cuts × $price`
with the individual dates as chips) and a customer monthly total. Each card has
an Open → Invoice sent → Paid control that upserts the `invoices` row
(`status`/`sent_at`/`paid_at`, keyed by customer + `period_month`) and tints the
card; Paid totals move from Open to Paid in the header. Totals are summed from
`price_snapshot` (the value stamped at completion), never live prices, so past
months never drift. Admin-only and money: `requireAdmin` route guard, RLS
backstop, no billing link in the crew nav. No schema change — `invoices` already
existed in `0001`. Route optimization and PWA polish come next.

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
| `supabase/migrations/0002_crew_notes_realtime.sql` | Phase 5: adds `crew_notes` to the realtime publication (run after 0001). |
| `lib/supabase/{client,server,admin}.ts` | Browser / server (RLS) / service-role Supabase clients. |
| `lib/auth.ts` | `getSessionProfile`, `requireUser`, `requireAdmin` — route protection lives here, enforced in each Server Component (no middleware). |
| `lib/geocode.ts` | OpenRouteService address → lat/lng (best-effort, on save). |
| `lib/data/setup.ts` | Server-side fetch of customers + services + profiles. |
| `lib/cycle.ts` | Cadence math: which services are due in the current Monday-anchored cycle (§9). |
| `lib/data/board.ts` | Server-side board load: due services + lazy pending-visit creation + held tray + crew-note threads. |
| `lib/data/clock.ts` | Server-side clock state: the user's open shift + admin "who's on the clock". |
| `app/board-client.tsx` | Mow board UI: scoreboard, day groups, stop cards, skip picker, held tray, clock bar, timers, notes. |
| `app/board-actions.ts` | Auth-guarded server actions: visit complete/skip/undo/start, clock in/out, add crew note. |
| `app/login/` | Email + password sign-in. |
| `app/page.tsx` | Authenticated home = the Mow board (loads board data, renders `board-client`). |
| `app/setup/` | Admin Setup: customers + services CRUD, reorder, geocode, crew (`actions.ts` = server actions). |
| `app/billing/` | Admin-only monthly billing: per-customer totals/dates + Open/Sent/Paid (`actions.ts`, `status-control.tsx`). |
| `lib/data/billing.ts` | Server-side billing aggregation: completed visits by month, summed from `price_snapshot`. |
