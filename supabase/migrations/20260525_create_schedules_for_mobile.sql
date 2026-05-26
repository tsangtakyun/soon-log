create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  type text default '拍攝',
  date date not null default current_date,
  start_time time,
  end_time time,
  location text,
  notes text,
  reminder boolean default false,
  status text default '即將到來',
  created_at timestamptz default now()
);

alter table public.schedules
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade,
  add column if not exists date date,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists notes text,
  add column if not exists reminder boolean default false,
  add column if not exists status text default '即將到來';

update public.schedules
set
  date = coalesce(date, start_at::date, created_at::date, current_date),
  start_time = coalesce(start_time, start_at::time),
  end_time = coalesce(end_time, end_at::time),
  notes = coalesce(notes, description),
  type = case
    when type = 'shoot' then '拍攝'
    when type = 'deadline' then '截止日'
    when type = 'publish' then '截止日'
    when type = 'meeting' then '會議'
    when type = 'other' then '其他'
    else coalesce(type, '拍攝')
  end
where date is null
  or start_time is null
  or end_time is null
  or notes is null
  or type in ('shoot', 'deadline', 'publish', 'meeting', 'other');

alter table public.schedules
  alter column date set default current_date;

alter table public.schedules enable row level security;

drop policy if exists "Schedule workspace read" on public.schedules;
create policy "Schedule workspace read" on public.schedules
  for select using (
    user_id = auth.uid()
    or workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
        and status = 'active'
    )
  );

drop policy if exists "Schedule workspace insert" on public.schedules;
create policy "Schedule workspace insert" on public.schedules
  for insert with check (
    user_id = auth.uid()
    or workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
        and status = 'active'
    )
  );

drop policy if exists "Schedule workspace update" on public.schedules;
create policy "Schedule workspace update" on public.schedules
  for update using (
    user_id = auth.uid()
    or workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
        and status = 'active'
    )
  );

drop policy if exists "Schedule workspace delete" on public.schedules;
create policy "Schedule workspace delete" on public.schedules
  for delete using (
    user_id = auth.uid()
    or workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
        and status = 'active'
    )
  );

notify pgrst, 'reload schema';
