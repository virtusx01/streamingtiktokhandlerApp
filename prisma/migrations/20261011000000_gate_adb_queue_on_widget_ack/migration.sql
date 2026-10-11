create or replace function public.claim_adb_command(p_agent_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.adb_commands;
begin
  if exists (
    select 1
    from public.adb_commands
    where status = 'completed'
      and metadata @> '{"widgetAckRequired": true, "widgetNotificationAck": false}'::jsonb
  ) then
    return null;
  end if;

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
