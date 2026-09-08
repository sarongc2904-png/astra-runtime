-- Phase 1 sidecar only. Does not change public.kb_chunks or its RPCs.
-- Filename aligned with the version returned by remote migration history.
-- Tenant names/memberships must be supplied explicitly; no default tenant.
create schema library_ingest;
revoke all on schema library_ingest from public, anon, authenticated;
grant usage on schema library_ingest to service_role, authenticated;

create table library_ingest.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(trim(name))>0),
  created_at timestamptz not null default now()
);
create table library_ingest.tenant_memberships (
  tenant_id uuid not null references library_ingest.tenants(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check(role in ('reader','reviewer','admin')),
  primary key(tenant_id,user_id)
);
create index library_membership_user on library_ingest.tenant_memberships(user_id,tenant_id);

create table library_ingest.processing_runs (
  id uuid primary key,
  tenant_id uuid not null references library_ingest.tenants(id) on delete restrict,
  pipeline_version text not null,
  command text not null,
  config jsonb not null default '{}'::jsonb,
  status text not null check(status in ('running','completed','failed')),
  started_at timestamptz not null,
  completed_at timestamptz,
  unique(tenant_id,id)
);
create table library_ingest.source_assets (
  id uuid primary key,
  tenant_id uuid not null references library_ingest.tenants(id) on delete restrict,
  source_type text not null check(source_type in ('book','course_transcript','slide_deck','image','article','internal_document','other')),
  title text not null,
  author_or_instructor text,
  edition text,
  metadata_origin text not null,
  mime_type text,
  file_sha256 text not null check(file_sha256 ~ '^[a-f0-9]{64}$'),
  file_size_bytes bigint not null check(file_size_bytes>=0),
  page_count integer check(page_count>0),
  status text not null default 'active' check(status in ('active','archived','deprecated','quarantined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,id), unique(tenant_id,file_sha256)
);
-- Every original path remains discoverable even when bytes are identical.
create table library_ingest.source_occurrences (
  tenant_id uuid not null references library_ingest.tenants(id) on delete restrict,
  source_asset_id uuid not null,
  original_path text not null,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  primary key(tenant_id,source_asset_id,original_path),
  foreign key(tenant_id,source_asset_id) references library_ingest.source_assets(tenant_id,id) on delete restrict
);
create table library_ingest.source_pages (
  id uuid primary key,
  tenant_id uuid not null references library_ingest.tenants(id) on delete restrict,
  source_asset_id uuid not null,
  page_index integer not null check(page_index>=0),
  printed_page_number text,
  page_image_path text not null,
  render_profile jsonb not null,
  raster_sha256 text not null check(raster_sha256 ~ '^[a-f0-9]{64}$'),
  perceptual_hash text not null check(perceptual_hash ~ '^[a-f0-9]{16}$'),
  dhash text not null check(dhash ~ '^[a-f0-9]{16}$'),
  width integer not null check(width>0), height integer not null check(height>0),
  information_std numeric not null check(information_std>=0),
  canonical_page_id uuid,
  duplicate_status text not null check(duplicate_status in ('unknown','unique','confirmed_duplicate','probable_duplicate','low_information','related_not_duplicate')),
  review_status text not null check(review_status in ('pending','auto_accepted','human_approved','human_rejected')),
  unique(tenant_id,id), unique(tenant_id,source_asset_id,page_index,render_profile),
  foreign key(tenant_id,source_asset_id) references library_ingest.source_assets(tenant_id,id) on delete restrict,
  foreign key(tenant_id,canonical_page_id) references library_ingest.source_pages(tenant_id,id) on delete restrict deferrable initially deferred
);
create index library_pages_canonical on library_ingest.source_pages(tenant_id,canonical_page_id);
create index library_pages_raster on library_ingest.source_pages(tenant_id,raster_sha256);

create table library_ingest.page_duplicate_candidates (
  id uuid primary key,
  tenant_id uuid not null references library_ingest.tenants(id) on delete restrict,
  page_a_id uuid not null, page_b_id uuid not null,
  exact_hash_match boolean not null,
  perceptual_distance integer not null check(perceptual_distance between 0 and 64),
  dhash_distance integer not null check(dhash_distance between 0 and 64),
  text_similarity numeric check(text_similarity between 0 and 1),
  proposed_relation text not null check(proposed_relation in ('exact_duplicate','probable_duplicate','same_content_different_edition','related','not_duplicate')),
  decision text not null check(decision in ('pending','accepted','rejected')),
  method text not null,
  reviewed_by text, reviewed_at timestamptz, review_notes text,
  check(page_a_id<page_b_id),
  check(decision='pending' or (reviewed_by is not null and reviewed_at is not null)),
  unique(tenant_id,id), unique(tenant_id,page_a_id,page_b_id),
  foreign key(tenant_id,page_a_id) references library_ingest.source_pages(tenant_id,id) on delete restrict,
  foreign key(tenant_id,page_b_id) references library_ingest.source_pages(tenant_id,id) on delete restrict
);
create index library_candidates_b on library_ingest.page_duplicate_candidates(tenant_id,page_b_id);
create table library_ingest.review_events (
  id uuid primary key,
  tenant_id uuid not null references library_ingest.tenants(id) on delete restrict,
  candidate_id uuid not null,
  previous_decision text not null check(previous_decision in ('pending','accepted','rejected')),
  decision text not null check(decision in ('accepted','rejected')),
  reviewed_by text not null, reviewed_at timestamptz not null, notes text not null,
  foreign key(tenant_id,candidate_id) references library_ingest.page_duplicate_candidates(tenant_id,id) on delete restrict
);
create index library_review_candidate on library_ingest.review_events(tenant_id,candidate_id);

create function library_ingest.touch_updated_at() returns trigger
language plpgsql security invoker set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
create trigger library_asset_timestamp before update on library_ingest.source_assets
for each row execute function library_ingest.touch_updated_at();
revoke all on function library_ingest.touch_updated_at() from public,anon,authenticated;

-- Deny by default, then grant only membership-filtered reading. No client writes.
alter table library_ingest.tenants enable row level security;
alter table library_ingest.tenant_memberships enable row level security;
create policy library_membership_self on library_ingest.tenant_memberships for select to authenticated
using(user_id=(select auth.uid()));
create policy library_tenants_member on library_ingest.tenants for select to authenticated
using(id in (select tenant_id from library_ingest.tenant_memberships where user_id=(select auth.uid())));
do $$
declare t text;
begin
  foreach t in array array['processing_runs','source_assets','source_occurrences','source_pages','page_duplicate_candidates','review_events'] loop
    execute format('alter table library_ingest.%I enable row level security',t);
    execute format('create policy library_member_read on library_ingest.%I for select to authenticated using (tenant_id in (select tenant_id from library_ingest.tenant_memberships where user_id=(select auth.uid())))',t);
  end loop;
end $$;
revoke all on all tables in schema library_ingest from public,anon,authenticated;
grant select on all tables in schema library_ingest to authenticated;
grant select,insert,update on all tables in schema library_ingest to service_role;
revoke update on library_ingest.review_events from service_role;
-- No buckets, exposed schemas, old RAG functions, embeddings or new tenants are changed here.
