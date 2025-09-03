-- Supabase schema for nested tasks
create extension if not exists pgcrypto;

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  title text not null,
  status text not null check (status in ('incomplete','complete')) default 'incomplete',
  elapsed_seconds integer not null default 0,
  due_date date,
  project text,
  running boolean not null default false,
  started_at timestamptz,
  parent_id uuid references tasks(id) on delete cascade,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_tasks_user on tasks(user_id);
create index if not exists idx_tasks_parent on tasks(parent_id);

alter table tasks enable row level security;

-- RLS: each user can only access their rows
drop policy if exists "read own" on tasks;
drop policy if exists "insert own" on tasks;
drop policy if exists "update own" on tasks;
drop policy if exists "delete own" on tasks;

create policy "read own" on tasks for select using (auth.uid() = user_id);
create policy "insert own" on tasks for insert with check (auth.uid() = user_id);
create policy "update own" on tasks for update using (auth.uid() = user_id);
create policy "delete own" on tasks for delete using (auth.uid() = user_id);
