-- Logical organizations within the private inventory, not Supabase platform organizations.
-- Version aligned with the applied remote migration history.
alter table library_ingest.tenants
  add column slug text unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add column organization_type text not null default 'organization'
    check(organization_type in ('system','organization')),
  add constraint library_system_slug check(organization_type <> 'system' or slug is not null),
  add constraint library_tenant_type_unique unique(id,organization_type);

alter table library_ingest.source_assets
  add column organization_type text not null default 'organization',
  add column scope text not null default 'organization'
    check(scope in ('system','organization','private')),
  add column owner_user_id uuid references auth.users(id) on delete restrict,
  add column metadata jsonb not null default '{}'::jsonb,
  add constraint library_asset_organization_type foreign key(tenant_id,organization_type)
    references library_ingest.tenants(id,organization_type) on delete restrict,
  add constraint library_asset_scope_type check(
    (organization_type='system' and scope='system') or
    (organization_type='organization' and scope in ('organization','private'))),
  add constraint library_private_owner check(
    (scope='private' and owner_user_id is not null) or
    (scope<>'private' and owner_user_id is null));
create index library_asset_owner on library_ingest.source_assets(owner_user_id) where owner_user_id is not null;
create index library_asset_organization_type on library_ingest.source_assets(tenant_id,organization_type);

-- Inventory envelope preserves unavailable paths, original metadata and reference-only URLs.
-- Backend-only: an envelope may contain provenance of multiple access scopes.
create table library_ingest.inventory_snapshots (
  id uuid primary key,
  tenant_id uuid not null references library_ingest.tenants(id) on delete restrict,
  report_sha256 text not null check(report_sha256 ~ '^[a-f0-9]{64}$'),
  local_report_path text,
  manifest jsonb not null,
  created_at timestamptz not null default now(),
  unique(tenant_id,report_sha256)
);
alter table library_ingest.inventory_snapshots enable row level security;
revoke all on library_ingest.inventory_snapshots from public,anon,authenticated,service_role;
grant select,insert on library_ingest.inventory_snapshots to service_role;

-- Scope is not a public-access grant. Membership is still required, even for system knowledge.
drop policy library_member_read on library_ingest.source_assets;
create policy library_asset_read on library_ingest.source_assets for select to authenticated
using(tenant_id in (select tenant_id from library_ingest.tenant_memberships where user_id=(select auth.uid()))
  and (scope<>'private' or owner_user_id=(select auth.uid())));

drop policy library_member_read on library_ingest.source_occurrences;
create policy library_occurrence_read on library_ingest.source_occurrences for select to authenticated
using(exists(select 1 from library_ingest.source_assets a where a.tenant_id=source_occurrences.tenant_id and a.id=source_occurrences.source_asset_id));
drop policy library_member_read on library_ingest.source_pages;
create policy library_page_read on library_ingest.source_pages for select to authenticated
using(exists(select 1 from library_ingest.source_assets a where a.tenant_id=source_pages.tenant_id and a.id=source_pages.source_asset_id));
drop policy library_member_read on library_ingest.page_duplicate_candidates;
create policy library_candidate_read on library_ingest.page_duplicate_candidates for select to authenticated
using(exists(select 1 from library_ingest.source_pages p where p.tenant_id=page_duplicate_candidates.tenant_id and p.id=page_duplicate_candidates.page_a_id)
  and exists(select 1 from library_ingest.source_pages p where p.tenant_id=page_duplicate_candidates.tenant_id and p.id=page_duplicate_candidates.page_b_id));
drop policy library_member_read on library_ingest.review_events;
create policy library_review_read on library_ingest.review_events for select to authenticated
using(exists(select 1 from library_ingest.page_duplicate_candidates c where c.tenant_id=review_events.tenant_id and c.id=review_events.candidate_id));
-- Run details may include paths of private assets; leave them backend-only.
revoke select on library_ingest.processing_runs from authenticated;

comment on column library_ingest.source_assets.tenant_id is 'Stable logical organization_id; legacy physical column retained.';
comment on column library_ingest.source_assets.scope is 'system is shared knowledge, never anonymous access. private requires owner and membership.';
comment on table library_ingest.inventory_snapshots is 'Append-only provenance envelope; no content extraction or RAG publication.';
