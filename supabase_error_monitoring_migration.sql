-- Aggregated, privacy-filtered production client errors. No transcript, resume,
-- question, request body, cookie, email, IP address, or account identifier is stored.
create table if not exists public.client_error_events (
  signature text primary key check (char_length(signature) = 64),
  error_name text not null check (char_length(error_name) between 1 and 80),
  message text not null check (char_length(message) between 1 and 300),
  stack_sample text check (char_length(stack_sample) <= 2000),
  route text not null check (char_length(route) between 1 and 300),
  release text not null check (char_length(release) between 1 and 40),
  runtime text not null check (runtime in ('desktop', 'browser')),
  occurrences bigint not null default 1 check (occurrences > 0),
  first_seen_at timestamp with time zone not null default now(),
  last_seen_at timestamp with time zone not null default now()
);

alter table public.client_error_events enable row level security;
revoke all on public.client_error_events from anon, authenticated;

create or replace function public.record_client_error(
  requested_signature text, requested_name text, requested_message text,
  requested_stack text, requested_route text, requested_release text, requested_runtime text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  insert into public.client_error_events(signature, error_name, message, stack_sample, route, release, runtime)
  values(requested_signature, requested_name, requested_message, requested_stack, requested_route, requested_release, requested_runtime)
  on conflict (signature) do update set occurrences = public.client_error_events.occurrences + 1,
    last_seen_at = now(), release = excluded.release, route = excluded.route, runtime = excluded.runtime;
end;
$$;

revoke all on function public.record_client_error(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_client_error(text, text, text, text, text, text, text) to service_role;
