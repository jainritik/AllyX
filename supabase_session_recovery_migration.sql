-- Prevent a second start request from consuming another credit while a session
-- is already active. Apply after supabase_billing_account_migration.sql.
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

  -- A current session belongs to this account even if browser/session storage
  -- was cleared. Return it for recovery and never reserve another credit.
  if ent.active_session_id is not null then
    if ent.active_session_source = 'trial' and ent.trial_expires_at <= now() then
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

revoke all on function public.begin_interview_access(uuid) from public, anon;
grant execute on function public.begin_interview_access(uuid) to authenticated;
