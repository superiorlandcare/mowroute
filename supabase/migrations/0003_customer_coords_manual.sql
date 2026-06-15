-- MowRoute — location migration: manual coordinate override
--
-- ORS/OSM can't always pin a valid house number (e.g. "586 Mentor Ave,
-- Painesville OH"), so the Phase-2 confidence check flags it "Not geocoded".
-- This flag lets an admin set lat/lng by hand and keep them: when true,
-- geocode-on-save is skipped so a later edit never clobbers the hand-placed pin.
--
-- Safe on live data: additive, idempotent, defaults false (existing rows keep
-- today's geocode-on-save behavior), no RLS change (customers are already
-- admin-write).

alter table customers
  add column if not exists coords_manual boolean not null default false;
