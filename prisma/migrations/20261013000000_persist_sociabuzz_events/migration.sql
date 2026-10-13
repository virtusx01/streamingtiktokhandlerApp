create table if not exists public.sociabuzz_events (
  id bigserial primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists sociabuzz_events_created_at_idx
  on public.sociabuzz_events (created_at);

alter table public.sociabuzz_events enable row level security;
grant all on public.sociabuzz_events to service_role;
grant usage, select on sequence public.sociabuzz_events_id_seq to service_role;
