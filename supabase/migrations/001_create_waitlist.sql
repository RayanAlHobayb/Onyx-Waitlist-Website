-- Create waitlist table
create table if not exists waitlist (
  id         uuid        primary key default gen_random_uuid(),
  full_name  text        not null,
  email      text        not null unique,
  neighborhood text      not null,
  created_at timestamptz not null    default now()
);

-- Index on email for fast lookups and duplicate checks
create index if not exists idx_waitlist_email on waitlist (email);

-- Enable Row Level Security
alter table waitlist enable row level security;

-- Policy: allow inserts from the anon key (public sign-ups)
create policy "Allow public inserts"
  on waitlist
  for insert
  to anon
  with check (true);

-- Policy: only the service role can read rows
create policy "Service role can read"
  on waitlist
  for select
  to service_role
  using (true);
