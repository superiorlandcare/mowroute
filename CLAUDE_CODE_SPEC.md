# MowRoute — Production Build Spec

A mobile-first route + billing tool for a small landscaping crew, replacing a Google Doc. The prototype (`MowRoute.jsx`) is the canonical reference for layout, interactions, and the data shape — this spec is the production rebuild on a real backend with accounts, history, live sync, billing, and route optimization.

Build it in the phases in §15 — core route first, optimization last.

---

## 1. What it does

- **Katy (admin)** maintains the customer list — address, contact, gate code, standing instructions — and the recurring services at each (mow, ditch cut, treatment), each with its own price and cadence.
- **Mowers (crew)** open the route on a phone, optionally clock in, and work down it: tap a stop **done**, **skip + reason**, or **Start → Done** to capture mow time. Attribution (who/when) is automatic.
- **Everyone** sees one live route that syncs across phones.
- **Every completed cut becomes a permanent billing record.** Katy bills monthly: per customer she sees how many cuts, the total, the individual dates, and marks each invoice **Open → Sent → Paid**.
- The route can be **optimized** into an efficient driving order for free.

Original pain killed: nobody hand-types date lists, nobody verbally reports what got done, and billing falls out of the work automatically.

---

## 2. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router, TypeScript) |
| Styling | Tailwind CSS |
| Icons | lucide-react |
| Backend | Supabase (Postgres + Auth + Realtime + RLS) |
| Hosting | Vercel |
| Data layer | `@supabase/supabase-js` + `@supabase/ssr`; client-side realtime subscriptions |
| Geocoding | OpenRouteService Pelias (free) — address → lat/lng on save |
| Route optimization | OpenRouteService `/optimization` (free, VROOM; handles time windows) |

Mobile-first: phone-width column (`max-w-md mx-auto`), large tap targets, high contrast for sunlight. Ship as an installable PWA.

---

## 3. Roles & auth

Supabase Auth, email + password. Tiny crew, so **admin creates accounts** — no public signup.

- `admin` (Katy / owner): full access incl. Setup and Billing.
- `crew` (mowers): the Mow board only — complete/skip/start/notes and their own clock entries. No editing customers, no billing.

Role lives in `profiles.role` and is enforced by RLS, not just UI.

---

## 4. Data model

The central design decision: **the route status and the billing ledger are the same `visits` table, kept permanently** — not wiped weekly. A completed visit *is* a billing record. "Next week" simply has new pending visits; history accumulates by itself. See §9.

A **customer** is the account/property (one address, contact, standing notes). A **service** is a recurring job at that customer (mow, ditch cut, treatment) with its own price and cadence — this is what shows as a card on the board. One customer can have several services (Jesse Carlson = a mow *and* a monthly ditch cut), and one monthly invoice covers them all.

```sql
-- profiles: extends auth.users
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  role text not null default 'crew' check (role in ('admin','crew')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- customers: the account/property
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,                       -- "Jesse Carlson", "Apartments — 251 Walnut"
  address text, city text, state text default 'OH',
  lat double precision, lng double precision,   -- geocoded on save; used by optimizer
  phone text,
  gate_code text,
  notes text,                               -- standing instructions, admin-maintained
  meet_first boolean not null default false,    -- "text Katy before first cut" (Bill Querry)
  hold_until date,                          -- don't service until this date (Jerry Birk)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- services: a recurring service at a customer (a card on the board)
create table services (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  service_type text not null default 'Mow',  -- Mow | Ditch cut | Treatment | ...
  price numeric(8,2),                        -- nullable (apartments / contract)
  day text check (day in ('Mon','Tue','Wed','Thu','Fri')),  -- SOFT grouping label, NOT a hard schedule
  interval text not null default 'Weekly'
    check (interval in ('Weekly','Biweekly','Monthly','Every other month','Seasonal')),
  anchor_date date,                          -- reference point for biweekly/monthly cadence
  service_minutes int not null default 30,   -- est. time on site; feeds optimizer
  window_start time, window_end time,        -- optional time window (commercial / before noon)
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- visits: operational status AND billing ledger, kept permanently (one per service per cycle date)
create table visits (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  service_date date not null,                -- the cycle/day this visit belongs to
  status text not null default 'pending' check (status in ('pending','in_progress','done','skipped')),
  skip_reason text,
  started_at timestamptz,                    -- "Start" tap (arrived)
  completed_at timestamptz,                  -- "Done" tap (end time)
  duration_minutes int,                      -- completed_at − started_at when both exist
  price_snapshot numeric(8,2),               -- price copied at completion → billing history never drifts
  service_type_snapshot text,
  performed_by uuid references profiles(id),
  unique (service_id, service_date)
);

-- crew_notes: append-only field log per customer (anyone can add)
create table crew_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  author_id uuid references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

-- time_entries: clock in/out per mower
create table time_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz
);

-- invoices: monthly payment status, one per customer per month
create table invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  period_month date not null,                -- first day of the billing month
  status text not null default 'open' check (status in ('open','sent','paid')),
  sent_at timestamptz, paid_at timestamptz,
  unique (customer_id, period_month)
);
```

**Skip reasons** (UI list, stored in `skip_reason`): Locked gate, Dog out, Too wet, Customer asked, Equipment issue, Other.

**Two note types, kept separate:** `customers.notes` = the standing instruction Katy maintains (shows every visit); `crew_notes` = the append-only field log any mower can add to.

---

## 5. Row-level security

Enable RLS on every table. Helper:

```sql
create or replace function is_admin() returns boolean
language sql security definer stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;
```

- `profiles`: any auth user can `select` (needed for attribution names); only `is_admin()` writes.
- `customers`, `services`: any auth user can `select`; only `is_admin()` can `insert/update/delete`.
- `visits`: any auth user can `select`, `insert`, and `update` (crew complete/skip/start). Never deleted by crew.
- `crew_notes`: any auth user can `select`/`insert`; `update/delete` only author or `is_admin()`.
- `time_entries`: a user reads/writes rows where `profile_id = auth.uid()`; admin reads all.
- `invoices`: any auth user can `select`; only `is_admin()` can `insert/update` (only Katy marks paid).

Verify a crew token genuinely cannot edit customers, services, or invoices — that check is in the DoD.

---

## 6. Realtime

Client subscribes to `visits` changes for the current cycle so a completion on one phone appears on all within a moment. This replaces the prototype's shared-storage stand-in. Optionally subscribe to `time_entries` for a live "who's on the clock" admin view.

---

## 7. Screens

| Route | Who | Purpose |
|---|---|---|
| `/login` | all | Email + password sign-in. |
| `/` | all | **Mow board** (default). Whole route, grouped by soft day labels; complete/skip/start/notes/directions. |
| `/setup` | admin | Customers + their services (CRUD, geocode, reorder); crew accounts. |
| `/billing` | admin | Monthly per-customer totals, dates, and Open/Sent/Paid status. |

Unauthenticated → `/login`. Crew → blocked from `/setup` and `/billing`.

---

## 8. Feature detail (mirror the prototype)

**Mow board (`/`)**
- **Whole route by default**, rendered as one list with soft **day-group headers** (Monday with the apartments up top, houses flowing Tue–Thu). Days are a grouping/ordering convenience, not a hard filter — a day chip can *focus* one day, but nothing is hidden by default.
- **Scoreboard**: done/total for the current scope, percent, "$ booked", turf-stripe progress (green done, amber skipped).
- **Clock bar**: pick name → clock in → elapsed timer → clock out. Writes `time_entries`; the clocked-in mower is the attribution source.
- **Stop card** per service, sorted pending → in-progress → skipped → done:
  - Shows customer, service-type badge (non-mow), price, and tags: "Text Katy first" (`meet_first`), cadence (non-weekly), gate code, standing note.
  - Tap body → **done** (writes `visits`: status, `completed_at`, `performed_by`, `price_snapshot`, `service_type_snapshot`; `duration_minutes` if started).
  - Green ▶ **Start** → sets `started_at`, status `in_progress`, card shows a live timer; tapping done then stamps the end time and duration. Start is optional — tapping done directly still works (no duration).
  - Amber **Skip** → reason picker → status `skipped` + `skip_reason` + attribution.
  - **Notes** (count badge) → standing note (read-only) + the `crew_notes` thread + an input to add one.
  - **Directions** → Waze / Google / Apple deep links to the address.
  - Done shows `✓ name · start–end · NN min`; skipped shows `reason · name · time`; both have undo.
- **Held customers** (future `hold_until`) drop into a small "On hold" tray instead of the route.

**Setup (`/setup`, admin)**
- Customers grouped by day; add/edit/delete; drag to set `sort_order`. Form: name, address, city, phone, gate code, standing notes, `meet_first`, `hold_until`. Saving **geocodes** the address (flag failures).
- Per customer, manage **services**: service type, price, day, interval, optional time window.
- Crew accounts: add (server action w/ service-role key), deactivate.

**Billing (`/billing`, admin)** — see §11.

---

## 9. Route vs. ledger (the key architecture)

The board's green check is operational; the billing record is permanent. Both are `visits`, distinguished by lifecycle, not by table:

- A visit is **created pending** for each service due in the current cycle (lazily when the board loads that cycle, or by a small scheduled job). "Due" comes from the service's `interval` + `anchor_date` (weekly = every week; biweekly/monthly = on schedule). Customers with a future `hold_until` are excluded.
- Crew mutate the visit (start/done/skip). On completion it stores `price_snapshot` so later price edits never rewrite past bills.
- **No destructive weekly reset.** Next cycle = a new set of pending visits; completed ones stay as history forever.
- **Billing is just a query**: completed visits (`status='done'`, `completed_at` within the month) joined to customers, summed by customer. That's why monthly billing is clean even though the board looks "fresh" each week.

---

## 10. Route optimization & per-house timing

**Optimization (free, OpenRouteService).** The `/optimization` endpoint (VROOM) does single-vehicle TSP with time windows — free, hosted, no infra. Self-hosting VROOM + OSRM is the scale path only.
1. **Geocode on save** (customer address → `lat`/`lng`). Skip un-geocoded customers and flag them in Setup — expect this to fire often on the real list, since many addresses lack a city.
2. **Optimize button** → server action sends the cycle's pending stops as `jobs` (`location:[lng,lat]`, `service: service_minutes*60`, optional `time_windows`) and one `vehicle` (`start`/`end` = shop, `time_window` = workday) → returns the order → write to `services.sort_order` (or a per-cycle order field) so the board re-sorts.
3. **Manual drag still overrides** the optimizer.
Gotchas: ORS uses **[lng, lat]** (easy to reverse); geocoding must happen on save or the optimizer has nothing.

**Timing.** `started_at` (Start tap) and `completed_at` (Done) give `duration_minutes` per cut. ORS supplies real road times so optimization works day one — timing is for insight (per-house averages, justifying first-cut/overage charges like Al Stevenson's "took two hours"), not a prerequisite.

---

## 11. Billing & invoices

Katy bills monthly. The Billing screen:

- **Month nav** (‹ June 2026 ›).
- **Header**: month total billed, cut count, account count, split into **Open** vs **Paid**.
- **One card per customer** (grouped from completed visits that month):
  - Each service as a sub-line: `N cuts × $price`, with the **individual dates** as chips.
  - Customer monthly total.
  - **Payment status** control: **Open → Invoice sent → Paid**, writing the `invoices` row (`status`, `sent_at`, `paid_at`) keyed by customer + `period_month`. Card tints by status; Paid totals move from Open to Paid in the header.
- Totals come from `price_snapshot` on the visits, never live prices.

Scope note: this is billing *prep + payment tracking*. It is not generating/emailing PDF invoices — that's a later add if wanted.

---

## 12. Design reference

Reuse the prototype's system (Tailwind standard palette):
- Background `stone-100`; cards white / done `green-50`+`green-300` / skipped `amber-50`+`amber-300` / in-progress `green-50`+`green-400`.
- Primary green `green-600`; skip amber `amber-400/500`; directions blue `blue-600`; service badges: Mow green, Ditch cut orange, Treatment violet.
- Dark scoreboard `stone-900`. Display type bold/uppercase/tight; **font-mono for all numbers, money, codes, times, dates**.
- Big rounded tap targets (`rounded-2xl`), phone-width column.

---

## 13. Out of scope (schema-ready, do not build)

- Equipment status board (machine up/down, maintenance).
- Photo proof per visit (needs Supabase Storage).
- Multi-truck / assign stops to a mower (the optimizer's `vehicles` array already supports it; add `assigned_to` on visits).
- Generated/emailed PDF invoices (Billing currently preps + tracks, doesn't send).
- Customer-facing "your lawn's done" notifications (phone is captured for this later).

---

## 14. Setup & env

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # server-only: admin-created crew accounts
ORS_API_KEY=                 # server-only: geocoding + optimization
```

1. Create Supabase project; run schema + RLS migrations.
2. Free OpenRouteService (HeiGIT) API key.
3. Seed Katy as the first `admin` profile; import the customer + service list (geocode on save).
4. Deploy to Vercel; add env vars; connect repo.
5. PWA manifest (name, icons, `display: standalone`, theme color).

---

## 15. Build order

1. **Foundation** — schema, RLS, auth, seed Katy admin. Verify login + role gating.
2. **Setup** — customers + services CRUD, reorder, geocode-on-save with failure flag.
3. **Mow board** — whole-route list with soft day groups, complete + skip + attribution, writing `visits`. (Core value; get this solid before anything fancy.)
4. **Realtime** — two phones stay in sync.
5. **Timing + notes + clock** — Start/Done duration, crew notes, clock in/out.
6. **Billing** — monthly per-customer view + invoice Open/Sent/Paid.
7. **Optimization** — ORS geocode + optimize button. (Last; depends on clean lat/lng.)
8. **PWA polish** — installable, offline-friendly check.

Don't start optimization (7) before the board (3) and clean geocoding (2) are working.

---

## 16. Definition of done

- [ ] Crew logs in, clocks in, works the route from a phone.
- [ ] Tap = done; Start→Done captures `started_at`, `completed_at`, `duration_minutes`; both stamp who.
- [ ] Skip records reason + attribution; undo works.
- [ ] Mower adds a field note to a customer; persists with author + time, visible to all.
- [ ] Two phones: a change on one appears on the other in real time.
- [ ] Admin CRUDs customers + services and creates/deactivates crew.
- [ ] Saving a customer geocodes the address; failures are flagged.
- [ ] Completing a service writes a permanent visit with `price_snapshot`; next cycle starts fresh without erasing history.
- [ ] Billing shows, per customer per month: cut count, dates, total; Open/Sent/Paid status persists; header Open/Paid split is correct.
- [ ] "Optimize route" reorders via ORS, respects time-windowed stops; manual drag overrides.
- [ ] RLS verified: a crew token cannot edit customers/services/invoices.
- [ ] Installable PWA, usable one-handed outdoors.
