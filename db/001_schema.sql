-- =====================================================================
-- Research Opportunity Aggregation & Discovery Platform
-- Supabase / Postgres schema  ·  migration 001
-- Apply with: psql "$SUPABASE_DB_URL" -f db/001_schema.sql
-- (or paste into Supabase Studio -> SQL Editor)
-- =====================================================================

create extension if not exists pg_trgm;

-- ---------- enums ----------------------------------------------------
do $$ begin
  create type opp_type as enum (
    'scholarship','fellowship','research_internship','internship','grant',
    'assistantship','exchange','summer_school','competition','conference',
    'award','training','job','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type degree_level as enum (
    'high_school','bachelors','masters','phd','postdoc','faculty','any');
exception when duplicate_object then null; end $$;

do $$ begin
  create type funding_kind as enum (
    'fully_funded','partially_funded','stipend_only','tuition_waiver',
    'travel_only','unfunded','unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deadline_kind as enum ('fixed','rolling','varies','unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type opp_status as enum (
    'active','closing_soon','expired','dead_link','needs_review','suppressed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type source_kind as enum (
    'wp_rest','rss','json_api','post_api','html');
exception when duplicate_object then null; end $$;

-- ---------- 1. source registry ---------------------------------------
-- Every fetch in the system is driven by a row here. Adding a source is an
-- INSERT, never a new workflow, for wp_rest / rss / json_api kinds.
create table if not exists sources (
  slug              text primary key,
  name              text not null,
  kind              source_kind not null,
  base_url          text not null,
  config            jsonb not null default '{}'::jsonb,
  -- config keys by kind:
  --  wp_rest : {per_page, exclude_categories[], category_map{}, needs_detail:bool}
  --  rss     : {feed_urls[]}
  --  json_api: {paths[], query{}, item_path, page_param, page_size}
  --  post_api: {path, body_template{}, keyword_matrix[], item_path, page_param}
  authority_tier    smallint not null default 3,   -- 1 = primary funder, 2 = govt/uni, 3 = aggregator
  trust_score       numeric(3,2) not null default 0.60,
  enabled           boolean not null default true,
  cadence_cron      text not null default '0 2 * * *',
  robots_ok         boolean not null default true,
  tos_note          text,
  last_run_at       timestamptz,
  last_success_at   timestamptz,     -- high-water mark used for incremental fetches
  last_error        text,
  consecutive_fails smallint not null default 0,
  created_at        timestamptz not null default now()
);

-- ---------- 2. raw landing zone --------------------------------------
-- Append-only. Lets us re-classify or re-parse without re-crawling, which is
-- both polite to the sources and how you recover from a bad prompt version.
create table if not exists raw_items (
  id             bigserial primary key,
  source_slug    text not null references sources(slug) on delete cascade,
  external_id    text not null,            -- WP post id, grants.gov oppId, RSS guid…
  url            text,
  payload        jsonb not null,           -- list-level record, verbatim
  detail         jsonb,                    -- parsed detail page (W03), null until enriched
  content_hash   text not null,            -- sha of payload+detail: skip unchanged work
  needs_detail   boolean not null default false,
  detail_fetched_at timestamptz,
  detail_error   text,
  classified_at  timestamptz,
  classifier_version text,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  unique (source_slug, external_id)
);
create index if not exists raw_items_todo_detail on raw_items (source_slug)
  where needs_detail and detail_fetched_at is null;
create index if not exists raw_items_todo_class on raw_items (id) where classified_at is null;

-- ---------- 3. canonical opportunities -------------------------------
create table if not exists opportunities (
  id                bigserial primary key,
  fingerprint       text not null unique,   -- cross-source identity (lib_html.fingerprint)
  title             text not null,
  organisation      text,
  opportunity_type  opp_type not null default 'other',
  degree_levels     degree_level[] not null default '{}',
  fields_of_study   text[] not null default '{}',   -- controlled list, see 003 seed
  host_country      text,
  host_region       text,
  is_remote         boolean default false,
  funding_kind      funding_kind not null default 'unknown',
  funding_detail    text,
  stipend_amount    numeric,
  stipend_currency  text,
  deadline          date,
  deadline_kind     deadline_kind not null default 'unknown',
  deadline_note     text,
  duration_text     text,
  summary           text,
  eligibility       text,
  eligibility_flags jsonb not null default '{}'::jsonb,  -- {min_gpa, languages[], nationalities[], age_max, needs_gre…}
  benefits          text,
  how_to_apply      text,
  documents         text,
  apply_link        text,
  image_url         text,
  status            opp_status not null default 'active',
  confidence        numeric(3,2) not null default 0.50,
  primary_source    text references sources(slug),
  canonical_url     text,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  last_verified_at  timestamptz,
  link_checked_at   timestamptz,
  link_status       smallint,
  classifier_version text,
  search_tsv        tsvector generated always as (
                      to_tsvector('english',
                        coalesce(title,'') || ' ' || coalesce(organisation,'') || ' ' ||
                        coalesce(summary,'') || ' ' || coalesce(eligibility,''))) stored
);
create index if not exists opportunities_deadline    on opportunities (deadline) where status = 'active';
create index if not exists opportunities_status       on opportunities (status);
create index if not exists opportunities_degree       on opportunities using gin (degree_levels);
create index if not exists opportunities_fields       on opportunities using gin (fields_of_study);
create index if not exists opportunities_search       on opportunities using gin (search_tsv);
create index if not exists opportunities_title_trgm   on opportunities using gin (title gin_trgm_ops);

-- 3b. provenance: one opportunity may be reported by several sources
create table if not exists opportunity_sources (
  opportunity_id bigint not null references opportunities(id) on delete cascade,
  source_slug    text   not null references sources(slug)     on delete cascade,
  raw_item_id    bigint references raw_items(id) on delete set null,
  source_url     text,
  reported_at    timestamptz not null default now(),
  primary key (opportunity_id, source_slug)
);

-- ---------- 4. classifier audit trail --------------------------------
create table if not exists classifications (
  id            bigserial primary key,
  raw_item_id   bigint not null references raw_items(id) on delete cascade,
  model         text not null,
  version       text not null,
  input_tokens  int,
  output_tokens int,
  output        jsonb not null,
  latency_ms    int,
  created_at    timestamptz not null default now()
);

-- ---------- 5. students & matching -----------------------------------
create table if not exists student_profiles (
  id             bigserial primary key,
  portal_user_id text unique,              -- id from the existing university portal
  email          text,
  current_level  degree_level not null default 'bachelors',
  target_levels  degree_level[] not null default '{}',
  fields_of_study text[] not null default '{}',
  nationality    text,
  gpa            numeric(4,2),
  countries_preferred text[] not null default '{}',
  funding_required boolean not null default true,
  keywords       text[] not null default '{}',
  digest_optin   boolean not null default true,
  digest_cadence text not null default 'weekly',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists matches (
  student_id     bigint not null references student_profiles(id) on delete cascade,
  opportunity_id bigint not null references opportunities(id)    on delete cascade,
  score          numeric(4,3) not null,
  reasons        jsonb not null default '[]'::jsonb,
  surfaced_at    timestamptz,
  clicked_at     timestamptz,
  dismissed_at   timestamptz,
  computed_at    timestamptz not null default now(),
  primary key (student_id, opportunity_id)
);
create index if not exists matches_student_score on matches (student_id, score desc);

create table if not exists digest_log (
  id           bigserial primary key,
  student_id   bigint references student_profiles(id) on delete cascade,
  sent_at      timestamptz not null default now(),
  channel      text not null default 'email',
  opportunity_ids bigint[] not null default '{}',
  status       text not null default 'sent',
  error        text
);

-- ---------- 6. observability -----------------------------------------
create table if not exists run_log (
  id           bigserial primary key,
  workflow     text not null,
  source_slug  text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  items_seen   int default 0,
  items_new    int default 0,
  items_updated int default 0,
  items_failed int default 0,
  status       text not null default 'running',
  notes        jsonb not null default '{}'::jsonb
);
create index if not exists run_log_recent on run_log (workflow, started_at desc);
