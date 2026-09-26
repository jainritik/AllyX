-- Accounts that successfully purchase an interview pack are no longer eligible
-- to start the introductory trial. Apply after the payment lifecycle migration.
create or replace function public.consume_trial_after_purchase()
returns trigger language plpgsql security definer set search_path = '' as $$
declare purchased_at timestamp with time zone;
begin
  if new.status not in ('paid', 'refund_pending', 'partially_refunded', 'refunded', 'disputed') then
    return new;
  end if;
  purchased_at := coalesce(new.paid_at, new.updated_at, new.created_at, now());
  insert into public.account_entitlements (user_id, trial_started_at, trial_expires_at, trial_consumed_at)
    values (new.user_id, purchased_at, purchased_at, purchased_at)
    on conflict (user_id) do update set
      trial_started_at = coalesce(public.account_entitlements.trial_started_at, purchased_at),
      trial_expires_at = coalesce(public.account_entitlements.trial_expires_at, purchased_at),
      trial_consumed_at = coalesce(public.account_entitlements.trial_consumed_at, purchased_at),
      updated_at = now();
  return new;
end;
$$;
revoke all on function public.consume_trial_after_purchase() from public, anon, authenticated;

drop trigger if exists consume_trial_after_purchase_trigger on public.payment_orders;
create trigger consume_trial_after_purchase_trigger
after insert or update of status on public.payment_orders
for each row execute function public.consume_trial_after_purchase();

insert into public.account_entitlements (user_id, trial_started_at, trial_expires_at, trial_consumed_at)
select user_id, purchased_at, purchased_at, purchased_at
from (
  select user_id, min(coalesce(paid_at, updated_at, created_at, now())) as purchased_at
  from public.payment_orders
  where status in ('paid', 'refund_pending', 'partially_refunded', 'refunded', 'disputed')
  group by user_id
) purchases
on conflict (user_id) do update set
  trial_started_at = coalesce(public.account_entitlements.trial_started_at, excluded.trial_started_at),
  trial_expires_at = coalesce(public.account_entitlements.trial_expires_at, excluded.trial_expires_at),
  trial_consumed_at = coalesce(public.account_entitlements.trial_consumed_at, excluded.trial_consumed_at),
  updated_at = now();
