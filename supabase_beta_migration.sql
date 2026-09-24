-- Apply in the Supabase SQL editor before deploying the guarded API routes.
-- Inspect current policies first; this migration is idempotent for this schema.
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
drop policy if exists "Users can insert their own profile." on public.profiles;
drop policy if exists "Users can insert own profile." on public.profiles;
drop policy if exists "Users can view own profile." on public.profiles;
create policy "Users can view own profile." on public.profiles
  for select using (auth.uid() = id);

-- RLS filters rows, not columns. Never grant the browser UPDATE on entitlement.
revoke update on public.profiles from anon, authenticated;
revoke insert on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

create table if not exists public.api_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  request_kind text not null check (request_kind in ('generate', 'transcribe')),
  requests integer not null default 0 check (requests >= 0),
  primary key (user_id, usage_day, request_kind)
);
alter table public.api_daily_usage enable row level security;
revoke all on public.api_daily_usage from anon, authenticated;

create or replace function public.consume_api_quota(request_kind text, daily_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  updated_count integer;
  maximum integer;
begin
  if account_id is null then raise exception 'Authentication required'; end if;
  if request_kind = 'generate' then maximum := 300;
  elsif request_kind = 'transcribe' then maximum := 1200;
  else raise exception 'Invalid request kind'; end if;
  -- The caller cannot raise its own limit by supplying a larger number.
  maximum := least(maximum, greatest(0, daily_limit));
  insert into public.api_daily_usage (user_id, usage_day, request_kind, requests)
    values (account_id, (now() at time zone 'utc')::date, request_kind, 1)
    on conflict on constraint api_daily_usage_pkey do update
      set requests = public.api_daily_usage.requests + 1
      where public.api_daily_usage.requests < maximum
    returning requests into updated_count;
  return updated_count is not null;
end;
$$;
revoke all on function public.consume_api_quota(text, integer) from public, anon;
grant execute on function public.consume_api_quota(text, integer) to authenticated;

drop function if exists public.refund_api_quota(text);
create table if not exists public.api_quota_reservations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  request_kind text not null check (request_kind in ('generate', 'transcribe')),
  created_at timestamp with time zone not null default now()
);
alter table public.api_quota_reservations enable row level security;
revoke all on public.api_quota_reservations from anon, authenticated;

create or replace function public.reserve_api_quota(requested_kind text, daily_limit integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  updated_count integer;
  maximum integer;
  reservation_id uuid;
begin
  if account_id is null then raise exception 'Authentication required'; end if;
  -- Finished and abandoned reservations have already been counted. Remove old
  -- tokens so the private ledger cannot grow without bound.
  delete from public.api_quota_reservations where created_at < now() - interval '1 day';
  if requested_kind = 'generate' then maximum := 300;
  elsif requested_kind = 'transcribe' then maximum := 1200;
  else raise exception 'Invalid request kind'; end if;
  maximum := least(maximum, greatest(0, daily_limit));
  insert into public.api_daily_usage (user_id, usage_day, request_kind, requests)
    values (account_id, (now() at time zone 'utc')::date, requested_kind, 1)
    on conflict on constraint api_daily_usage_pkey do update
      set requests = public.api_daily_usage.requests + 1
      where public.api_daily_usage.requests < maximum
    returning requests into updated_count;
  if updated_count is null then return null; end if;
  insert into public.api_quota_reservations (user_id, usage_day, request_kind)
    values (account_id, (now() at time zone 'utc')::date, requested_kind)
    returning id into reservation_id;
  return reservation_id;
end;
$$;
revoke all on function public.reserve_api_quota(text, integer) from public, anon;
grant execute on function public.reserve_api_quota(text, integer) to authenticated;

create or replace function public.refund_api_quota(reservation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  reserved record;
begin
  delete from public.api_quota_reservations
   where id = reservation_id and user_id = auth.uid()
   returning user_id, usage_day, request_kind into reserved;
  if not found then return; end if;
  update public.api_daily_usage set requests = greatest(0, requests - 1)
   where user_id = reserved.user_id and usage_day = reserved.usage_day and request_kind = reserved.request_kind;
end;
$$;
revoke all on function public.refund_api_quota(uuid) from public, anon;
grant execute on function public.refund_api_quota(uuid) to authenticated;

create or replace function public.commit_api_quota(reservation_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.api_quota_reservations where id = reservation_id and user_id = auth.uid();
$$;
revoke all on function public.commit_api_quota(uuid) from public, anon;
grant execute on function public.commit_api_quota(uuid) to authenticated;

drop policy if exists "Users can update own interviews." on public.interviews;
create policy "Users can update own interviews." on public.interviews
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Serialize inserts for the same account so simultaneous uploads cannot
-- bypass the ten-resume limit enforced by the browser UI.
create or replace function public.enforce_resume_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.profiles where id = new.user_id for update;
  if (select count(*) from public.resumes where user_id = new.user_id) >= 10 then
    raise exception 'Maximum of 10 resumes allowed';
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_resume_limit_before_insert on public.resumes;
create trigger enforce_resume_limit_before_insert before insert on public.resumes
for each row execute function public.enforce_resume_limit();
revoke all on function public.enforce_resume_limit() from public, anon, authenticated;
