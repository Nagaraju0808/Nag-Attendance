-- ════════════════════════════════════════════════════════════
--  MIGRATION SCRIPT — for upgrading an EXISTING database that
--  already has real attendance data in it.
--
--  Use this INSTEAD of sql/schema.sql if you've already been using
--  the attendance app and have real records you want to keep.
--  (sql/schema.sql is only for a brand-new, empty Supabase project.)
--
--  WHAT THIS DOES, IN PLAIN TERMS:
--   1. Adds a new "owner_id" column to your existing tables
--      (semesters, semester_subjects, semester_timetable,
--      attendance_records, subject_initial) — this column doesn't
--      exist yet, so step 1 affects zero existing data, it just
--      adds an empty column.
--   2. Fills that new column in for every existing row with YOUR
--      user ID — this is the only step that "touches" your old
--      rows, and all it does is label them as belonging to you.
--      No row is deleted, changed, or moved.
--   3. Turns on Row Level Security (the actual protection) and
--      tells it "only show/allow rows where owner_id = you."
--   4. Creates the new tables for results/backlog/reminders that
--      didn't exist before — these start empty, nothing to migrate.
--
--  SAFETY: this entire script runs as ONE transaction (see BEGIN /
--  COMMIT at the very top and bottom). If anything in here fails
--  for any reason, Postgres automatically undoes everything in this
--  script — there is no possible "half-applied, half-broken" state.
--  Either all of this succeeds, or none of it does, and your data
--  stays exactly as it was either way.
--
--  BEFORE RUNNING: make sure you've already created your one login
--  account in Authentication → Users (see DEPLOYMENT.md Part 2,
--  steps 11-13) with the email below — this script looks up that
--  account's ID to label your existing rows with.
-- ════════════════════════════════════════════════════════════

begin;

-- Change this if your login email is different from what's below.
-- (It must already exist under Authentication → Users before running.)
do $$
declare
  v_owner uuid;
begin
  select id into v_owner from auth.users where email = 'nagaraju080505@gmail.com';
  if v_owner is null then
    raise exception 'No Supabase Auth user found with that email. Create the user first (Authentication → Users), then re-run this script.';
  end if;
end $$;

-- ───────────────────────────────────────────────
-- STEP 1 — add owner_id column to existing tables (only if missing)
-- ───────────────────────────────────────────────
alter table if exists semesters           add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table if exists semester_subjects   add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table if exists semester_timetable  add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table if exists attendance_records  add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table if exists subject_initial     add column if not exists owner_id uuid references auth.users(id) on delete cascade;

-- ───────────────────────────────────────────────
-- STEP 2 — label every existing row as yours (only fills blanks,
-- never overwrites a row, never removes a row)
-- ───────────────────────────────────────────────
update semesters          set owner_id = (select id from auth.users where email = 'nagaraju080505@gmail.com') where owner_id is null;
update semester_subjects  set owner_id = (select id from auth.users where email = 'nagaraju080505@gmail.com') where owner_id is null;
update semester_timetable set owner_id = (select id from auth.users where email = 'nagaraju080505@gmail.com') where owner_id is null;
update attendance_records set owner_id = (select id from auth.users where email = 'nagaraju080505@gmail.com') where owner_id is null;
update subject_initial    set owner_id = (select id from auth.users where email = 'nagaraju080505@gmail.com') where owner_id is null;

-- ───────────────────────────────────────────────
-- STEP 3 — require owner_id going forward, default new rows to "you"
-- ───────────────────────────────────────────────
alter table semesters           alter column owner_id set not null, alter column owner_id set default auth.uid();
alter table semester_subjects   alter column owner_id set not null, alter column owner_id set default auth.uid();
alter table semester_timetable  alter column owner_id set not null, alter column owner_id set default auth.uid();
alter table attendance_records  alter column owner_id set not null, alter column owner_id set default auth.uid();
alter table subject_initial     alter column owner_id set not null, alter column owner_id set default auth.uid();

-- ───────────────────────────────────────────────
-- STEP 4 — fix the "no duplicate entries" rules so they include
-- owner_id (needed for the app's save/update logic to work).
-- This finds whatever the existing rule is called (its name varies)
-- and replaces it — doesn't touch any actual data, just the rule.
-- ───────────────────────────────────────────────
do $$
declare cname text;
begin
  select conname into cname from pg_constraint
    where conrelid = 'attendance_records'::regclass and contype = 'u' limit 1;
  if cname is not null then
    execute format('alter table attendance_records drop constraint %I', cname);
  end if;
end $$;
alter table attendance_records add constraint attendance_records_owner_uniq unique (owner_id, date, period, subject);

do $$
declare cname text;
begin
  select conname into cname from pg_constraint
    where conrelid = 'subject_initial'::regclass and contype = 'u' limit 1;
  if cname is not null then
    execute format('alter table subject_initial drop constraint %I', cname);
  end if;
end $$;
alter table subject_initial add constraint subject_initial_owner_uniq unique (owner_id, subject, semester_id);

-- ───────────────────────────────────────────────
-- STEP 5 — turn on the actual security, now that every row is
-- correctly labeled with an owner_id to check against.
-- ───────────────────────────────────────────────
alter table semesters enable row level security;
drop policy if exists "semesters_owner_all" on semesters;
create policy "semesters_owner_all" on semesters for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

alter table semester_subjects enable row level security;
drop policy if exists "sem_subjects_owner_all" on semester_subjects;
create policy "sem_subjects_owner_all" on semester_subjects for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

alter table semester_timetable enable row level security;
drop policy if exists "tt_owner_all" on semester_timetable;
create policy "tt_owner_all" on semester_timetable for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

alter table attendance_records enable row level security;
drop policy if exists "attendance_owner_all" on attendance_records;
create policy "attendance_owner_all" on attendance_records for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

alter table subject_initial enable row level security;
drop policy if exists "initial_owner_all" on subject_initial;
create policy "initial_owner_all" on subject_initial for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ───────────────────────────────────────────────
-- STEP 6 — create the brand-new tables for features that didn't
-- exist before (profile, result tracker, backlog, reminders).
-- These start completely empty — there's nothing old to migrate.
-- ───────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  roll_number text default '',
  branch text default '',
  section text default '',
  semester text default '',
  academic_year text default '',
  college_name text default '',
  batch text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table profiles enable row level security;
drop policy if exists "profile_owner_select" on profiles;
create policy "profile_owner_select" on profiles for select using (auth.uid() = id);
drop policy if exists "profile_owner_upsert" on profiles;
create policy "profile_owner_upsert" on profiles for insert with check (auth.uid() = id);
drop policy if exists "profile_owner_update" on profiles;
create policy "profile_owner_update" on profiles for update using (auth.uid() = id);

create table if not exists result_semesters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null,
  year text default '',
  sgpa numeric(4,2) not null,
  credits numeric(5,1) not null,
  points numeric(6,1) not null,
  official boolean default false,
  subjects jsonb not null default '[]',
  created_at timestamptz default now(),
  unique (owner_id, label)
);
alter table result_semesters enable row level security;
drop policy if exists "results_owner_all" on result_semesters;
create policy "results_owner_all" on result_semesters for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create table if not exists backlog_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject text not null,
  credits numeric(4,1) not null,
  expected_grade text not null,
  created_at timestamptz default now()
);
alter table backlog_items enable row level security;
drop policy if exists "backlog_owner_all" on backlog_items;
create policy "backlog_owner_all" on backlog_items for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  type text not null default 'class',
  due_date date not null,
  due_time time default '09:00',
  notes text default '',
  notified boolean default false,
  created_at timestamptz default now()
);
alter table reminders enable row level security;
drop policy if exists "reminders_owner_all" on reminders;
create policy "reminders_owner_all" on reminders for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists idx_attendance_owner_date on attendance_records(owner_id, date);
create index if not exists idx_attendance_owner_sem on attendance_records(owner_id, semester_id);
create index if not exists idx_results_owner on result_semesters(owner_id);
create index if not exists idx_reminders_owner_date on reminders(owner_id, due_date);

commit;

-- If you see "Success. No rows returned" — everything worked and
-- your existing data is exactly where it was, just now protected.
-- Run this afterward to double check no rows were lost, comparing
-- against what you remember/expect:
--   select count(*) from attendance_records;
