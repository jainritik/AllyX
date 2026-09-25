-- Account-synced interview setup used by the website and desktop app.
create table if not exists public.interview_setups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  job_context text not null check (char_length(job_context) between 11 and 12000),
  resume_content text not null check (char_length(resume_content) between 11 and 50000),
  interview_type text not null default 'Technical',
  language text not null default 'en-US',
  model text not null default 'openai/gpt-oss-120b',
  updated_at timestamp with time zone not null default now()
);

alter table public.interview_setups enable row level security;
revoke all on public.interview_setups from anon;
grant select, insert, update, delete on public.interview_setups to authenticated;

drop policy if exists "Users can view own interview setup." on public.interview_setups;
create policy "Users can view own interview setup." on public.interview_setups for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own interview setup." on public.interview_setups;
create policy "Users can insert own interview setup." on public.interview_setups for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own interview setup." on public.interview_setups;
create policy "Users can update own interview setup." on public.interview_setups for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete own interview setup." on public.interview_setups;
create policy "Users can delete own interview setup." on public.interview_setups for delete using (auth.uid() = user_id);
