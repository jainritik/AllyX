-- Complete Razorpay payment lifecycle, refund accounting and user receipts.
-- Apply after supabase_credit_reservation_migration.sql.
alter table public.account_entitlements add column if not exists credit_debt integer not null default 0 check (credit_debt >= 0);

alter table public.payment_orders drop constraint if exists payment_orders_status_check;
alter table public.payment_orders add constraint payment_orders_status_check
  check (status in ('created', 'authorized', 'paid', 'failed', 'refund_pending', 'partially_refunded', 'refunded', 'disputed'));
alter table public.payment_orders add column if not exists receipt_number text;
alter table public.payment_orders add column if not exists latest_payment_id text;
alter table public.payment_orders add column if not exists failure_reason text;
alter table public.payment_orders add column if not exists refunded_amount integer not null default 0 check (refunded_amount >= 0);
alter table public.payment_orders add column if not exists credits_reversed integer not null default 0 check (credits_reversed >= 0);
alter table public.payment_orders add column if not exists refunded_at timestamp with time zone;
alter table public.payment_orders add column if not exists updated_at timestamp with time zone not null default now();

create table if not exists public.payment_webhook_events (
  event_key text primary key,
  event_type text not null,
  order_id text,
  payment_id text,
  received_at timestamp with time zone not null default now()
);
alter table public.payment_webhook_events enable row level security;
revoke all on public.payment_webhook_events from anon, authenticated;

create table if not exists public.payment_refunds (
  refund_id text primary key,
  order_id text not null references public.payment_orders(order_id) on delete cascade,
  payment_id text not null,
  amount integer not null check (amount > 0),
  status text not null check (status in ('created', 'processed', 'failed')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
alter table public.payment_refunds enable row level security;
revoke all on public.payment_refunds from anon, authenticated;

create or replace function public.record_payment_order(requested_order_id text, expected_user_id uuid, requested_plan_id text, requested_receipt text)
returns void language plpgsql security definer set search_path = '' as $$
declare selected_amount integer; selected_credits integer;
begin
  if expected_user_id is null then raise exception 'Account required'; end if;
  if requested_order_id !~ '^order_[A-Za-z0-9]+$' then raise exception 'Invalid order id'; end if;
  if requested_receipt is null or length(requested_receipt) > 40 then raise exception 'Invalid receipt'; end if;
  case requested_plan_id
    when 'starter' then selected_amount := 100000; selected_credits := 2;
    when 'growth' then selected_amount := 200000; selected_credits := 5;
    when 'pro' then selected_amount := 350000; selected_credits := 10;
    else raise exception 'Invalid plan';
  end case;
  insert into public.payment_orders (order_id, user_id, plan_id, amount, credits, receipt_number)
    values (requested_order_id, expected_user_id, requested_plan_id, selected_amount, selected_credits, requested_receipt);
end;
$$;

create or replace function public.fulfill_payment_order(
  requested_order_id text, requested_payment_id text, expected_user_id uuid,
  captured_amount integer, captured_currency text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare purchase public.payment_orders; ent public.account_entitlements; remaining integer; added integer; repaid integer;
begin
  select * into purchase from public.payment_orders where order_id = requested_order_id for update;
  if not found then raise exception 'Unknown payment order'; end if;
  if expected_user_id is not null and purchase.user_id <> expected_user_id then raise exception 'Payment owner mismatch'; end if;
  if captured_amount <> purchase.amount or captured_currency <> purchase.currency then raise exception 'Payment amount mismatch'; end if;
  if purchase.status in ('paid', 'refund_pending', 'partially_refunded', 'refunded', 'disputed') then
    if purchase.payment_id <> requested_payment_id then raise exception 'Order already paid by another payment'; end if;
    select interview_credits into remaining from public.account_entitlements where user_id = purchase.user_id;
    return jsonb_build_object('success', true, 'alreadyProcessed', true, 'creditsAdded', 0, 'creditsRemaining', coalesce(remaining, 0));
  end if;

  insert into public.account_entitlements (user_id) values (purchase.user_id) on conflict do nothing;
  select * into ent from public.account_entitlements where user_id = purchase.user_id for update;
  repaid := least(ent.credit_debt, purchase.credits);
  added := purchase.credits - repaid;
  update public.account_entitlements set interview_credits = interview_credits + added,
    credit_debt = credit_debt - repaid, updated_at = now()
    where user_id = purchase.user_id returning interview_credits into remaining;
  update public.payment_orders set status = 'paid', payment_id = requested_payment_id,
    latest_payment_id = requested_payment_id, failure_reason = null, paid_at = now(), updated_at = now()
    where order_id = requested_order_id;
  return jsonb_build_object('success', true, 'alreadyProcessed', false, 'creditsAdded', added,
    'creditsRemaining', remaining, 'debtRepaid', repaid);
end;
$$;

create or replace function public.record_payment_attempt_event(
  event_key text, event_type text, requested_order_id text, requested_payment_id text, failure_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if event_type not in ('payment.authorized', 'payment.captured', 'payment.failed') then raise exception 'Unsupported payment event'; end if;
  insert into public.payment_webhook_events(event_key, event_type, order_id, payment_id)
    values(event_key, event_type, requested_order_id, requested_payment_id) on conflict do nothing;
  if not found then return; end if;
  if event_type = 'payment.authorized' then
    update public.payment_orders set status = 'authorized', latest_payment_id = requested_payment_id, updated_at = now()
      where order_id = requested_order_id and status in ('created', 'failed');
  elsif event_type = 'payment.failed' then
    update public.payment_orders set status = 'failed', latest_payment_id = requested_payment_id,
      failure_reason = left(failure_reason, 500), updated_at = now()
      where order_id = requested_order_id and status in ('created', 'authorized', 'failed');
  else
    update public.payment_orders set latest_payment_id = requested_payment_id, updated_at = now()
      where order_id = requested_order_id;
  end if;
end;
$$;

create or replace function public.record_refund_event(
  event_key text, event_type text, requested_refund_id text, requested_payment_id text, refund_amount integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare purchase public.payment_orders; processed_total integer; available integer; reversed integer; debt integer;
begin
  if event_type not in ('refund.created', 'refund.processed', 'refund.failed') then raise exception 'Unsupported refund event'; end if;
  if refund_amount <= 0 then raise exception 'Invalid refund amount'; end if;
  select * into purchase from public.payment_orders where payment_id = requested_payment_id for update;
  if not found then raise exception 'Unknown refunded payment'; end if;
  insert into public.payment_webhook_events(event_key, event_type, order_id, payment_id)
    values(event_key, event_type, purchase.order_id, requested_payment_id) on conflict do nothing;
  if not found then return jsonb_build_object('alreadyProcessed', true); end if;

  insert into public.payment_refunds(refund_id, order_id, payment_id, amount, status)
    values(requested_refund_id, purchase.order_id, requested_payment_id, refund_amount,
      case event_type when 'refund.processed' then 'processed' when 'refund.failed' then 'failed' else 'created' end)
    on conflict (refund_id) do update set status = excluded.status, amount = excluded.amount, updated_at = now();

  select coalesce(sum(amount), 0) into processed_total from public.payment_refunds
    where order_id = purchase.order_id and status = 'processed';
  processed_total := least(processed_total, purchase.amount);

  if event_type = 'refund.created' and processed_total = 0 then
    update public.payment_orders set status = 'refund_pending', updated_at = now() where order_id = purchase.order_id;
  elsif processed_total >= purchase.amount then
    if purchase.credits_reversed < purchase.credits then
      select interview_credits into available from public.account_entitlements where user_id = purchase.user_id for update;
      reversed := least(purchase.credits - purchase.credits_reversed, coalesce(available, 0));
      debt := purchase.credits - purchase.credits_reversed - reversed;
      update public.account_entitlements set interview_credits = interview_credits - reversed,
        credit_debt = credit_debt + debt, updated_at = now() where user_id = purchase.user_id;
    end if;
    update public.payment_orders set status = 'refunded', refunded_amount = processed_total,
      credits_reversed = credits, refunded_at = now(), updated_at = now() where order_id = purchase.order_id;
  elsif processed_total > 0 then
    update public.payment_orders set status = 'partially_refunded', refunded_amount = processed_total,
      updated_at = now() where order_id = purchase.order_id;
  elsif event_type = 'refund.failed' then
    update public.payment_orders set status = 'paid', updated_at = now() where order_id = purchase.order_id;
  end if;
  return jsonb_build_object('alreadyProcessed', false, 'refundedAmount', processed_total);
end;
$$;

create or replace function public.record_payment_dispute(
  event_key text, requested_dispute_id text, requested_payment_id text, dispute_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare purchase public.payment_orders;
begin
  select * into purchase from public.payment_orders where payment_id = requested_payment_id for update;
  if not found then raise exception 'Unknown disputed payment'; end if;
  insert into public.payment_webhook_events(event_key, event_type, order_id, payment_id)
    values(event_key, 'payment.dispute.created', purchase.order_id, requested_payment_id) on conflict do nothing;
  if not found then return; end if;
  update public.payment_orders set status = 'disputed', failure_reason = left(dispute_reason, 500), updated_at = now()
    where order_id = purchase.order_id and status <> 'refunded';
end;
$$;

create or replace function public.get_billing_account()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ent public.account_entitlements; purchases jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.account_entitlements (user_id) values (auth.uid()) on conflict do nothing;
  select * into ent from public.account_entitlements where user_id = auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object(
    'orderId', p.order_id, 'planId', p.plan_id, 'amount', p.amount, 'currency', p.currency,
    'credits', p.credits, 'status', p.status, 'paymentId', p.payment_id,
    'receiptNumber', p.receipt_number, 'refundedAmount', p.refunded_amount,
    'failureReason', p.failure_reason, 'createdAt', p.created_at, 'paidAt', p.paid_at
  ) order by p.created_at desc), '[]'::jsonb) into purchases
  from (select * from public.payment_orders where user_id = auth.uid() order by created_at desc limit 20) p;
  return jsonb_build_object(
    'creditsRemaining', ent.interview_credits, 'creditDebt', ent.credit_debt,
    'trialStatus', case when ent.trial_started_at is null then 'available'
      when ent.trial_consumed_at is not null or ent.trial_expires_at <= now() then 'used' else 'active' end,
    'trialStartedAt', ent.trial_started_at, 'trialExpiresAt', ent.trial_expires_at,
    'activeSessionSource', ent.active_session_source, 'purchases', purchases
  );
end;
$$;

create or replace function public.get_payment_receipt(requested_order_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare purchase public.payment_orders; plan_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into purchase from public.payment_orders where order_id = requested_order_id and user_id = auth.uid();
  if not found or purchase.payment_id is null then return null; end if;
  plan_name := case purchase.plan_id when 'starter' then '2 Interviews' when 'growth' then '5 Interviews' else '10 Interviews' end;
  return jsonb_build_object('receiptNumber', coalesce(purchase.receipt_number, purchase.order_id),
    'orderId', purchase.order_id, 'paymentId', purchase.payment_id, 'planName', plan_name,
    'credits', purchase.credits, 'amount', purchase.amount, 'currency', purchase.currency,
    'status', purchase.status, 'paidAt', purchase.paid_at, 'refundedAmount', purchase.refunded_amount);
end;
$$;

revoke all on function public.record_payment_order(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.fulfill_payment_order(text, text, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.record_payment_attempt_event(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.record_refund_event(text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.record_payment_dispute(text, text, text, text) from public, anon, authenticated;
revoke all on function public.get_billing_account() from public, anon;
revoke all on function public.get_payment_receipt(text) from public, anon;
grant execute on function public.record_payment_order(text, uuid, text, text) to service_role;
grant execute on function public.fulfill_payment_order(text, text, uuid, integer, text) to service_role;
grant execute on function public.record_payment_attempt_event(text, text, text, text, text) to service_role;
grant execute on function public.record_refund_event(text, text, text, text, integer) to service_role;
grant execute on function public.record_payment_dispute(text, text, text, text) to service_role;
grant execute on function public.get_billing_account() to authenticated;
grant execute on function public.get_payment_receipt(text) to authenticated;
