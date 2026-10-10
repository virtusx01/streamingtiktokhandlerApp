create table if not exists public.adb_commands (
  id uuid primary key default gen_random_uuid(),
  actions jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  claimed_by text,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  result jsonb
);

create index if not exists adb_commands_pending_idx
  on public.adb_commands (created_at)
  where status = 'queued';

create index if not exists adb_commands_stale_idx
  on public.adb_commands (claimed_at)
  where status = 'processing';

alter table public.adb_commands enable row level security;
grant all on public.adb_commands to service_role;

create table if not exists public.adb_agents (
  agent_id text primary key,
  last_seen timestamptz not null default now(),
  adb_connected boolean not null default false,
  devices jsonb not null default '[]'::jsonb
);

alter table public.adb_agents enable row level security;
grant all on public.adb_agents to service_role;

create or replace function public.claim_adb_command(p_agent_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.adb_commands;
begin
  update public.adb_commands
  set status = 'processing',
      claimed_by = p_agent_id,
      claimed_at = now()
  where id = (
    select id
    from public.adb_commands
    where status = 'queued'
       or (status = 'processing' and claimed_at < now() - interval '15 minutes')
    order by created_at
    limit 1
    for update skip locked
  )
  returning * into claimed;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', claimed.id,
    'actions', claimed.actions,
    'metadata', claimed.metadata
  );
end;
$$;

revoke all on function public.claim_adb_command(text) from public, anon, authenticated;
grant execute on function public.claim_adb_command(text) to service_role;
