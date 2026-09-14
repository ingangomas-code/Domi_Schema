create table public.schema_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_project_id text not null check (char_length(source_project_id) between 1 and 150),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  title text not null check (char_length(title) between 1 and 100),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 2000000),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  view_count bigint not null default 0 check (view_count >= 0),
  check (expires_at is null or expires_at > created_at)
);

alter table public.schema_shares enable row level security;
revoke all on table public.schema_shares from anon, authenticated;
grant select, update, delete on table public.schema_shares to authenticated;

create policy "Owners can read their schema shares"
on public.schema_shares for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "Owners can revoke their schema shares"
on public.schema_shares for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "Owners can delete their schema shares"
on public.schema_shares for delete to authenticated
using ((select auth.uid()) = owner_id);

create index schema_shares_owner_created_idx
on public.schema_shares (owner_id, created_at desc);

create index schema_shares_active_token_idx
on public.schema_shares (token_hash)
where revoked_at is null;
