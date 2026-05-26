create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  category text,
  status text default '構思中',
  shoot_date timestamptz,
  publish_date timestamptz,
  assignee text,
  notes text,
  created_at timestamptz default now()
);

alter table public.projects
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists category text,
  add column if not exists publish_date timestamptz,
  add column if not exists assignee text,
  add column if not exists notes text;

alter table public.projects enable row level security;

drop policy if exists "projects mobile workspace read" on public.projects;
create policy "projects mobile workspace read" on public.projects
  for select using (
    user_id = auth.uid()
    or created_by = auth.uid()
    or workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid() and status = 'active'
    )
  );

drop policy if exists "projects mobile workspace insert" on public.projects;
create policy "projects mobile workspace insert" on public.projects
  for insert with check (
    user_id = auth.uid()
    or created_by = auth.uid()
    or workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid() and status = 'active'
    )
  );

drop policy if exists "projects mobile workspace update" on public.projects;
create policy "projects mobile workspace update" on public.projects
  for update using (
    user_id = auth.uid()
    or created_by = auth.uid()
    or workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid() and status = 'active'
    )
  );

drop policy if exists "projects mobile workspace delete" on public.projects;
create policy "projects mobile workspace delete" on public.projects
  for delete using (
    user_id = auth.uid()
    or created_by = auth.uid()
    or workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid() and status = 'active'
    )
  );

notify pgrst, 'reload schema';
