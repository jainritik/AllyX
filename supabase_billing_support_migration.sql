-- Authenticated payment, refund, credit and technical support requests.
-- Apply after supabase_payment_lifecycle_migration.sql.
create table if not exists public.billing_support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('payment', 'refund', 'credits', 'technical', 'other')),
  order_id text references public.payment_orders(order_id) on delete set null,
  message text not null check (char_length(message) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'closed')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists billing_support_requests_user_created_idx
  on public.billing_support_requests(user_id, created_at desc);

alter table public.billing_support_requests enable row level security;
revoke all on public.billing_support_requests from anon, authenticated;

create or replace function public.create_billing_support_request(
  requested_category text, requested_order_id text, requested_message text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare request_id uuid; owned_order public.payment_orders; recent_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if requested_category not in ('payment', 'refund', 'credits', 'technical', 'other') then raise exception 'Invalid support category'; end if;
  requested_message := trim(requested_message);
  if char_length(requested_message) < 10 or char_length(requested_message) > 2000 then raise exception 'Message must be between 10 and 2000 characters'; end if;
  if requested_order_id is not null and requested_order_id <> '' then
    select * into owned_order from public.payment_orders where order_id = requested_order_id and user_id = auth.uid();
    if not found then raise exception 'Payment order not found'; end if;
  elsif requested_category in ('payment', 'refund') then
    raise exception 'Select a payment order';
  else
    requested_order_id := null;
  end if;
  select count(*) into recent_count from public.billing_support_requests
    where user_id = auth.uid() and created_at > now() - interval '24 hours';
  if recent_count >= 5 then raise exception 'Support request limit reached'; end if;
  insert into public.billing_support_requests(user_id, category, order_id, message)
    values(auth.uid(), requested_category, requested_order_id, requested_message)
    returning id into request_id;
  return request_id;
end;
$$;

create or replace function public.get_billing_support_requests()
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare requests jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', rows.id, 'category', rows.category, 'orderId', rows.order_id, 'message', rows.message,
    'status', rows.status, 'createdAt', rows.created_at, 'updatedAt', rows.updated_at
  ) order by rows.created_at desc), '[]'::jsonb) into requests
  from (select * from public.billing_support_requests where user_id = auth.uid() order by created_at desc limit 50) as rows;
  return requests;
end;
$$;

revoke all on function public.create_billing_support_request(text, text, text) from public, anon;
revoke all on function public.get_billing_support_requests() from public, anon;
grant execute on function public.create_billing_support_request(text, text, text) to authenticated;
grant execute on function public.get_billing_support_requests() to authenticated;
