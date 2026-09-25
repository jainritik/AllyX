-- Auditable interview reservations and automatic refunds before meaningful use.
-- Apply after supabase_session_recovery_migration.sql.
create table if not exists public.interview_access_usage (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('trial', 'credit')),
  status text not null default 'active' check (status in ('active', 'completed', 'refunded')),
  started_at timestamp with time zone not null default now(),
  meaningful_use_at timestamp with time zone,
  ended_at timestamp with time zone
);
create index if not exists interview_access_usage_user_started_idx
  on public.interview_access_usage (user_id, started_at desc);
alter table public.interview_access_usage enable row level security;
revoke all on public.interview_access_usage from anon, authenticated;

-- Existing paid sessions predate the usage ledger. Treat them as used so a
-- migration cannot accidentally mint replacement credits.
insert into public.interview_access_usage (session_id, user_id, source, status, started_at, meaningful_use_at)
select active_session_id, user_id, active_session_source, 'active',
  coalesce(active_session_started_at, now()),
  case when active_session_source = 'credit' then coalesce(active_session_started_at, now()) else null end
from public.account_entitlements
where active_session_id is not null
on conflict (session_id) do nothing;

create or replace function public.begin_interview_access(requested_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ent public.account_entitlements;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.account_entitlements (user_id) values (auth.uid()) on conflict do nothing;
  select * into ent from public.account_entitlements where user_id = auth.uid() for update;

  if ent.active_session_id = requested_session_id then
    if ent.active_session_source = 'trial' and ent.trial_expires_at <= now() then
      update public.interview_access_usage set status = 'completed', ended_at = coalesce(ended_at, now())
        where session_id = requested_session_id and user_id = auth.uid() and status = 'active';
      update public.account_entitlements set active_session_id = null, active_session_source = null,
        active_session_started_at = null, trial_consumed_at = coalesce(trial_consumed_at, trial_expires_at), updated_at = now()
        where user_id = auth.uid() returning * into ent;
    else
      insert into public.interview_access_usage (session_id, user_id, source, started_at)
        values (requested_session_id, auth.uid(), ent.active_session_source, coalesce(ent.active_session_started_at, now()))
        on conflict (session_id) do nothing;
    end if;
    return public.interview_access_payload(ent);
  end if;

  if ent.active_session_id is not null then
    if ent.active_session_source = 'trial' and ent.trial_expires_at <= now() then
      update public.interview_access_usage set status = 'completed', ended_at = coalesce(ended_at, now())
        where session_id = ent.active_session_id and user_id = auth.uid() and status = 'active';
      update public.account_entitlements set active_session_id = null, active_session_source = null,
        active_session_started_at = null, trial_consumed_at = coalesce(trial_consumed_at, trial_expires_at), updated_at = now()
        where user_id = auth.uid() returning * into ent;
    else
      return public.interview_access_payload(ent);
    end if;
  end if;

  if ent.trial_started_at is null then
    update public.account_entitlements set trial_started_at = now(), trial_expires_at = now() + interval '10 minutes',
      active_session_id = requested_session_id, active_session_source = 'trial', active_session_started_at = now(), updated_at = now()
      where user_id = auth.uid() returning * into ent;
    insert into public.interview_access_usage (session_id, user_id, source, started_at)
      values (requested_session_id, auth.uid(), 'trial', ent.active_session_started_at);
    return public.interview_access_payload(ent);
  end if;

  if ent.interview_credits > 0 then
    update public.account_entitlements set interview_credits = interview_credits - 1,
      active_session_id = requested_session_id, active_session_source = 'credit', active_session_started_at = now(), updated_at = now()
      where user_id = auth.uid() returning * into ent;
    insert into public.interview_access_usage (session_id, user_id, source, started_at)
      values (requested_session_id, auth.uid(), 'credit', ent.active_session_started_at);
    return public.interview_access_payload(ent);
  end if;

  ent.active_session_id := null; ent.active_session_source := null; ent.active_session_started_at := null;
  return public.interview_access_payload(ent);
end;
$$;

create or replace function public.mark_interview_meaningful_use(requested_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.interview_access_usage set meaningful_use_at = coalesce(meaningful_use_at, now())
    where session_id = requested_session_id and user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Active interview reservation not found'; end if;
end;
$$;

create or replace function public.finish_interview_access(requested_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ent public.account_entitlements; usage public.interview_access_usage; refunded boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into ent from public.account_entitlements where user_id = auth.uid() for update;
  if found and ent.active_session_id = requested_session_id then
    select * into usage from public.interview_access_usage
      where session_id = requested_session_id and user_id = auth.uid() for update;
    if ent.active_session_source = 'credit' and found and usage.meaningful_use_at is null then
      refunded := true;
      update public.account_entitlements set interview_credits = interview_credits + 1 where user_id = auth.uid();
      update public.interview_access_usage set status = 'refunded', ended_at = now()
        where session_id = requested_session_id and user_id = auth.uid();
    else
      update public.interview_access_usage set status = 'completed', ended_at = coalesce(ended_at, now())
        where session_id = requested_session_id and user_id = auth.uid() and status = 'active';
    end if;
    update public.account_entitlements set
      trial_consumed_at = case when active_session_source = 'trial' then coalesce(trial_consumed_at, now()) else trial_consumed_at end,
      active_session_id = null, active_session_source = null, active_session_started_at = null, updated_at = now()
      where user_id = auth.uid() returning * into ent;
  end if;
  return public.interview_access_payload(ent) || jsonb_build_object('creditRefunded', refunded);
end;
$$;

revoke all on function public.begin_interview_access(uuid) from public, anon;
revoke all on function public.mark_interview_meaningful_use(uuid) from public, anon;
revoke all on function public.finish_interview_access(uuid) from public, anon;
grant execute on function public.begin_interview_access(uuid) to authenticated;
grant execute on function public.mark_interview_meaningful_use(uuid) to authenticated;
grant execute on function public.finish_interview_access(uuid) to authenticated;
