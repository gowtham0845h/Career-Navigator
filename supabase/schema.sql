-- Run in the Supabase SQL editor. User-specific records are protected by RLS.
create table if not exists public.roles (
  id text primary key, name text not null, category text not null,
  summary text not null, skills jsonb not null default '[]',
  languages jsonb not null default '[]', company_notes jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create table if not exists public.jobs (
  id text primary key, company text not null, title text not null, role text not null,
  location text not null, work_type text not null, experience text not null,
  opens_at date not null, closes_at date not null, apply_url text not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '', college text not null default '', branch text not null default '',
  year text not null default '', target_role text not null default '', target_companies text[] not null default '{}',
  theme text not null default 'light', updated_at timestamptz not null default now()
);
create table if not exists public.saved_jobs (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id text not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(user_id, job_id)
);
create table if not exists public.checklist_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id text not null references public.roles(id) on delete cascade,
  skill_name text not null, completed boolean not null default false,
  updated_at timestamptz not null default now(), primary key(user_id, role_id, skill_name)
);
create table if not exists public.roadmap_steps (
  id text primary key, user_id uuid not null references auth.users(id) on delete cascade,
  role_id text not null references public.roles(id), phase text not null, title text not null,
  goal text not null, resources jsonb not null default '[]', estimate text not null,
  sort_order integer not null, completed boolean not null default false,
  completed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.mentor_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_id text not null references public.roles(id), skill_names text[] not null default '{}',
  companies text[] not null default '{}', months integer not null default 6 check (months between 1 and 12),
  updated_at timestamptz not null default now()
);
create table if not exists public.mentor_messages (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  role_id text not null references public.roles(id), sender text not null check (sender in ('mentor','you')),
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.saved_jobs enable row level security;
alter table public.checklist_progress enable row level security;
alter table public.roadmap_steps enable row level security;
alter table public.mentor_preferences enable row level security;
alter table public.mentor_messages enable row level security;
alter table public.roles enable row level security;
alter table public.jobs enable row level security;
drop policy if exists "public roles readable" on public.roles;
create policy "public roles readable" on public.roles for select using (true);
drop policy if exists "public jobs readable" on public.jobs;
create policy "public jobs readable" on public.jobs for select using (true);
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "own saved jobs" on public.saved_jobs;
create policy "own saved jobs" on public.saved_jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own checklist" on public.checklist_progress;
create policy "own checklist" on public.checklist_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own roadmap" on public.roadmap_steps;
create policy "own roadmap" on public.roadmap_steps for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own mentor preferences" on public.mentor_preferences;
create policy "own mentor preferences" on public.mentor_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own mentor messages" on public.mentor_messages;
create policy "own mentor messages" on public.mentor_messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Catalog rows are written only with the service role during seeding.
