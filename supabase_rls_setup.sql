-- ============================================================================
-- Enable Row Level Security on every public table + add ownership-scoped
-- read policies.
--
-- WHY: Supabase gives every project two API keys — anon (public, baked into
-- the browser bundle, anyone can read it from devtools) and service_role
-- (secret, server-only). Without RLS, both keys have full read/write access
-- to every row in every table via the auto-generated REST API, completely
-- bypassing this app's own authorization logic in src/app/api/*.
--
-- SAFE FOR THIS APP: all real traffic goes through Next.js API routes using
-- Prisma, which connects as the `postgres` role (DATABASE_URL/DIRECT_URL).
-- That role has BYPASSRLS = true, so none of this affects the app itself —
-- verified via:
--   select rolname, rolbypassrls from pg_roles where rolname = 'postgres';
-- What changes is direct calls to <project>.supabase.co/rest/v1/<Table>
-- using the anon/authenticated key — those now only see what a policy below
-- explicitly allows (nothing, for most tables — this app was never designed
-- to be queried directly from the browser; see src/lib/supabase/client.ts).
--
-- Run this once in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Idempotent (safe to re-run): everything uses IF NOT EXISTS / OR REPLACE /
-- checks its own existence.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper functions (SECURITY DEFINER — run with elevated privileges, so
--    they can check ownership through AthleteProfile/Cycle/etc. without
--    triggering RLS recursion or needing to grant anon/authenticated any
--    direct table access beyond the boolean each function returns).
-- ----------------------------------------------------------------------------

create or replace function public.is_coach()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select role from "User" where id = auth.uid()::text) = 'COACH', false)
$$;

create or replace function public.can_access_athlete(target_athlete_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from "AthleteProfile" ap
    where ap.id = target_athlete_id
      and (ap."userId" = auth.uid()::text or ap."coachId" = auth.uid()::text)
  )
$$;

create or replace function public.can_access_cycle(target_cycle_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from "Cycle" c
    where c.id = target_cycle_id and public.can_access_athlete(c."athleteId")
  )
$$;

create or replace function public.can_access_microcycle(target_microcycle_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from "Microcycle" mc
    where mc.id = target_microcycle_id and public.can_access_cycle(mc."cycleId")
  )
$$;

create or replace function public.can_access_workout(target_workout_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from "Workout" w
    where w.id = target_workout_id and public.can_access_microcycle(w."microcycleId")
  )
$$;

create or replace function public.can_access_exercise_entry(target_entry_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from "ExerciseEntry" e
    where e.id = target_entry_id and public.can_access_workout(e."workoutId")
  )
$$;

create or replace function public.can_access_period(target_period_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from "Period" p
    where p.id = target_period_id and public.can_access_athlete(p."athleteId")
  )
$$;

create or replace function public.can_access_stage(target_stage_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from "Stage" s
    where s.id = target_stage_id and public.can_access_period(s."periodId")
  )
$$;

create or replace function public.can_access_mesocycle(target_mesocycle_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from "Mesocycle" m
    where m.id = target_mesocycle_id and public.can_access_stage(m."stageId")
  )
$$;

grant execute on function public.is_coach() to anon, authenticated;
grant execute on function public.can_access_athlete(text) to anon, authenticated;
grant execute on function public.can_access_cycle(text) to anon, authenticated;
grant execute on function public.can_access_microcycle(text) to anon, authenticated;
grant execute on function public.can_access_workout(text) to anon, authenticated;
grant execute on function public.can_access_exercise_entry(text) to anon, authenticated;
grant execute on function public.can_access_period(text) to anon, authenticated;
grant execute on function public.can_access_stage(text) to anon, authenticated;
grant execute on function public.can_access_mesocycle(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Enable RLS on every public table.
-- ----------------------------------------------------------------------------

alter table "User" enable row level security;
alter table "Account" enable row level security;
alter table "Session" enable row level security;
alter table "VerificationToken" enable row level security;
alter table "AthleteProfile" enable row level security;
alter table "ExerciseCatalog" enable row level security;
alter table "Athlete1RM" enable row level security;
alter table "FatigueCoefficient" enable row level security;
alter table "RpeTable" enable row level security;
alter table "Cycle" enable row level security;
alter table "Microcycle" enable row level security;
alter table "Workout" enable row level security;
alter table "ExerciseEntry" enable row level security;
alter table "SetEntry" enable row level security;
alter table "_prisma_migrations" enable row level security;
alter table "Supplement" enable row level security; -- already was on; idempotent
alter table "Period" enable row level security;
alter table "Stage" enable row level security;
alter table "Mesocycle" enable row level security;
alter table "PeriodizationMicrocycle" enable row level security;
alter table "ChangeLog" enable row level security;

-- ----------------------------------------------------------------------------
-- 3. Read policies, scoped to "own data" (coach who owns the athlete, or the
--    athlete themself). No INSERT/UPDATE/DELETE policies are added — every
--    write already goes through Prisma (the postgres role, which bypasses
--    RLS), so leaving writes undefined for anon/authenticated means they
--    stay fully denied by default. Add write policies later only if a
--    feature deliberately needs the browser to write directly.
--
--    Account / Session / VerificationToken (NextAuth-adapter leftovers,
--    unused since auth moved to Supabase Auth — see src/lib/session.ts —
--    but Account still has OAuth token columns) and _prisma_migrations get
--    NO policies at all: RLS enabled + zero policies = fully denied to
--    anon/authenticated, which is exactly right for tables nothing
--    legitimate ever needs to read directly.
-- ----------------------------------------------------------------------------

drop policy if exists "self or any row if coach" on "User";
create policy "self or any row if coach" on "User"
  for select to authenticated
  using (id = auth.uid()::text or public.is_coach());

drop policy if exists "own profile" on "AthleteProfile";
create policy "own profile" on "AthleteProfile"
  for select to authenticated
  using ("userId" = auth.uid()::text or "coachId" = auth.uid()::text);

drop policy if exists "any signed-in user" on "ExerciseCatalog";
create policy "any signed-in user" on "ExerciseCatalog"
  for select to authenticated
  using (true);

drop policy if exists "any signed-in user" on "FatigueCoefficient";
create policy "any signed-in user" on "FatigueCoefficient"
  for select to authenticated
  using (true);

drop policy if exists "any signed-in user" on "RpeTable";
create policy "any signed-in user" on "RpeTable"
  for select to authenticated
  using (true);

drop policy if exists "own athlete's data" on "Athlete1RM";
create policy "own athlete's data" on "Athlete1RM"
  for select to authenticated
  using (public.can_access_athlete("athleteId"));

drop policy if exists "own athlete's data" on "Cycle";
create policy "own athlete's data" on "Cycle"
  for select to authenticated
  using (public.can_access_athlete("athleteId"));

drop policy if exists "own athlete's data" on "Supplement";
create policy "own athlete's data" on "Supplement"
  for select to authenticated
  using (public.can_access_athlete("athleteId"));

drop policy if exists "own athlete's data" on "Period";
create policy "own athlete's data" on "Period"
  for select to authenticated
  using (public.can_access_athlete("athleteId"));

drop policy if exists "own athlete's data" on "ChangeLog";
create policy "own athlete's data" on "ChangeLog"
  for select to authenticated
  using (public.can_access_athlete("athleteId"));

drop policy if exists "own athlete's data" on "Microcycle";
create policy "own athlete's data" on "Microcycle"
  for select to authenticated
  using (public.can_access_cycle("cycleId"));

drop policy if exists "own athlete's data" on "Workout";
create policy "own athlete's data" on "Workout"
  for select to authenticated
  using (public.can_access_microcycle("microcycleId"));

drop policy if exists "own athlete's data" on "ExerciseEntry";
create policy "own athlete's data" on "ExerciseEntry"
  for select to authenticated
  using (public.can_access_workout("workoutId"));

drop policy if exists "own athlete's data" on "SetEntry";
create policy "own athlete's data" on "SetEntry"
  for select to authenticated
  using (public.can_access_exercise_entry("exerciseEntryId"));

drop policy if exists "own athlete's data" on "Stage";
create policy "own athlete's data" on "Stage"
  for select to authenticated
  using (public.can_access_period("periodId"));

drop policy if exists "own athlete's data" on "Mesocycle";
create policy "own athlete's data" on "Mesocycle"
  for select to authenticated
  using (public.can_access_stage("stageId"));

drop policy if exists "own athlete's data" on "PeriodizationMicrocycle";
create policy "own athlete's data" on "PeriodizationMicrocycle"
  for select to authenticated
  using (public.can_access_mesocycle("mesocycleId"));
