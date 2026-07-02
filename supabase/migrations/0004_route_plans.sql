-- MowRoute — route plans: custom start/end location per planned route date
--
-- Created by the map route builder: one row per specific date (plan_date),
-- storing where that day's route starts and ends. Defaults to the shop, but
-- routes don't always start/end there — Katy can pick any address or drop a
-- pin. The optimizer prefers these coordinates over the DEPOT_LAT/DEPOT_LNG
-- env depot when a plan exists for the day being optimized.
--
-- Safe on live data: additive, idempotent. Reuses set_updated_at() and
-- is_admin() from 0001_init.sql.

create table if not exists route_plans (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null unique,                -- the concrete date the route was built for
  start_lat double precision,
  start_lng double precision,
  start_label text,                              -- "Shop", an address, or "Dropped pin"
  end_lat double precision,
  end_lng double precision,
  end_label text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists route_plans_set_updated_at on route_plans;
create trigger route_plans_set_updated_at
  before update on route_plans
  for each row execute function set_updated_at();

alter table route_plans enable row level security;

-- Any auth user can read (the board/optimizer needs it); only admin writes —
-- route planning is Katy's job, same gating as customers/services.
drop policy if exists route_plans_select on route_plans;
create policy route_plans_select on route_plans
  for select to authenticated using (true);
drop policy if exists route_plans_admin_write on route_plans;
create policy route_plans_admin_write on route_plans
  for all to authenticated using (is_admin()) with check (is_admin());
