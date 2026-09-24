-- One account-level 10-minute trial, enforced by Supabase rather than the browser.
-- Apply after supabase_schema.sql and supabase_beta_migration.sql.
create table if not exists public.account_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trial_started_at timestamp with time zone,
  trial_expires_at timestamp with time zone,
  trial_consumed_at timestamp with time zone,
  interview_credits integer not null default 0 check (interview_credits >= 0),
  active_session_id uuid,
  active_session_source text check (active_session_source in ('trial', 'credit')),
  active_session_started_at timestamp with time zone,
  updated_at timestamp with time zone not null default now()
);
alter table public.account_entitlements enable row level security;
revoke all on public.account_entitlements from anon, authenticated;

create or replace function public.interview_access_payload(ent public.account_entitlements)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'allowed', case
      when ent.active_session_source = 'trial' then ent.trial_expires_at > now()
      when ent.active_session_source = 'credit' then ent.active_session_id is not null
      else false end,
    'source', coalesce(ent.active_session_source, 'none'),
    'sessionId', ent.active_session_id,
    'expiresAt', case when ent.active_session_source = 'trial' then ent.trial_expires_at else null end,
    'remainingSeconds', case when ent.active_session_source = 'trial' then greatest(0, floor(extract(epoch from (ent.trial_expires_at - now())))::integer) else 0 end,
    'creditsRemaining', ent.interview_credits,
    'reason', case
      when ent.active_session_source = 'trial' and ent.trial_expires_at <= now() then 'Your 10-minute free trial has ended.'
      when ent.active_session_id is null and ent.trial_consumed_at is not null and ent.interview_credits = 0 then 'Your free trial has been used. Choose an interview pack to continue.'
      else null end
  );
$$;
revoke all on function public.interview_access_payload(public.account_entitlements) from public, anon, authenticated;

create or replace function public.get_interview_access()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ent public.account_entitlements;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.account_entitlements (user_id) values (auth.uid()) on conflict do nothing;
  select * into ent from public.account_entitlements where user_id = auth.uid();
  return public.interview_access_payload(ent);
end;
$$;

create or replace function public.begin_interview_access(requested_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ent public.account_entitlements;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.account_entitlements (user_id) values (auth.uid()) on conflict do nothing;
  select * into ent from public.account_entitlements where user_id = auth.uid() for update;

  if ent.active_session_id = requested_session_id then
    if ent.active_session_source = 'trial' and ent.trial_expires_at <= now() then
      update public.account_entitlements set active_session_id = null, active_session_source = null,
        active_session_started_at = null, trial_consumed_at = coalesce(trial_consumed_at, trial_expires_at), updated_at = now()
      where user_id = auth.uid() returning * into ent;
    end if;
    return public.interview_access_payload(ent);
  end if;

  -- A trial is tied to its first session. Closing or abandoning it consumes it.
  if ent.trial_started_at is null then
    update public.account_entitlements set trial_started_at = now(), trial_expires_at = now() + interval '10 minutes',
      active_session_id = requested_session_id, active_session_source = 'trial', active_session_started_at = now(), updated_at = now()
    where user_id = auth.uid() returning * into ent;
    return public.interview_access_payload(ent);
  end if;

  if ent.interview_credits > 0 then
    update public.account_entitlements set interview_credits = interview_credits - 1,
      active_session_id = requested_session_id, active_session_source = 'credit', active_session_started_at = now(), updated_at = now()
    where user_id = auth.uid() returning * into ent;
    return public.interview_access_payload(ent);
  end if;

  ent.active_session_id := null; ent.active_session_source := null; ent.active_session_started_at := null;
  return public.interview_access_payload(ent);
end;
$$;

create or replace function public.check_interview_access(requested_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ent public.account_entitlements;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into ent from public.account_entitlements where user_id = auth.uid();
  if not found or ent.active_session_id is distinct from requested_session_id then
    return jsonb_build_object('allowed', false, 'source', 'none', 'sessionId', null, 'expiresAt', null,
      'remainingSeconds', 0, 'creditsRemaining', coalesce(ent.interview_credits, 0), 'reason', 'Start an interview session before using AI features.');
  end if;
  return public.interview_access_payload(ent);
end;
$$;

create or replace function public.finish_interview_access(requested_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ent public.account_entitlements;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into ent from public.account_entitlements where user_id = auth.uid() for update;
  if found and ent.active_session_id = requested_session_id then
    update public.account_entitlements set
      trial_consumed_at = case when active_session_source = 'trial' then coalesce(trial_consumed_at, now()) else trial_consumed_at end,
      active_session_id = null, active_session_source = null, active_session_started_at = null, updated_at = now()
    where user_id = auth.uid() returning * into ent;
  end if;
  return public.interview_access_payload(ent);
end;
$$;

revoke all on function public.get_interview_access() from public, anon;
revoke all on function public.begin_interview_access(uuid) from public, anon;
revoke all on function public.check_interview_access(uuid) from public, anon;
revoke all on function public.finish_interview_access(uuid) from public, anon;
grant execute on function public.get_interview_access() to authenticated;
grant execute on function public.begin_interview_access(uuid) to authenticated;
grant execute on function public.check_interview_access(uuid) to authenticated;
grant execute on function public.finish_interview_access(uuid) to authenticated;
