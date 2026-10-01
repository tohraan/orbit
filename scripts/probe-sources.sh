#!/usr/bin/env bash
# Re-verify every seeded source endpoint. Sources rot: run this before a demo,
# and whenever an ingest workflow starts returning zero rows.
# Exit code is non-zero if any TIER-1 source is down.
set -uo pipefail
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
fails=0

# `chk` proves only reachability. `chk_has` also asserts the body actually
# contains items -- scholars4dev returned 200 with a valid but EMPTY <channel>
# for weeks, and a status-only probe called that "ok" while the ingest got zero
# rows. Any probe for a listing endpoint should assert content, not just status.
chk_has() { # chk_has <tier> <label> <grep-pattern> <min-count> <url>
  local tier="$1" label="$2" pat="$3" min="$4" url="$5"
  local body n code
  # --compressed matters: cscuk.fcdo.gov.uk returns content-encoding: gzip even
  # with no Accept-Encoding, so without it grep sees binary and counts zero.
  body=$(curl -sL --compressed --max-time 30 -H "User-Agent: $UA" -w '\n%{http_code}' "$url")
  code=$(printf '%s' "$body" | tail -1)
  n=$(printf '%s' "$body" | grep -oE "$pat" | wc -l | tr -d ' ')
  if [[ "$code" == 2* && "$n" -ge "$min" ]]; then
    printf '  \033[32m  ok\033[0m  T%s  %-34s %s  (%s items)\n' "$tier" "$label" "$code" "$n"
  else
    printf '  \033[31mFAIL\033[0m  T%s  %-34s %s  (%s items, wanted >=%s)\n' "$tier" "$label" "$code" "$n" "$min"
    [ "$tier" = 1 ] && fails=$((fails+1))
  fi
}

chk() { # chk <tier> <label> <expected-prefix> <curl args...>
  local tier="$1" label="$2" want="$3"; shift 3
  local code; code=$(curl -sL --compressed -o /dev/null -w '%{http_code}' --max-time 30 -H "User-Agent: $UA" "$@")
  if [[ "$code" == $want* ]]; then
    printf '  \033[32m  ok\033[0m  T%s  %-34s %s\n' "$tier" "$label" "$code"
  else
    printf '  \033[31mFAIL\033[0m  T%s  %-34s %s (wanted %s)\n' "$tier" "$label" "$code" "$want"
    [ "$tier" = 1 ] && fails=$((fails+1))
  fi
}

echo "== tier 3 · aggregators =="
chk 3 opportunities_circle 2 "https://www.opportunitiescircle.com/wp-json/wp/v2/posts?per_page=1&_fields=id"
chk 3 opportunity_desk     2 "https://opportunitydesk.org/wp-json/wp/v2/posts?per_page=1"
chk_has 3 scholars4dev       '"id":' 1 "https://www.scholars4dev.com/wp-json/wp/v2/posts?per_page=2&_fields=id"

echo "== tier 1 · primary funders =="
chk 1 grants_gov           2 -X POST -H 'Content-Type: application/json' \
      -d '{"rows":1,"keyword":"fellowship","oppStatuses":"forecasted|posted"}' \
      "https://api.grants.gov/v1/api/search2"
chk 1 nih_reporter         2 -X POST -H 'Content-Type: application/json' \
      -d '{"criteria":{"fiscal_years":[2026]},"limit":1,"offset":0}' \
      "https://api.reporter.nih.gov/v2/projects/search"
chk 1 nsf_awards           2 "https://api.nsf.gov/services/v1/awards.json?keyword=fellowship&rpp=1"
chk_has 1 nsf_funding_rss    '<item' 1 "https://www.nsf.gov/rss/rss_www_funding_upcoming.xml"
chk_has 1 ukri_opportunities '<item' 1 "https://www.ukri.org/opportunity/feed/"
chk_has 1 erasmus_plus       '<item' 1 "https://erasmus-plus.ec.europa.eu/rss.xml"
chk_has 1 msca               '<item' 1 "https://marie-sklodowska-curie-actions.ec.europa.eu/rss.xml"
chk_has 1 erc                '<item' 1 "https://erc.europa.eu/rss.xml"
chk_has 1 cordis             '"id"' 1 "https://cordis.europa.eu/api/search/results?q=contenttype%3D%27project%27&p=1&num=2&format=json"
chk 1 openaire             2 "https://api.openaire.eu/graph/v1/projects?pageSize=1"

echo "== tier 2 · national schemes =="
chk_has 2 commonwealth_cscuk '<item' 1 "https://cscuk.fcdo.gov.uk/feed/"
chk 2 daad_programmes      2 "https://www2.daad.de/deutschland/studienangebote/international-programmes/api/solr/en/search.json?limit=1"

echo
[ "$fails" -eq 0 ] && echo "all tier-1 sources reachable" || echo "$fails tier-1 source(s) DOWN"
exit "$fails"
