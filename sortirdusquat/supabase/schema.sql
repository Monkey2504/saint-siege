-- Sortir du squat — schéma complet.
-- À exécuter dans l'éditeur SQL du projet Supabase (région européenne).

-- ---------------------------------------------------------------------------
-- Engagements citoyens
-- ---------------------------------------------------------------------------
create table if not exists public.pledges (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  name               text        not null,
  email              text        not null,
  phone              text,
  message            text,
  locale             text        not null default 'fr' check (locale in ('fr', 'nl', 'en')),
  consent_at         timestamptz not null,
  unsubscribe_token  text        not null unique
);

-- ---------------------------------------------------------------------------
-- Pistes de bâtiment
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  name               text        not null,
  email              text        not null,
  kind               text        not null check (kind in ('batiment', 'commune', 'congregation', 'architecte', 'autre')),
  description        text        not null,
  locale             text        not null default 'fr' check (locale in ('fr', 'nl', 'en')),
  consent_at         timestamptz not null,
  unsubscribe_token  text        not null unique
);

-- ---------------------------------------------------------------------------
-- Réglages : correction manuelle du compteur
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  key         text primary key,
  value       integer not null default 0,
  updated_at  timestamptz not null default now()
);

insert into public.settings (key, value)
values ('offline_pledges', 0)
on conflict (key) do nothing;

create index if not exists pledges_created_at_idx on public.pledges (created_at);
create index if not exists leads_created_at_idx   on public.leads (created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Aucune politique n'est créée : RLS activée sans politique signifie que les
-- rôles anon et authenticated ne peuvent ni lire ni écrire quoi que ce soit.
-- Seule la clé de service, utilisée par les routes serveur de l'application,
-- contourne la RLS. Le navigateur n'a jamais accès à ces tables.
-- ---------------------------------------------------------------------------
alter table public.pledges  enable row level security;
alter table public.leads    enable row level security;
alter table public.settings enable row level security;

alter table public.pledges  force row level security;
alter table public.leads    force row level security;
alter table public.settings force row level security;

revoke all on public.pledges  from anon, authenticated;
revoke all on public.leads    from anon, authenticated;
revoke all on public.settings from anon, authenticated;
