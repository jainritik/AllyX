-- Razorpay order ledger and idempotent interview-credit fulfillment.
-- Apply after supabase_trial_migration.sql.
create table if not exists public.payment_orders (
  order_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null check (plan_id in ('starter', 'growth', 'pro')),
  amount integer not null check (amount > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  credits integer not null check (credits > 0),
  status text not null default 'created' check (status in ('created', 'paid')),
  payment_id text unique,
  created_at timestamp with time zone not null default now(),
  paid_at timestamp with time zone
);
alter table public.payment_orders enable row level security;
revoke all on public.payment_orders from anon, authenticated;

create or replace function public.record_payment_order(requested_order_id text, expected_user_id uuid, requested_plan_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare selected_amount integer; selected_credits integer;
begin
  if expected_user_id is null then raise exception 'Account required'; end if;
  if requested_order_id !~ '^order_[A-Za-z0-9]+$' then raise exception 'Invalid order id'; end if;
  case requested_plan_id
    when 'starter' then selected_amount := 100000; selected_credits := 2;
    when 'growth' then selected_amount := 200000; selected_credits := 5;
    when 'pro' then selected_amount := 350000; selected_credits := 10;
    else raise exception 'Invalid plan';
  end case;
  insert into public.payment_orders (order_id, user_id, plan_id, amount, credits)
    values (requested_order_id, expected_user_id, requested_plan_id, selected_amount, selected_credits);
end;
$$;
revoke all on function public.record_payment_order(text, uuid, text) from public, anon, authenticated;
grant execute on function public.record_payment_order(text, uuid, text) to service_role;

create or replace function public.fulfill_payment_order(
  requested_order_id text,
  requested_payment_id text,
  expected_user_id uuid,
  captured_amount integer,
  captured_currency text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare purchase public.payment_orders; remaining integer;
begin
  select * into purchase from public.payment_orders where order_id = requested_order_id for update;
  if not found then raise exception 'Unknown payment order'; end if;
  if expected_user_id is not null and purchase.user_id <> expected_user_id then raise exception 'Payment owner mismatch'; end if;
  if captured_amount <> purchase.amount or captured_currency <> purchase.currency then raise exception 'Payment amount mismatch'; end if;
  if purchase.status = 'paid' then
    if purchase.payment_id <> requested_payment_id then raise exception 'Order already paid by another payment'; end if;
    select interview_credits into remaining from public.account_entitlements where user_id = purchase.user_id;
    return jsonb_build_object('success', true, 'alreadyProcessed', true, 'creditsAdded', purchase.credits, 'creditsRemaining', remaining);
  end if;

  insert into public.account_entitlements (user_id, interview_credits)
    values (purchase.user_id, purchase.credits)
    on conflict (user_id) do update set interview_credits = public.account_entitlements.interview_credits + excluded.interview_credits, updated_at = now()
    returning interview_credits into remaining;
  update public.payment_orders set status = 'paid', payment_id = requested_payment_id, paid_at = now()
    where order_id = requested_order_id;
  return jsonb_build_object('success', true, 'alreadyProcessed', false, 'creditsAdded', purchase.credits, 'creditsRemaining', remaining);
end;
$$;
revoke all on function public.fulfill_payment_order(text, text, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.fulfill_payment_order(text, text, uuid, integer, text) to service_role;
