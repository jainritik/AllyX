-- Authenticated product bug reports with private screenshot/video attachments.
-- Apply after supabase_billing_support_migration.sql.
create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reporter_name text not null check (char_length(reporter_name) between 2 and 120),
  contact_email text,
  contact_phone text,
  title text not null check (char_length(title) between 5 and 160),
  description text not null check (char_length(description) between 20 and 5000),
  attachment_path text,
  attachment_name text,
  attachment_type text,
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'closed')),
  email_status text not null default 'pending' check (email_status in ('pending', 'sending', 'sent', 'failed')),
  email_attempts integer not null default 0 check (email_attempts >= 0),
  email_last_attempt_at timestamp with time zone,
  email_sent_at timestamp with time zone,
  email_error text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (contact_email is not null or contact_phone is not null),
  check ((attachment_path is null and attachment_name is null and attachment_type is null)
    or (attachment_path is not null and attachment_name is not null and attachment_type is not null))
);

create index if not exists bug_reports_user_created_idx on public.bug_reports(user_id, created_at desc);
alter table public.bug_reports enable row level security;
revoke all on public.bug_reports from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bug-report-attachments', 'bug-report-attachments', false, 26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Bug report owners can upload attachments" on storage.objects;
create policy "Bug report owners can upload attachments" on storage.objects for insert to authenticated
with check (bucket_id = 'bug-report-attachments' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "Bug report owners can remove attachments" on storage.objects;
create policy "Bug report owners can remove attachments" on storage.objects for delete to authenticated
using (bucket_id = 'bug-report-attachments' and (storage.foldername(name))[1] = (select auth.uid()::text));

create or replace function public.create_bug_report(
  requested_name text, requested_email text, requested_phone text, requested_title text,
  requested_description text, requested_attachment_path text, requested_attachment_name text,
  requested_attachment_type text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare report_id uuid; recent_count integer; account_email text; stored_type text; stored_size bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  requested_name := trim(requested_name);
  requested_email := nullif(lower(trim(requested_email)), '');
  requested_phone := nullif(trim(requested_phone), '');
  requested_title := trim(requested_title);
  requested_description := trim(requested_description);
  if char_length(requested_name) < 2 or char_length(requested_name) > 120 then raise exception 'Invalid name'; end if;
  if requested_email is not null and requested_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid email'; end if;
  if requested_phone is not null and (char_length(requested_phone) < 7 or char_length(requested_phone) > 30) then raise exception 'Invalid phone'; end if;
  if requested_email is null and requested_phone is null then
    select email into account_email from auth.users where id = auth.uid();
    requested_email := account_email;
  end if;
  if requested_email is null and requested_phone is null then raise exception 'Contact details required'; end if;
  if char_length(requested_title) < 5 or char_length(requested_title) > 160 then raise exception 'Invalid title'; end if;
  if char_length(requested_description) < 20 or char_length(requested_description) > 5000 then raise exception 'Invalid description'; end if;
  if requested_attachment_path is not null then
    if requested_attachment_path not like auth.uid()::text || '/%' then raise exception 'Invalid attachment owner'; end if;
    if char_length(requested_attachment_path) > 500 or char_length(requested_attachment_name) > 255
      or requested_attachment_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
        'video/mp4', 'video/webm', 'video/quicktime') then raise exception 'Invalid attachment'; end if;
    select metadata->>'mimetype', nullif(metadata->>'size', '')::bigint into stored_type, stored_size
      from storage.objects
      where bucket_id = 'bug-report-attachments' and name = requested_attachment_path;
    if not found or stored_type is distinct from requested_attachment_type or coalesce(stored_size, 26214401) > 26214400 then
      raise exception 'Attachment was not uploaded correctly';
    end if;
  elsif requested_attachment_name is not null or requested_attachment_type is not null then
    raise exception 'Incomplete attachment';
  end if;
  select count(*) into recent_count from public.bug_reports
    where user_id = auth.uid() and created_at > now() - interval '24 hours';
  if recent_count >= 10 then raise exception 'Bug report limit reached'; end if;
  insert into public.bug_reports(user_id, reporter_name, contact_email, contact_phone, title, description,
    attachment_path, attachment_name, attachment_type)
  values(auth.uid(), requested_name, requested_email, requested_phone, requested_title, requested_description,
    requested_attachment_path, requested_attachment_name, requested_attachment_type)
  returning id into report_id;
  return report_id;
end;
$$;

create or replace function public.get_bug_reports()
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare reports jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', rows.id, 'title', rows.title, 'description', rows.description, 'attachmentName', rows.attachment_name,
    'status', rows.status, 'createdAt', rows.created_at, 'updatedAt', rows.updated_at
  ) order by rows.created_at desc), '[]'::jsonb) into reports
  from (select * from public.bug_reports where user_id = auth.uid() order by created_at desc limit 50) rows;
  return reports;
end;
$$;

create or replace function public.claim_bug_report_email(requested_report_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare report public.bug_reports;
begin
  update public.bug_reports set email_status = 'sending', email_attempts = email_attempts + 1,
    email_last_attempt_at = now(), email_error = null, updated_at = now()
  where id = requested_report_id and email_sent_at is null and email_attempts < 5
    and (email_status in ('pending', 'failed') or
      (email_status = 'sending' and email_last_attempt_at < now() - interval '10 minutes'))
  returning * into report;
  if not found then return null; end if;
  return jsonb_build_object('id', report.id, 'userId', report.user_id, 'name', report.reporter_name,
    'email', report.contact_email, 'phone', report.contact_phone, 'title', report.title,
    'description', report.description, 'attachmentPath', report.attachment_path,
    'attachmentName', report.attachment_name, 'attachmentType', report.attachment_type,
    'createdAt', report.created_at);
end;
$$;

create or replace function public.complete_bug_report_email(
  requested_report_id uuid, delivered boolean, delivery_error text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.bug_reports set email_status = case when delivered then 'sent' else 'failed' end,
    email_sent_at = case when delivered then now() else email_sent_at end,
    email_error = case when delivered then null else left(coalesce(delivery_error, 'Email delivery failed'), 500) end,
    updated_at = now()
  where id = requested_report_id and email_status = 'sending';
end;
$$;

revoke all on function public.create_bug_report(text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.get_bug_reports() from public, anon;
revoke all on function public.claim_bug_report_email(uuid) from public, anon, authenticated;
revoke all on function public.complete_bug_report_email(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.create_bug_report(text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.get_bug_reports() to authenticated;
grant execute on function public.claim_bug_report_email(uuid) to service_role;
grant execute on function public.complete_bug_report_email(uuid, boolean, text) to service_role;
