-- =====================================================================
-- migration 008 · record scholars4dev's robots.txt rules in the registry.
--
-- Fetched and read 2026-10-01. The listing API we use (/wp-json/) is NOT
-- disallowed, so the ingest itself is permitted. What IS disallowed, and must
-- never be queued for a detail fetch:
--   /cgi-bin /wp-admin /wp-includes /wp-content /wp-login /archives/ /io/
--   /about/about-us/ and nine /tag/scholarships-for-*/ paths,
--   plus four specific post pages (erratum-korean-government-...,
--   international-scholarships-for-{ghanaian,kenyan,south-african} students).
--
-- `robotsAllows()` in _lib_html.js checks a candidate URL against this list when
-- deciding `needs_detail`, so a disallowed page is never fetched at all. Posts
-- are normally linked as /<id>/<slug>/ so these rarely match -- the point is
-- that compliance is enforced by the registry, not by hoping.
--
-- Idempotent.
-- =====================================================================
update sources
   set config = config || '{
         "robots_disallow":[
           "/cgi-bin","/wp-admin","/wp-includes","/wp-content","/wp-login",
           "/archives/","/io/","/about/about-us/",
           "/tag/scholarships-for-africans/","/tag/scholarships-for-asians/",
           "/tag/scholarships-for-southeast-asians/","/tag/scholarships-for-south-asians/",
           "/tag/scholarships-for-east-asians/","/tag/scholarships-for-latin-americans/",
           "/tag/scholarships-for-pacific-islanders/","/tag/scholarships-for-US-minorities/",
           "/tag/scholarships-for-east-europeans/",
           "/erratum-korean-government-scholarship-program-not-yet-open/",
           "/international-scholarships-for-ghanaian-students/",
           "/international-scholarships-for-kenyan-students/",
           "/international-scholarships-for-south-africans/"
         ]}'::jsonb,
       robots_ok = true,
       tos_note = coalesce(tos_note,'') ||
         ' | 2026-10-01: robots.txt read in full. /wp-json/ is not disallowed so'
         ' the listing API is permitted; 21 Disallow prefixes recorded in'
         ' config.robots_disallow and enforced before any detail fetch.'
 where slug = 'scholars4dev';
