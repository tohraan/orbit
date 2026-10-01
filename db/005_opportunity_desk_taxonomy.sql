-- =====================================================================
-- migration 005 · give opportunity_desk a category map and exclusions.
--
-- Found by running the scrape: the source has 27,384 posts and no taxonomy
-- config, so every row came back with no type and no degree level, and the
-- first page was news ("Sameer Ali Khan is OD Young Person of the Month").
--
-- Categories read live from /wp-json/wp/v2/categories on 2026-10-01 (counts in
-- comments). This is a config change only -- W01's wp_rest branch is untouched,
-- which is the registry-driven property PROMPT.md rule 3 protects.
--
-- Idempotent.
-- =====================================================================
update sources
   set config = config || '{
         "per_page":100,
         "needs_detail":true,
         "max_pages":20,
         "exclude_categories":[8,110,1],
         "category_map":{
           "24":{"type":"fellowship","levels":["masters","phd","postdoc"]},
           "6":{"type":"scholarship","levels":["any"]},
           "30":{"type":"grant","levels":["any"]},
           "161":{"type":"internship","levels":["bachelors","masters"]},
           "75":{"type":"training","levels":["any"]},
           "29":{"type":"award","levels":["any"]},
           "11":{"type":"competition","levels":["any"]},
           "10":{"type":"conference","levels":["any"]},
           "12":{"type":"job","levels":["any"]},
           "105":{"type":"other","levels":["any"]},
           "187":{"type":"exchange","levels":["any"]},
           "1280":{"type":"scholarship","levels":["bachelors"]},
           "1281":{"type":"scholarship","levels":["masters"]},
           "1282":{"type":"scholarship","levels":["phd","postdoc"]},
           "48236":{"type":"fellowship","levels":["postdoc"]}
         }}'::jsonb,
       tos_note = coalesce(tos_note,'') ||
         ' | 2026-10-01: category_map + exclude_categories added from the live'
         ' taxonomy. Excluded 8 (Our Blog, 1652), 110 (Young Person of the Month,'
         ' 152) and 1 (Uncategorized, 291) -- editorial posts, not opportunities.'
 where slug = 'opportunity_desk';
