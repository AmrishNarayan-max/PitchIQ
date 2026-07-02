-- PitchIQ database schema
-- Run this once in your Supabase project's SQL editor (Supabase dashboard -> SQL Editor -> New query).

create table if not exists evaluations (
  id bigint generated always as identity primary key,
  name text,
  snippet text not null,
  score int not null check (score >= 0 and score <= 100),
  level text not null check (level in ('good', 'neutral', 'bad')),
  created_at timestamptz not null default now()
);

-- Row Level Security stays ON with no public policies attached.
-- That means the table is completely inaccessible via the public "anon" key —
-- the only way in or out is through the serverless function, using the
-- service-role key, which never reaches the browser. This is the standard
-- pattern for "public-facing feature, private database."
alter table evaluations enable row level security;

-- Optional: keep the table small automatically. Uncomment to auto-delete
-- anything older than 30 days (nice for a demo project, not required).
-- create or replace function delete_old_evaluations() returns void as $$
--   delete from evaluations where created_at < now() - interval '30 days';
-- $$ language sql;
