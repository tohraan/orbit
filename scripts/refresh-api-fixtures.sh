#!/usr/bin/env bash
# Re-capture tests/fixtures/api/*.json from the live endpoints.
#
# Run this when a source changes shape and a normalise test starts failing for a
# reason you have confirmed is upstream, not a regression. Diff the result before
# committing: a fixture change is a record that the source moved.
#
# NOTE: python3's urllib has no usable CA bundle on this machine -- use curl.
set -euo pipefail
cd "$(dirname "$0")/.."
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
F=tests/fixtures/api
mkdir -p "$F"

grab() {  # grab <file> <url>
  printf '  %-30s ' "$1"
  if curl -sf --max-time 60 -A "$UA" -H "Accept: application/json" "$2" -o "$F/$1.tmp"; then
    if python3 -c "import json,sys; json.load(open('$F/$1.tmp'))" 2>/dev/null; then
      mv "$F/$1.tmp" "$F/$1"; echo "ok ($(wc -c < "$F/$1" | tr -d ' ') bytes)"
    else
      rm -f "$F/$1.tmp"; echo "FAILED (not JSON)"; return 1
    fi
  else
    rm -f "$F/$1.tmp"; echo "FAILED (request)"; return 1
  fi
}

grab cordis.json "https://cordis.europa.eu/api/search/results?q=contenttype%3D%27project%27&format=json&num=2&p=1"
grab openaire.json "https://api.openaire.eu/graph/v1/projects?pageSize=5&page=1"
grab daad.json "https://www2.daad.de/deutschland/studienangebote/international-programmes/api/solr/en/search.json?limit=3&page=1"
grab nsf_awards.json "https://api.nsf.gov/services/v1/awards.json?rpp=2&printFields=id,title,startDate,expDate,fundsObligatedAmt,awardeeName,awardeeCountryCode,awardeeCity,piFirstName,piLastName,abstractText,primaryProgram"
grab wp_opportunity_desk.json "https://opportunitydesk.org/wp-json/wp/v2/posts?per_page=2&_fields=id,slug,link,date_gmt,modified_gmt,title,excerpt,categories,class_list"

echo
echo "now run:  node tests/normalize.test.mjs"
