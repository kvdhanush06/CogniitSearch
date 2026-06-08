create table if not exists public.users (
  id            uuid primary key,
  email         text,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists users_email_idx on public.users (email);

create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  title       text not null,
  query       text not null,
  status      text not null default 'pending' check (
                status in ('pending', 'processing', 'completed', 'failed')
              ),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists conversations_user_id_idx
  on public.conversations (user_id, created_at desc);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null,
  sources         jsonb,
  model           text,
  tokens_used     integer,
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx
  on public.messages (conversation_id, created_at);

create table if not exists public.sources (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  url             text not null,
  title           text not null,
  snippet         text,
  relevance_score real,
  domain          text,
  published_date  timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists sources_conversation_id_idx
  on public.sources (conversation_id);

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists users_touch on public.users;
create trigger users_touch
  before update on public.users
  for each row execute function public.touch_updated_at();

drop trigger if exists conversations_touch on public.conversations;
create trigger conversations_touch
  before update on public.conversations
  for each row execute function public.touch_updated_at();

alter table public.users         disable row level security;
alter table public.conversations disable row level security;
alter table public.messages      disable row level security;
alter table public.sources       disable row level security;