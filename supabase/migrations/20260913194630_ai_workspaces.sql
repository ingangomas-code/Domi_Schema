-- Additive: keeps all existing schema_projects data and policies unchanged.
create table public.ai_workspaces (
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null check (length(project_id) between 1 and 150),
  state jsonb not null check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 12000000),
  updated_at timestamptz not null default now(),
  primary key (owner_id, project_id)
);
alter table public.ai_workspaces enable row level security;
revoke all on public.ai_workspaces from anon;
grant select, insert, update, delete on public.ai_workspaces to authenticated;
create policy ai_workspaces_read on public.ai_workspaces for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy ai_workspaces_create on public.ai_workspaces for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy ai_workspaces_update on public.ai_workspaces for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy ai_workspaces_delete on public.ai_workspaces for delete to authenticated
  using ((select auth.uid()) = owner_id);
