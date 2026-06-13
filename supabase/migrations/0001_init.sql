-- MowRoute — Phase 1 Foundation migration
-- Schema (spec §4) + Row-Level Security (spec §5) + Realtime (spec §6).
-- Paste this whole file into the Supabase SQL editor and run it once.
--
-- The central design decision (spec §9): `visits` is BOTH the live route status
-- and the permanent billing ledger. It is never wiped weekly — a completed visit
-- *is* a billing record, and "next cycle" is simply a new set of pending visits.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables (spec §4)
-- ---------------------------------------------------------------------------

-- profiles: extends auth.users with role + display name
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  role text not null default 'crew' check (role in ('admin','crew')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- customers: the account/property (one address, contact, standing notes)
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,                            -- "Jesse Carlson", "Apartments — 251 Walnut"
  address text, city text, state text default 'OH',
  lat double precision, lng double precision,    -- geocoded on save; used by optimizer
  phone text,
  gate_code text,
  notes text,                                    -- standing instructions, admin-maintained
  meet_first boolean not null default false,     -- "text Katy before first cut"
  hold_until date,                               -- don't service until this date
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- services: a recurring service at a customer (a card on the board)
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  service_type text not null default 'Mow',      -- Mow | Ditch cut | Treatment | ...
  price numeric(8,2),                            -- nullable (apartments / contract)
  day text check (day in ('Mon','Tue','Wed','Thu','Fri')),  -- SOFT grouping label
  interval text not null default 'Weekly'
    check (interval in ('Weekly','Biweekly','Monthly','Every other month','Seasonal')),
  anchor_date date,                              -- reference point for biweekly/monthly cadence
  service_minutes int not null default 30,       -- est. time on site; feeds optimizer
  window_start time, window_end time,            -- optional time window
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- visits: operational status AND billing ledger, kept permanently
create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  service_date date not null,                    -- the cycle/day this visit belongs to
  status text not null default 'pending' check (status in ('pending','in_progress','done','skipped')),
  skip_reason text,
  started_at timestamptz,                        -- "Start" tap (arrived)
  completed_at timestamptz,                      -- "Done" tap (end time)
  duration_minutes int,                          -- completed_at − started_at when both exist
  price_snapshot numeric(8,2),                   -- price copied at completion → history never drifts
  service_type_snapshot text,
  performed_by uuid references profiles(id),
  unique (service_id, service_date)
);

-- crew_notes: append-only field log per customer (anyone can add)
create table if not exists crew_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  author_id uuid references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

-- time_entries: clock in/out per mower
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz
);

-- invoices: monthly payment status, one per customer per month
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  period_month date not null,                    -- first day of the billing month
  status text not null default 'open' check (status in ('open','sent','paid')),
  sent_at timestamptz, paid_at timestamptz,
  unique (customer_id, period_month)
);

-- Helpful indexes for the common access patterns
create index if not exists services_customer_idx on services(customer_id);
create index if not exists services_day_idx on services(day);
create index if not exists visits_service_date_idx on visits(service_date);
create index if not exists visits_status_idx on visits(status);
create index if not exists visits_customer_idx on visits(customer_id);
create index if not exists visits_completed_at_idx on visits(completed_at);
create index if not exists crew_notes_customer_idx on crew_notes(customer_id);
create index if not exists time_entries_profile_idx on time_entries(profile_id);

-- Keep customers.updated_at fresh on every update
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_set_updated_at on customers;
create trigger customers_set_updated_at
  before update on customers
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security (spec §5)
-- ---------------------------------------------------------------------------

-- Helper: is the current user an admin? SECURITY DEFINER so it bypasses RLS on
-- profiles (avoids a recursive policy check when reading the role).
create or replace function is_admin() returns boolean
language sql security definer stable
set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

alter table profiles      enable row level security;
alter table customers     enable row level security;
alter table services      enable row level security;
alter table visits        enable row level security;
alter table crew_notes    enable row level security;
alter table time_entries  enable row level security;
alter table invoices      enable row level security;

-- profiles: any auth user can read (needed for attribution names); only admin writes
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select to authenticated using (true);
drop policy if exists profiles_admin_insert on profiles;
create policy profiles_admin_insert on profiles
  for insert to authenticated with check (is_admin());
drop policy if exists profiles_admin_update on profiles;
create policy profiles_admin_update on profiles
  for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists profiles_admin_delete on profiles;
create policy profiles_admin_delete on profiles
  for delete to authenticated using (is_admin());

-- customers: any auth user can read; only admin can insert/update/delete
drop policy if exists customers_select on customers;
create policy customers_select on customers
  for select to authenticated using (true);
drop policy if exists customers_admin_write on customers;
create policy customers_admin_write on customers
  for all to authenticated using (is_admin()) with check (is_admin());

-- services: any auth user can read; only admin can insert/update/delete
drop policy if exists services_select on services;
create policy services_select on services
  for select to authenticated using (true);
drop policy if exists services_admin_write on services;
create policy services_admin_write on services
  for all to authenticated using (is_admin()) with check (is_admin());

-- visits: any auth user can select/insert/update (crew complete/skip/start).
-- Never deleted by crew; only admin may delete.
drop policy if exists visits_select on visits;
create policy visits_select on visits
  for select to authenticated using (true);
drop policy if exists visits_insert on visits;
create policy visits_insert on visits
  for insert to authenticated with check (true);
drop policy if exists visits_update on visits;
create policy visits_update on visits
  for update to authenticated using (true) with check (true);
drop policy if exists visits_admin_delete on visits;
create policy visits_admin_delete on visits
  for delete to authenticated using (is_admin());

-- crew_notes: any auth user can read/insert (as themselves); update/delete by author or admin
drop policy if exists crew_notes_select on crew_notes;
create policy crew_notes_select on crew_notes
  for select to authenticated using (true);
drop policy if exists crew_notes_insert on crew_notes;
create policy crew_notes_insert on crew_notes
  for insert to authenticated with check (author_id = auth.uid());
drop policy if exists crew_notes_modify on crew_notes;
create policy crew_notes_modify on crew_notes
  for update to authenticated
  using (author_id = auth.uid() or is_admin())
  with check (author_id = auth.uid() or is_admin());
drop policy if exists crew_notes_delete on crew_notes;
create policy crew_notes_delete on crew_notes
  for delete to authenticated using (author_id = auth.uid() or is_admin());

-- time_entries: a user reads/writes their own rows; admin reads all
drop policy if exists time_entries_select on time_entries;
create policy time_entries_select on time_entries
  for select to authenticated using (profile_id = auth.uid() or is_admin());
drop policy if exists time_entries_insert on time_entries;
create policy time_entries_insert on time_entries
  for insert to authenticated with check (profile_id = auth.uid());
drop policy if exists time_entries_update on time_entries;
create policy time_entries_update on time_entries
  for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop policy if exists time_entries_delete on time_entries;
create policy time_entries_delete on time_entries
  for delete to authenticated using (profile_id = auth.uid());

-- invoices: any auth user can read; only admin can insert/update (only Katy marks paid)
drop policy if exists invoices_select on invoices;
create policy invoices_select on invoices
  for select to authenticated using (true);
drop policy if exists invoices_admin_insert on invoices;
create policy invoices_admin_insert on invoices
  for insert to authenticated with check (is_admin());
drop policy if exists invoices_admin_update on invoices;
create policy invoices_admin_update on invoices
  for update to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Realtime (spec §6): one live route across phones; live "who's on the clock"
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'visits'
  ) then
    alter publication supabase_realtime add table visits;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'time_entries'
  ) then
    alter publication supabase_realtime add table time_entries;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Seed the first admin (spec §14.3) — run AFTER creating Katy's auth user.
-- ---------------------------------------------------------------------------
-- There is no public signup. To bootstrap:
--   1. Supabase dashboard → Authentication → Users → "Add user"
--      (enter Katy's email + password, tick "Auto Confirm User").
--   2. Run the snippet below, swapping in her email, to give her an admin profile.
--
-- insert into profiles (id, full_name, role)
-- select id, 'Katy', 'admin' from auth.users where email = 'katy@example.com'
-- on conflict (id) do update set role = 'admin', full_name = excluded.full_name;
--
-- For a test crew account, repeat step 1 for a second user, then:
-- insert into profiles (id, full_name, role)
-- select id, 'Test Mower', 'crew' from auth.users where email = 'mower@example.com'
-- on conflict (id) do update set role = 'crew', full_name = excluded.full_name;
