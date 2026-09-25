-- Authenticated read model for the Billing & Credits dashboard.
-- Apply after supabase_billing_migration.sql.
create or replace function public.get_billing_account()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ent public.account_entitlements; purchases jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.account_entitlements (user_id) values (auth.uid()) on conflict do nothing;
  select * into ent from public.account_entitlements where user_id = auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object(
    'orderId', p.order_id,
    'planId', p.plan_id,
    'amount', p.amount,
    'currency', p.currency,
    'credits', p.credits,
    'status', p.status,
    'createdAt', p.created_at,
    'paidAt', p.paid_at
  ) order by p.created_at desc), '[]'::jsonb)
  into purchases from (select * from public.payment_orders where user_id = auth.uid() order by created_at desc limit 20) p;
  return jsonb_build_object(
    'creditsRemaining', ent.interview_credits,
    'trialStatus', case
      when ent.trial_started_at is null then 'available'
      when ent.trial_consumed_at is not null or ent.trial_expires_at <= now() then 'used'
      else 'active' end,
    'trialStartedAt', ent.trial_started_at,
    'trialExpiresAt', ent.trial_expires_at,
    'activeSessionSource', ent.active_session_source,
    'purchases', purchases
  );
end;
$$;
revoke all on function public.get_billing_account() from public, anon;
grant execute on function public.get_billing_account() to authenticated;
