create table if not exists public.schema_projects (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  map_data jsonb not null check (jsonb_typeof(map_data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists schema_projects_owner_updated_idx
  on public.schema_projects (owner_id, updated_at desc);

alter table public.schema_projects enable row level security;
revoke all on table public.schema_projects from anon;
grant select, insert, update, delete on table public.schema_projects to authenticated;

create policy "Users read their own schema projects" on public.schema_projects
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Users create their own schema projects" on public.schema_projects
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Users update their own schema projects" on public.schema_projects
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "Users delete their own schema projects" on public.schema_projects
  for delete to authenticated using ((select auth.uid()) = owner_id);
