-- Defense in depth for the introductory-trial policy. A successful pack
-- purchase always takes precedence over an unused free trial, including for
-- accounts created before the original purchase trigger was installed.
create or replace function public.interview_access_payload(ent public.account_entitlements)
returns jsonb language plpgsql stable set search_path = '' as $$
declare has_purchased_pack boolean;
begin
  select exists(
    select 1 from public.payment_orders
    where user_id = ent.user_id
      and status in ('paid', 'refund_pending', 'partially_refunded', 'refunded', 'disputed')
  ) into has_purchased_pack;

  return jsonb_build_object(
    'allowed', case
      when ent.active_session_source = 'trial' then ent.trial_expires_at > now()
      when ent.active_session_source = 'credit' then ent.active_session_id is not null
      else false end,
    'source', coalesce(ent.active_session_source, 'none'),
    'sessionId', ent.active_session_id,
    'expiresAt', case when ent.active_session_source = 'trial' then ent.trial_expires_at else null end,
    'remainingSeconds', case when ent.active_session_source = 'trial' then greatest(0, floor(extract(epoch from (ent.trial_expires_at - now())))::integer) else 0 end,
    'creditsRemaining', ent.interview_credits,
    'hasPurchasedPack', has_purchased_pack,
    'trialAvailable', ent.trial_started_at is null and not has_purchased_pack,
    'reason', case
      when ent.active_session_source = 'trial' and ent.trial_expires_at <= now() then 'Your 10-minute free trial has ended.'
      when ent.active_session_id is null and has_purchased_pack and ent.interview_credits = 0 then 'You have used all your interview credits. Choose another pack to continue.'
      when ent.active_session_id is null and ent.trial_started_at is not null and ent.interview_credits = 0 then 'Your free trial has been used. Choose an interview pack to continue.'
      else null end
  );
end;
$$;
revoke all on function public.interview_access_payload(public.account_entitlements) from public, anon, authenticated;

create or replace function public.begin_interview_access_v2(requested_session_id uuid, requested_source text default 'auto')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ent public.account_entitlements; has_purchased_pack boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if requested_source not in ('auto', 'trial', 'credit') then raise exception 'Invalid entitlement source'; end if;
  insert into public.account_entitlements (user_id) values (auth.uid()) on conflict do nothing;
  select * into ent from public.account_entitlements where user_id = auth.uid() for update;

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

  select exists(
    select 1 from public.payment_orders
    where user_id = auth.uid()
      and status in ('paid', 'refund_pending', 'partially_refunded', 'refunded', 'disputed')
  ) into has_purchased_pack;

  if requested_source in ('auto', 'trial') and ent.trial_started_at is null and not has_purchased_pack then
    update public.account_entitlements set trial_started_at = now(), trial_expires_at = now() + interval '10 minutes',
      active_session_id = requested_session_id, active_session_source = 'trial', active_session_started_at = now(), updated_at = now()
      where user_id = auth.uid() returning * into ent;
    insert into public.interview_access_usage (session_id, user_id, source, started_at)
      values (requested_session_id, auth.uid(), 'trial', ent.active_session_started_at) on conflict (session_id) do nothing;
    return public.interview_access_payload(ent);
  end if;

  if requested_source in ('auto', 'credit') and ent.interview_credits > 0 then
    update public.account_entitlements set interview_credits = interview_credits - 1,
      active_session_id = requested_session_id, active_session_source = 'credit', active_session_started_at = now(), updated_at = now()
      where user_id = auth.uid() returning * into ent;
    insert into public.interview_access_usage (session_id, user_id, source, started_at)
      values (requested_session_id, auth.uid(), 'credit', ent.active_session_started_at) on conflict (session_id) do nothing;
    return public.interview_access_payload(ent);
  end if;

  return public.interview_access_payload(ent) || jsonb_build_object(
    'allowed', false,
    'reason', case
      when has_purchased_pack and ent.interview_credits = 0 then 'You have used all your interview credits. Choose another pack to continue.'
      when requested_source = 'trial' and has_purchased_pack then 'The free trial is available before your first pack purchase only.'
      when requested_source = 'trial' then 'Your free trial is no longer available.'
      when requested_source = 'credit' then 'You do not have an interview credit. Choose a pack to continue.'
      else 'Choose an interview pack to continue.' end
  );
end;
$$;
revoke all on function public.begin_interview_access_v2(uuid, text) from public, anon;
grant execute on function public.begin_interview_access_v2(uuid, text) to authenticated;
