-- ════════════════════════════════════════════════════════════
--  NAGARAJU DASHBOARD — DATABASE SCHEMA + ROW LEVEL SECURITY
--  Run this in: Supabase Dashboard → SQL Editor → New Query
--  Safe to re-run (uses IF NOT EXISTS / OR REPLACE where possible)
--
--  ⚠️  IMPORTANT: this script is for a BRAND-NEW, EMPTY Supabase
--  project only. If you already have an existing app with real
--  attendance data in these tables, do NOT run this — use
--  sql/migrate-existing-data.sql instead, which safely upgrades
--  your existing tables without touching your existing rows.
-- ════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────
-- 0. IMPORTANT CONTEXT (read before running)
-- ───────────────────────────────────────────────
-- The Supabase "anon" key is NOT a secret. It is designed to be
-- public (it ships inside every Supabase JS app, mobile app, etc).
-- The real security boundary is Row Level Security (RLS).
-- Without RLS, ANYONE with your anon key (visible in browser dev
-- tools on any Supabase site) can read/write every row in every
-- table. That is the actual vulnerability in the original app —
-- not the key being "exposed" in index.html.
--
-- This script:
--   1. Creates an `owner_id` column on every table, defaulting to
--      the authenticated user's id (auth.uid()).
--   2. Enables RLS on every table.
--   3. Adds policies so a row is only visible/editable by the
--      user who owns it (auth.uid() = owner_id).
--   4. Since this is a single-user app, only ONE Supabase Auth
--      user should ever be created (see /js/auth.js + README).

-- ───────────────────────────────────────────────
-- 1. PROFILE TABLE (replaces hardcoded identity)
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
create policy "profile_owner_select" on profiles
  for select using (auth.uid() = id);

drop policy if exists "profile_owner_upsert" on profiles;
create policy "profile_owner_upsert" on profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profile_owner_update" on profiles;
create policy "profile_owner_update" on profiles
  for update using (auth.uid() = id);

-- ───────────────────────────────────────────────
-- 2. SEMESTERS
-- ───────────────────────────────────────────────
create table if not exists semesters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'active', -- active | completed
  created_at timestamptz default now()
);

alter table semesters enable row level security;
drop policy if exists "semesters_owner_all" on semesters;
create policy "semesters_owner_all" on semesters
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ───────────────────────────────────────────────
-- 3. SEMESTER SUBJECTS
-- ───────────────────────────────────────────────
create table if not exists semester_subjects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  semester_id uuid not null references semesters(id) on delete cascade,
  key text not null,
  name text not null,
  code text default '',
  faculty text default '',
  color text default '#00d4ff',
  periods_per_week int default 0
);

alter table semester_subjects enable row level security;
drop policy if exists "sem_subjects_owner_all" on semester_subjects;
create policy "sem_subjects_owner_all" on semester_subjects
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ───────────────────────────────────────────────
-- 4. SEMESTER TIMETABLE
-- ───────────────────────────────────────────────
create table if not exists semester_timetable (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  semester_id uuid not null references semesters(id) on delete cascade,
  day text not null,
  period int not null,
  time_slot text default '',
  subject_key text not null
);

alter table semester_timetable enable row level security;
drop policy if exists "tt_owner_all" on semester_timetable;
create policy "tt_owner_all" on semester_timetable
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ───────────────────────────────────────────────
-- 5. ATTENDANCE RECORDS
-- ───────────────────────────────────────────────
create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  semester_id uuid references semesters(id) on delete cascade,
  date date not null,
  day text not null,
  period int not null,
  subject text not null,
  subject_name text default '',
  status text not null default 'A', -- P | A
  is_holiday boolean default false,
  holiday_reason text,
  unique (owner_id, date, period, subject)
);

alter table attendance_records enable row level security;
drop policy if exists "attendance_owner_all" on attendance_records;
create policy "attendance_owner_all" on attendance_records
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ───────────────────────────────────────────────
-- 6. SUBJECT INITIAL DATA
-- ───────────────────────────────────────────────
create table if not exists subject_initial (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  semester_id uuid references semesters(id) on delete cascade,
  subject text not null,
  present int default 0,
  total int default 0,
  updated_at timestamptz default now(),
  unique (owner_id, subject, semester_id)
);

alter table subject_initial enable row level security;
drop policy if exists "initial_owner_all" on subject_initial;
create policy "initial_owner_all" on subject_initial
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ───────────────────────────────────────────────
-- 7. RESULT TRACKER — SEMESTER RESULTS
-- ───────────────────────────────────────────────
create table if not exists result_semesters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null,         -- e.g. "Sem 1"
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
create policy "results_owner_all" on result_semesters
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ───────────────────────────────────────────────
-- 8. BACKLOG / SUPPLY TRACKER
-- ───────────────────────────────────────────────
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
create policy "backlog_owner_all" on backlog_items
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ───────────────────────────────────────────────
-- 9. CALENDAR REMINDERS
-- ───────────────────────────────────────────────
create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  type text not null default 'class', -- class | assignment | exam
  due_date date not null,
  due_time time default '09:00',
  notes text default '',
  notified boolean default false,
  created_at timestamptz default now()
);

alter table reminders enable row level security;
drop policy if exists "reminders_owner_all" on reminders;
create policy "reminders_owner_all" on reminders
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ───────────────────────────────────────────────
-- 10. LOCK DOWN PUBLIC SIGNUPS (single-user app)
-- ───────────────────────────────────────────────
-- Do this in Supabase Dashboard, NOT SQL:
--   Authentication → Providers → Email → "Allow new users to sign up" → OFF
-- Then create exactly ONE user manually:
--   Authentication → Users → Add User → (Nagaraju's email + password)
-- This guarantees no one else can ever register, even if they
-- find your URL and anon key.

-- ───────────────────────────────────────────────
-- 11. HELPFUL INDEXES
-- ───────────────────────────────────────────────
create index if not exists idx_attendance_owner_date on attendance_records(owner_id, date);
create index if not exists idx_attendance_owner_sem on attendance_records(owner_id, semester_id);
create index if not exists idx_results_owner on result_semesters(owner_id);
create index if not exists idx_reminders_owner_date on reminders(owner_id, due_date);

-- Done. After running, verify with:
--   select tablename, rowsecurity from pg_tables where schemaname='public';
-- Every row should show rowsecurity = true.
