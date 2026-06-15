-- MowRoute — Phase 5 migration
-- Live crew notes (spec §6, §8): add `crew_notes` to the Supabase Realtime
-- publication so a field note added on one phone appears on the others.
--
-- This is the ONLY schema change Phase 5 needs. Everything else it uses already
-- exists from the Phase 1 foundation migration (0001_init.sql):
--   • time_entries  table + RLS + realtime publication  (clock in/out)
--   • crew_notes    table + RLS + index                 (field notes)
--   • visits.started_at / completed_at / duration_minutes + 'in_progress'
--     status                                            (Start→Done timing)
--
-- Safe to run on a database that already has live data: it only adds a table to
-- a publication (touches no rows) and is idempotent (guarded below), so re-runs
-- are no-ops.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crew_notes'
  ) then
    alter publication supabase_realtime add table crew_notes;
  end if;
end $$;
