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
