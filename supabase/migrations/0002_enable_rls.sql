-- Defense in depth: the backend uses the Supabase service role for server-side
-- operations, which bypasses RLS. Enabling RLS prevents accidental exposure if
-- these tables are ever accessed through an anon/authenticated Supabase client.
alter table public.users enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.sources enable row level security;
