-- Idempotent payment-confirmation email outbox.
-- Apply after supabase_payment_lifecycle_migration.sql.
alter table public.payment_orders
  add column if not exists confirmation_email_status text not null default 'pending'
    check (confirmation_email_status in ('pending', 'sending', 'sent', 'failed')),
  add column if not exists confirmation_email_attempts integer not null default 0 check (confirmation_email_attempts >= 0),
  add column if not exists confirmation_email_last_attempt_at timestamp with time zone,
  add column if not exists confirmation_email_sent_at timestamp with time zone,
  add column if not exists confirmation_email_error text;

create or replace function public.claim_payment_confirmation_email(requested_order_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare purchase public.payment_orders; remaining integer;
begin
  update public.payment_orders
  set confirmation_email_status = 'sending',
      confirmation_email_attempts = confirmation_email_attempts + 1,
      confirmation_email_last_attempt_at = now(),
      confirmation_email_error = null,
      updated_at = now()
  where order_id = requested_order_id
    and status in ('paid', 'refund_pending', 'partially_refunded', 'refunded', 'disputed')
    and confirmation_email_sent_at is null
    and confirmation_email_attempts < 5
    and (confirmation_email_status in ('pending', 'failed')
      or (confirmation_email_status = 'sending' and confirmation_email_last_attempt_at < now() - interval '10 minutes'))
  returning * into purchase;
  if not found then return null; end if;

  select interview_credits into remaining
    from public.account_entitlements where user_id = purchase.user_id;
  return jsonb_build_object(
    'userId', purchase.user_id,
    'orderId', purchase.order_id,
    'paymentId', purchase.payment_id,
    'planId', purchase.plan_id,
    'amount', purchase.amount,
    'currency', purchase.currency,
    'credits', purchase.credits,
    'creditsRemaining', coalesce(remaining, 0),
    'receiptNumber', coalesce(purchase.receipt_number, purchase.order_id)
  );
end;
$$;

create or replace function public.complete_payment_confirmation_email(
  requested_order_id text, delivered boolean, delivery_error text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.payment_orders
  set confirmation_email_status = case when delivered then 'sent' else 'failed' end,
      confirmation_email_sent_at = case when delivered then now() else confirmation_email_sent_at end,
      confirmation_email_error = case when delivered then null else left(coalesce(delivery_error, 'Email delivery failed'), 500) end,
      updated_at = now()
  where order_id = requested_order_id and confirmation_email_status = 'sending';
end;
$$;

revoke all on function public.claim_payment_confirmation_email(text) from public, anon, authenticated;
revoke all on function public.complete_payment_confirmation_email(text, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_payment_confirmation_email(text) to service_role;
grant execute on function public.complete_payment_confirmation_email(text, boolean, text) to service_role;
