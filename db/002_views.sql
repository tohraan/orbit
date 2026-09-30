-- =====================================================================
-- migration 002 · read models for the university portal + ops dashboards
-- The portal NEVER queries `opportunities` directly; it reads v_portal_feed
-- so we can change the internal schema without breaking the portal.
-- =====================================================================

create or replace view v_portal_feed as
select
  o.fingerprint                                  as id,
  o.title,
  o.organisation,
  o.opportunity_type::text                       as type,
  o.degree_levels::text[]                        as degree_levels,
  o.fields_of_study,
  o.host_country,
  o.host_region,
  o.is_remote,
  o.funding_kind::text                           as funding,
  o.funding_detail,
  o.stipend_amount,
  o.stipend_currency,
  o.deadline,
  o.deadline_kind::text                          as deadline_kind,
  o.deadline_note,
  case
    when o.deadline is null then null
    else (o.deadline - current_date)
  end                                            as days_left,
  o.duration_text,
  o.summary,
  o.eligibility,
  o.eligibility_flags,
  o.benefits,
  o.how_to_apply,
  o.documents,
  o.apply_link,
  o.image_url,
  o.status::text                                 as status,
  o.confidence,
  o.canonical_url,
  o.last_verified_at,
  (select array_agg(os.source_slug order by s.authority_tier)
     from opportunity_sources os join sources s on s.slug = os.source_slug
    where os.opportunity_id = o.id)              as sources,
  (select min(s.authority_tier)
     from opportunity_sources os join sources s on s.slug = os.source_slug
    where os.opportunity_id = o.id)              as best_authority_tier
from opportunities o
where o.status in ('active','closing_soon')
  and o.confidence >= 0.45;

comment on view v_portal_feed is
  'Stable contract consumed by the university web portal. Additive changes only.';

-- Deadlines inside 30 days, for the "closing soon" rail and nudge emails.
create or replace view v_closing_soon as
select * from v_portal_feed
where deadline is not null and days_left between 0 and 30
order by days_left asc;

-- Per-source health: what the ops dashboard and the daily alert read.
create or replace view v_source_health as
select
  s.slug, s.name, s.kind, s.authority_tier, s.enabled,
  s.last_run_at, s.last_success_at, s.consecutive_fails, s.last_error,
  count(distinct r.id)                                          as raw_items,
  count(distinct r.id) filter (where r.classified_at is null)    as unclassified,
  count(distinct r.id) filter (where r.needs_detail and r.detail_fetched_at is null) as detail_pending,
  count(distinct os.opportunity_id)                              as opportunities,
  case
    when not s.enabled                                       then 'disabled'
    when s.consecutive_fails >= 3                            then 'failing'
    when s.last_success_at is null                            then 'never_ran'
    when s.last_success_at < now() - interval '3 days'        then 'stale'
    else 'ok'
  end                                                            as health
from sources s
left join raw_items r            on r.source_slug = s.slug
left join opportunity_sources os on os.source_slug = s.slug
group by s.slug;

-- Anything the classifier was unsure about, for the admin review queue.
create or replace view v_review_queue as
select o.id, o.fingerprint, o.title, o.opportunity_type, o.degree_levels,
       o.deadline, o.deadline_kind, o.confidence, o.status,
       o.canonical_url, o.primary_source, o.first_seen_at
from opportunities o
where o.status = 'needs_review' or o.confidence < 0.45
   or (o.deadline is null and o.deadline_kind = 'unknown')
order by o.first_seen_at desc;
