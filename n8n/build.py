#!/usr/bin/env python3
"""
Assemble importable n8n workflow JSON from the code nodes in src/code/.

Why a builder instead of hand-edited JSON:
  * Code-node JavaScript stays in real .js files -> `node --check` and the unit
    tests in tests/ can run against it.
  * The shared HTML/date helpers live in ONE file (_lib_html.js) and are injected
    into every node that declares `* LIB` in its header comment, so a parser fix
    lands everywhere at once.
  * Node graphs are declared once, so renaming a node can't silently break a
    `$('Node Name')` reference somewhere else.

Usage:  python3 n8n/build.py           # writes n8n/workflows/*.json
        python3 n8n/build.py --check   # verify workflows/ matches src/ (CI)
"""
import json, pathlib, sys, re

ROOT   = pathlib.Path(__file__).parent
CODE   = ROOT / "src" / "code"
OUT    = ROOT / "workflows"
SUPA   = "https://pcctpzvhakdutzzwpmsh.supabase.co/rest/v1"

# Credentials that already exist in this n8n instance.
CRED_HEADER = {"httpHeaderAuth": {"id": "FluPv7K0v8r1zzx8", "name": "Header Auth account"}}
CRED_SHEETS = {"googleSheetsOAuth2Api": {"id": "79O5omw14NYFyi3U", "name": "Google Sheets account 2"}}
# Must be created once by hand: Header Auth, name `x-api-key`, value = Anthropic key.
CRED_ANTHROPIC = {"httpHeaderAuth": {"id": "REPLACE_WITH_ANTHROPIC_CRED_ID",
                                     "name": "Anthropic API (x-api-key)"}}
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0 Safari/537.36")

LIB = (CODE / "_lib_html.js").read_text()
LIB_BODY = LIB.split("if (typeof module")[0].rstrip()


def code(name: str) -> str:
    """Load a code node, injecting the shared lib when the file asks for it."""
    src = (CODE / name).read_text()
    if re.search(r"^\s*\*\s*LIB\s*$", src, re.M):
        src = (f"/* ---- injected from src/code/_lib_html.js by n8n/build.py ----\n"
               f"   Edit the lib, never this copy, then re-run the builder. */\n"
               f"{LIB_BODY}\n/* ---- end injected lib ---- */\n\n{src}")
    return src


# ---------------------------------------------------------------- node factories
_pos = {}
def at(col, row):
    return [col * 240 - 400, row * 180 - 400]


def n_schedule(name, cron, pos):
    return {"name": name, "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2,
            "position": pos, "parameters": {"rule": {"interval": [{"field": "cronExpression",
                                                                   "expression": cron}]}}}

def n_manual(name, pos):
    return {"name": name, "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1,
            "position": pos, "parameters": {}}

def n_exec_trigger(name, pos):
    return {"name": name, "type": "n8n-nodes-base.executeWorkflowTrigger",
            "typeVersion": 1, "position": pos, "parameters": {}}

def n_code(name, file_or_src, pos, each_item=False, inline=False):
    src = file_or_src if inline else code(file_or_src)
    p = {"jsCode": src}
    if each_item:
        p["mode"] = "runOnceForEachItem"
    return {"name": name, "type": "n8n-nodes-base.code", "typeVersion": 2,
            "position": pos, "parameters": p}

def n_loop(name, pos, size=1):
    return {"name": name, "type": "n8n-nodes-base.splitInBatches", "typeVersion": 3,
            "position": pos, "parameters": {"batchSize": size, "options": {}}}

def n_wait(name, pos, seconds=2):
    return {"name": name, "type": "n8n-nodes-base.wait", "typeVersion": 1.1,
            "position": pos, "parameters": {"amount": seconds, "unit": "seconds"}}

def n_noop(name, pos):
    return {"name": name, "type": "n8n-nodes-base.noOp", "typeVersion": 1,
            "position": pos, "parameters": {}}

def n_if(name, pos, condition_expr):
    return {"name": name, "type": "n8n-nodes-base.if", "typeVersion": 2.2, "position": pos,
            "parameters": {"conditions": {"options": {"caseSensitive": True, "version": 2,
                                                      "typeValidation": "loose"},
                "combinator": "and",
                "conditions": [{"id": "c1", "operator": {"type": "boolean", "operation": "true",
                                                         "singleValue": True},
                                "leftValue": condition_expr, "rightValue": ""}]}},
            "alwaysOutputData": False}

def n_http(name, pos, *, method="GET", url, cred=None, body=None, headers=None,
           text=False, never_error=False, full=True, retries=0, once=False, timeout=None):
    p = {"method": method, "url": url, "options": {}}
    if cred:
        p["authentication"] = "genericCredentialType"
        p["genericAuthType"] = "httpHeaderAuth"
    if headers:
        p["sendHeaders"] = True
        p["headerParameters"] = {"parameters": [{"name": k, "value": v}
                                               for k, v in headers.items()]}
    if body is not None:
        p["sendBody"] = True
        p["contentType"] = "raw"
        p["rawContentType"] = "application/json"
        p["body"] = body
    resp = {}
    if full:
        resp["fullResponse"] = True
    if text:
        resp["responseFormat"] = "text"
        resp["outputPropertyName"] = "data"
    if resp:
        p["options"]["response"] = {"response": resp}
    if never_error:
        p["options"]["response"] = p["options"].get("response", {"response": {}})
        p["options"]["response"]["response"]["neverError"] = True
    if timeout:
        p["options"]["timeout"] = timeout
    if method in ("GET", "HEAD"):
        p["options"]["redirect"] = {"redirect": {"followRedirects": True, "maxRedirects": 5}}
    node = {"name": name, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.5,
            "position": pos, "parameters": p}
    if cred:
        node["credentials"] = cred
    if retries:
        node.update({"retryOnFail": True, "maxTries": retries, "waitBetweenTries": 2500})
    if never_error:
        node["onError"] = "continueRegularOutput"
    if once:
        node["executeOnce"] = True
    return node


def n_rss(name, pos):
    return {"name": name, "type": "n8n-nodes-base.rssFeedRead", "typeVersion": 1.1,
            "position": pos,
            "parameters": {"url": "={{ $json.feed_url }}", "options": {}},
            "onError": "continueRegularOutput", "retryOnFail": True, "maxTries": 2,
            "waitBetweenTries": 3000}


# --------------------------------------------------- reusable Supabase fragments
def supa_get(name, table_and_query, pos, once=False):
    return n_http(name, pos, url=f"{SUPA}/{table_and_query}", cred=CRED_HEADER,
                  headers={"Accept": "application/json"}, full=False, retries=2, once=once)

def supa_upsert(name, table, on_conflict, pos, body=None, prefer="resolution=merge-duplicates,return=minimal"):
    body = body or "={{ JSON.stringify($input.all().map(i => i.json)) }}"
    return n_http(name, pos, method="POST",
                  url=f"{SUPA}/{table}?on_conflict={on_conflict}", cred=CRED_HEADER,
                  headers={"Prefer": prefer, "Content-Profile": "public"},
                  body=body, full=False, retries=2, once=True, never_error=True)

def supa_patch(name, table_and_query, pos, body, once=False):
    return n_http(name, pos, method="PATCH", url=f"{SUPA}/{table_and_query}",
                  cred=CRED_HEADER, headers={"Prefer": "return=minimal"},
                  body=body, full=False, retries=2, once=once, never_error=True)


def mark_source_ok(pos):
    return supa_patch("Mark Source OK",
        "sources?slug=eq.{{ $('Loop Sources').item.json.slug }}", pos,
        body=("={{ JSON.stringify({ last_run_at: $now.toISO(), last_success_at: $now.toISO(), "
              "consecutive_fails: 0, last_error: null }) }}"))


def log_run(workflow, pos, notes="{}"):
    return n_http("Log Run", pos, method="POST", url=f"{SUPA}/run_log", cred=CRED_HEADER,
                  headers={"Prefer": "return=minimal"},
                  body=("={{ JSON.stringify([{ workflow: " + json.dumps(workflow) +
                        ", finished_at: $now.toISO(), status: 'ok', notes: " + notes + " }]) }}"),
                  full=False, once=True, never_error=True)


# ------------------------------------------------------------------- assembly
def wf(name, nodes, links, *, active=False, tags=None):
    conns = {}
    for src, out_idx, dst in links:
        conns.setdefault(src, {"main": []})
        while len(conns[src]["main"]) <= out_idx:
            conns[src]["main"].append([])
        conns[src]["main"][out_idx].append({"node": dst, "type": "main", "index": 0})
    return {"name": name, "nodes": nodes, "connections": conns, "active": active,
            "settings": {"executionOrder": "v1", "saveDataErrorExecution": "all",
                         "saveExecutionProgress": True, "timezone": "Asia/Dubai"},
            "tags": [{"name": t} for t in (tags or ["research-opps"])]}


WORKFLOWS = {}

# ============================================================ W02 · wp_rest
WORKFLOWS["W02_ingest_wp_rest"] = wf("W02 · Ingest · WordPress REST", [
    n_schedule("Every Day 02:00", "0 2 * * *", at(0, 0)),
    n_manual("Run Manually", at(0, 1)),
    supa_get("Get WP Sources",
             "sources?kind=eq.wp_rest&enabled=is.true&select=*&order=slug", at(1, 0)),
    n_loop("Loop Sources", at(2, 0)),
    log_run("W02_ingest_wp_rest", at(3, -1)),
    n_code("Build Probe URL", """/* One cheap request tells us exactly how many pages this run needs, and
 * x-wp-total goes straight into the run log. Incremental: only posts modified
 * since our last clean run, minus an hour of overlap for clock skew. */
const s = $json;
const cfg = s.config || {};
const since = s.last_success_at
  ? new Date(new Date(s.last_success_at).getTime() - 36e5).toISOString().slice(0, 19)
  : null;
const qs = new URLSearchParams({ per_page: '1', _fields: 'id', orderby: 'modified', order: 'desc' });
if (since) qs.set('modified_after', since);
if (Array.isArray(cfg.exclude_categories) && cfg.exclude_categories.length)
  qs.set('categories_exclude', cfg.exclude_categories.join(','));
return { json: { source: s, probe_url: `${s.base_url}/posts?${qs.toString()}` } };""",
           at(3, 0), each_item=True, inline=True),
    n_http("Probe Total Pages", at(4, 0), url="={{ $json.probe_url }}",
           headers={"User-Agent": UA, "Accept": "application/json"},
           never_error=True, retries=2, timeout=30000),
    n_code("Plan Pages", "w02_plan_pages.js", at(5, 0)),
    n_http("Fetch Page", at(6, 0), url="={{ $json.url }}",
           headers={"User-Agent": UA, "Accept": "application/json"},
           never_error=True, retries=2, timeout=60000),
    n_code("Normalize WP", "w02_normalize_wp.js", at(7, 0)),
    supa_upsert("Upsert Raw Items", "raw_items", "source_slug,external_id", at(8, 0)),
    mark_source_ok(at(9, 0)),
], [
    ("Every Day 02:00", 0, "Get WP Sources"),
    ("Run Manually", 0, "Get WP Sources"),
    ("Get WP Sources", 0, "Loop Sources"),
    ("Loop Sources", 0, "Log Run"),
    ("Loop Sources", 1, "Build Probe URL"),
    ("Build Probe URL", 0, "Probe Total Pages"),
    ("Probe Total Pages", 0, "Plan Pages"),
    ("Plan Pages", 0, "Fetch Page"),
    ("Fetch Page", 0, "Normalize WP"),
    ("Normalize WP", 0, "Upsert Raw Items"),
    ("Upsert Raw Items", 0, "Mark Source OK"),
    ("Mark Source OK", 0, "Loop Sources"),
])

# ============================================================ W03 · detail enrich
WORKFLOWS["W03_enrich_detail"] = wf("W03 · Enrich · Detail Fetch & Parse", [
    n_schedule("Every 3 Hours", "0 */3 * * *", at(0, 0)),
    n_exec_trigger("Called By Ingest", at(0, 1)),
    supa_get("Get Detail Queue",
             "raw_items?needs_detail=is.true&detail_fetched_at=is.null"
             "&select=id,url,source_slug&order=id.asc&limit=40", at(1, 0)),
    n_loop("Loop Detail Queue", at(2, 0)),
    log_run("W03_enrich_detail", at(3, -1)),
    n_http("Fetch Detail Page", at(3, 0), url="={{ $json.url }}",
           headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml",
                    "Accept-Language": "en-US,en;q=0.9"},
           text=True, never_error=True, retries=2, timeout=45000),
    n_code("Parse Detail", "w03_parse_detail.js", at(4, 0)),
    supa_patch("Save Detail", "raw_items?id=eq.{{ $json.id }}", at(5, 0),
               body=("={{ JSON.stringify({ detail: $json.detail, "
                     "detail_fetched_at: $json.detail_fetched_at, "
                     "detail_error: $json.detail_error, needs_detail: false }) }}")),
    n_wait("Throttle 2s", at(6, 0), 2),
], [
    ("Every 3 Hours", 0, "Get Detail Queue"),
    ("Called By Ingest", 0, "Get Detail Queue"),
    ("Get Detail Queue", 0, "Loop Detail Queue"),
    ("Loop Detail Queue", 0, "Log Run"),
    ("Loop Detail Queue", 1, "Fetch Detail Page"),
    ("Fetch Detail Page", 0, "Parse Detail"),
    ("Parse Detail", 0, "Save Detail"),
    ("Save Detail", 0, "Throttle 2s"),
    ("Throttle 2s", 0, "Loop Detail Queue"),
])

# ============================================================ W04 · post_api
WORKFLOWS["W04_ingest_post_api"] = wf("W04 · Ingest · POST APIs (Grants.gov, NIH RePORTER)", [
    n_schedule("Every Day 03:00", "0 3 * * *", at(0, 0)),
    n_manual("Run Manually", at(0, 1)),
    supa_get("Get POST Sources",
             "sources?kind=eq.post_api&enabled=is.true&select=*&order=slug", at(1, 0)),
    n_loop("Loop Sources", at(2, 0)),
    log_run("W04_ingest_post_api", at(3, -1)),
    n_code("Plan API Requests", "w04_plan_api_requests.js", at(3, 0)),
    n_http("Call API", at(4, 0), method="POST", url="={{ $json.url }}",
           headers={"Content-Type": "application/json", "Accept": "application/json",
                    "User-Agent": UA},
           body="={{ JSON.stringify($json.body) }}",
           never_error=True, retries=2, timeout=60000),
    n_code("Normalize API", "w04_normalize_api.js", at(5, 0)),
    supa_upsert("Upsert Raw Items", "raw_items", "source_slug,external_id", at(6, 0)),
    mark_source_ok(at(7, 0)),
], [
    ("Every Day 03:00", 0, "Get POST Sources"),
    ("Run Manually", 0, "Get POST Sources"),
    ("Get POST Sources", 0, "Loop Sources"),
    ("Loop Sources", 0, "Log Run"),
    ("Loop Sources", 1, "Plan API Requests"),
    ("Plan API Requests", 0, "Call API"),
    ("Call API", 0, "Normalize API"),
    ("Normalize API", 0, "Upsert Raw Items"),
    ("Upsert Raw Items", 0, "Mark Source OK"),
    ("Mark Source OK", 0, "Loop Sources"),
])

# ============================================================ W05 · rss
WORKFLOWS["W05_ingest_rss"] = wf("W05 · Ingest · RSS (UKRI, NSF, Erasmus+, MSCA, ERC, CSC, Scholars4dev)", [
    n_schedule("Every Day 04:00", "0 4 * * *", at(0, 0)),
    n_manual("Run Manually", at(0, 1)),
    supa_get("Get RSS Sources",
             "sources?kind=eq.rss&enabled=is.true&select=*&order=slug", at(1, 0)),
    n_loop("Loop Sources", at(2, 0)),
    log_run("W05_ingest_rss", at(3, -1)),
    n_code("Expand Feed URLs", """/* A source may declare several feeds (e.g. one per category). */
const s = $json;
const feeds = (s.config || {}).feed_urls || [];
if (!feeds.length) return [];
return feeds.map(u => ({ json: { source_slug: s.slug, feed_url: u } }));""",
           at(3, 0), each_item=True, inline=True),
    n_rss("Read Feed", at(4, 0)),
    n_code("Normalize RSS", "w05_normalize_rss.js", at(5, 0)),
    supa_upsert("Upsert Raw Items", "raw_items", "source_slug,external_id", at(6, 0)),
    mark_source_ok(at(7, 0)),
], [
    ("Every Day 04:00", 0, "Get RSS Sources"),
    ("Run Manually", 0, "Get RSS Sources"),
    ("Get RSS Sources", 0, "Loop Sources"),
    ("Loop Sources", 0, "Log Run"),
    ("Loop Sources", 1, "Expand Feed URLs"),
    ("Expand Feed URLs", 0, "Read Feed"),
    ("Read Feed", 0, "Normalize RSS"),
    ("Normalize RSS", 0, "Upsert Raw Items"),
    ("Upsert Raw Items", 0, "Mark Source OK"),
    ("Mark Source OK", 0, "Loop Sources"),
])

# ============================================================ W06 · json_api
WORKFLOWS["W06_ingest_json_api"] = wf("W06 · Ingest · GET JSON APIs (NSF, CORDIS, OpenAIRE, DAAD)", [
    n_schedule("Every Day 05:00", "0 5 * * *", at(0, 0)),
    n_manual("Run Manually", at(0, 1)),
    supa_get("Get JSON Sources",
             "sources?kind=eq.json_api&enabled=is.true&select=*&order=slug", at(1, 0)),
    n_loop("Loop Sources", at(2, 0)),
    log_run("W06_ingest_json_api", at(3, -1)),
    n_code("Plan API Requests", "w06_plan_get_requests.js", at(3, 0)),
    n_http("Call API", at(4, 0), url="={{ $json.url }}",
           headers={"Accept": "application/json", "User-Agent": UA},
           never_error=True, retries=2, timeout=60000),
    n_code("Normalize API", "w04_normalize_api.js", at(5, 0)),
    supa_upsert("Upsert Raw Items", "raw_items", "source_slug,external_id", at(6, 0)),
    mark_source_ok(at(7, 0)),
], [
    ("Every Day 05:00", 0, "Get JSON Sources"),
    ("Run Manually", 0, "Get JSON Sources"),
    ("Get JSON Sources", 0, "Loop Sources"),
    ("Loop Sources", 0, "Log Run"),
    ("Loop Sources", 1, "Plan API Requests"),
    ("Plan API Requests", 0, "Call API"),
    ("Call API", 0, "Normalize API"),
    ("Normalize API", 0, "Upsert Raw Items"),
    ("Upsert Raw Items", 0, "Mark Source OK"),
    ("Mark Source OK", 0, "Loop Sources"),
])

# ============================================================ W09 · classify
WORKFLOWS["W09_classify_upsert"] = wf("W09 · Classify & Upsert Canonical", [
    n_schedule("Every 15 Minutes", "*/15 * * * *", at(0, 0)),
    n_manual("Run Manually", at(0, 1)),
    supa_get("Get Unclassified",
             "raw_items?classified_at=is.null"
             "&or=(needs_detail.is.false,detail_fetched_at.not.is.null)"
             "&select=id,source_slug,url,payload,detail&order=id.asc&limit=20", at(1, 0)),
    n_code("Build Classifier Requests", "w09_build_prompt.js", at(2, 0)),
    n_http("Call Claude", at(3, 0), method="POST",
           url="https://api.anthropic.com/v1/messages", cred=CRED_ANTHROPIC,
           headers={"anthropic-version": "2023-06-01", "Content-Type": "application/json"},
           body="={{ JSON.stringify($json.request) }}",
           never_error=True, retries=3, timeout=120000),
    n_code("Parse Classification", "w09_parse_classification.js", at(4, 0)),
    n_if("Usable?", at(5, 0), "={{ !$json.__error && !$json.__skip }}"),
    supa_upsert("Upsert Opportunity", "opportunities", "fingerprint", at(6, 0),
                body="={{ JSON.stringify($input.all().map(i => i.json.opportunity)) }}",
                prefer="resolution=merge-duplicates,return=representation"),
    n_code("Pair Provenance", """/* Link each upserted opportunity back to the raw item and source it came from,
 * so the portal can show "also listed by" and we can prefer tier-1 wording. */
const rows = $input.all().map(i => i.json);        // representation from the upsert
const cls  = $('Parse Classification').all().map(i => i.json).filter(j => !j.__error && !j.__skip);
const byFp = new Map(cls.map(j => [j.opportunity.fingerprint, j]));
const out = [];
for (const r of rows) {
  const j = byFp.get(r.fingerprint);
  if (!j) continue;
  out.push({ json: { opportunity_id: r.id, source_slug: j.source_slug,
                     raw_item_id: j.raw_item_id, source_url: j.opportunity.canonical_url,
                     reported_at: new Date().toISOString() } });
}
return out;""", at(7, 0), inline=True),
    supa_upsert("Link Provenance", "opportunity_sources", "opportunity_id,source_slug", at(8, 0)),
    n_code("Collect Classified IDs", """/* One PATCH per run instead of one per item: build the id list, then stamp
 * classified_at with a single `id=in.(...)` filter. */
const all = $('Parse Classification').all().map(i => i.json);
const ids = all.filter(j => !j.__error).map(j => j.raw_item_id).filter(Boolean);
const version = (all.find(j => j.classifier_version) || {}).classifier_version || 'unknown';
return [{ json: { ids, id_filter: ids.join(','), count: ids.length, classifier_version: version } }];""",
           at(6, 1), inline=True),
    supa_patch("Mark Classified", "raw_items?id=in.({{ $json.id_filter }})", at(7, 1),
               body=("={{ JSON.stringify({ classified_at: $now.toISO(), "
                     "classifier_version: $json.classifier_version }) }}"), once=True),
    n_code("Log Classifier Usage", """/* Cost + latency trail, and the evidence you need when a prompt change makes
 * results worse. */
const plans = $('Build Classifier Requests').all().map(i => i.json);
const resps = $('Parse Classification').all().map(i => i.json);
return resps.filter(r => !r.__error).map(r => ({ json: {
  raw_item_id: r.raw_item_id,
  model: (plans.find(p => p.raw_item_id === r.raw_item_id) || {}).request?.model || 'unknown',
  version: r.classifier_version,
  input_tokens: (r.usage || {}).input_tokens || null,
  output_tokens: (r.usage || {}).output_tokens || null,
  output: r.classification || {},
}}));""", at(8, 1), inline=True),
    n_http("Save Classifications", at(9, 1), method="POST", url=f"{SUPA}/classifications",
           cred=CRED_HEADER, headers={"Prefer": "return=minimal"},
           body="={{ JSON.stringify($input.all().map(i => i.json)) }}",
           full=False, once=True, never_error=True),
    n_noop("Skipped / Not An Opportunity", at(6, 2)),
], [
    ("Every 15 Minutes", 0, "Get Unclassified"),
    ("Run Manually", 0, "Get Unclassified"),
    ("Get Unclassified", 0, "Build Classifier Requests"),
    ("Build Classifier Requests", 0, "Call Claude"),
    ("Call Claude", 0, "Parse Classification"),
    ("Parse Classification", 0, "Usable?"),
    ("Usable?", 0, "Upsert Opportunity"),
    ("Usable?", 1, "Skipped / Not An Opportunity"),
    ("Upsert Opportunity", 0, "Pair Provenance"),
    ("Pair Provenance", 0, "Link Provenance"),
    ("Link Provenance", 0, "Collect Classified IDs"),
    ("Skipped / Not An Opportunity", 0, "Collect Classified IDs"),
    ("Collect Classified IDs", 0, "Mark Classified"),
    ("Mark Classified", 0, "Log Classifier Usage"),
    ("Log Classifier Usage", 0, "Save Classifications"),
])

# ============================================================ W11 · freshness
WORKFLOWS["W11_freshness_sweeper"] = wf("W11 · Freshness Sweeper (expiry + link check)", [
    n_schedule("Every Day 05:30", "30 5 * * *", at(0, 0)),
    n_manual("Run Manually", at(0, 1)),
    supa_patch("Expire Past Deadlines",
        "opportunities?status=in.(active,closing_soon)&deadline=lt.{{ $now.toFormat('yyyy-MM-dd') }}",
        at(1, 0), body="={{ JSON.stringify({ status: 'expired' }) }}", once=True),
    supa_patch("Flag Closing Soon",
        "opportunities?status=eq.active&deadline=gte.{{ $now.toFormat('yyyy-MM-dd') }}"
        "&deadline=lte.{{ $now.plus({ days: 30 }).toFormat('yyyy-MM-dd') }}",
        at(2, 0), body="={{ JSON.stringify({ status: 'closing_soon' }) }}", once=True),
    supa_patch("Reopen Recovered",
        "opportunities?status=eq.closing_soon&deadline=gt.{{ $now.plus({ days: 30 }).toFormat('yyyy-MM-dd') }}",
        at(3, 0), body="={{ JSON.stringify({ status: 'active' }) }}", once=True),
    supa_get("Get Link Queue",
             "opportunities?apply_link=not.is.null&status=in.(active,closing_soon,dead_link)"
             "&or=(link_checked_at.is.null,link_checked_at.lt.{{ $now.minus({ days: 14 }).toISO() }})"
             "&select=id,fingerprint,apply_link,status,confidence&order=link_checked_at.asc.nullsfirst"
             "&limit=60", at(4, 0)),
    n_loop("Loop Link Queue", at(5, 0)),
    log_run("W11_freshness_sweeper", at(6, -1)),
    n_http("Check Apply Link", at(6, 0), url="={{ $json.apply_link }}",
           headers={"User-Agent": UA, "Accept": "text/html,*/*"},
           text=True, never_error=True, timeout=20000),
    n_code("Link Verdict", "w11_link_verdict.js", at(7, 0)),
    supa_patch("Patch Link Status", "opportunities?id=eq.{{ $json.id }}", at(8, 0),
               body="={{ JSON.stringify($json.patch) }}"),
    n_wait("Throttle 1s", at(9, 0), 1),
], [
    ("Every Day 05:30", 0, "Expire Past Deadlines"),
    ("Run Manually", 0, "Expire Past Deadlines"),
    ("Expire Past Deadlines", 0, "Flag Closing Soon"),
    ("Flag Closing Soon", 0, "Reopen Recovered"),
    ("Reopen Recovered", 0, "Get Link Queue"),
    ("Get Link Queue", 0, "Loop Link Queue"),
    ("Loop Link Queue", 0, "Log Run"),
    ("Loop Link Queue", 1, "Check Apply Link"),
    ("Check Apply Link", 0, "Link Verdict"),
    ("Link Verdict", 0, "Patch Link Status"),
    ("Patch Link Status", 0, "Throttle 1s"),
    ("Throttle 1s", 0, "Loop Link Queue"),
])

# ============================================================ W12 · portal sync
SHEET_COLS = ["id","title","organisation","type","degree_levels","fields_of_study",
              "host_country","host_region","is_remote","funding","funding_detail",
              "deadline","deadline_kind","deadline_note","days_left","duration","summary",
              "eligibility","benefits","how_to_apply","documents","apply_link","image_url",
              "status","confidence","sources","source_url","last_verified_at","synced_at"]

WORKFLOWS["W12_portal_sync"] = wf("W12 · Portal Sync (Supabase -> Sheet mirror)", [
    n_schedule("Every Day 06:00", "0 6 * * *", at(0, 0)),
    n_manual("Run Manually", at(0, 1)),
    supa_get("Get Portal Feed",
             "v_portal_feed?select=*&order=deadline.asc.nullslast&limit=2000", at(1, 0)),
    n_code("Portal Rows", "w12_portal_rows.js", at(2, 0)),
    {"name": "Mirror To Sheet", "type": "n8n-nodes-base.googleSheets", "typeVersion": 4.5,
     "position": at(3, 0), "credentials": CRED_SHEETS, "onError": "continueRegularOutput",
     "parameters": {
        "operation": "appendOrUpdate",
        "documentId": {"__rl": True, "mode": "id",
                       "value": "1tU6BT5xkbqNzl4p9kkK6QHriyujNuBSuiXcD90Q37o0"},
        "sheetName": {"__rl": True, "mode": "name", "value": "opportunities"},
        "columns": {"mappingMode": "defineBelow",
                    "matchingColumns": ["id"],
                    "value": {c: "={{ $json." + c + " }}" for c in SHEET_COLS},
                    "schema": [{"id": c, "displayName": c, "required": False,
                                "defaultMatch": c == "id", "display": True,
                                "type": "string", "canBeUsedToMatch": True}
                               for c in SHEET_COLS]},
        "options": {}}},
    n_http("Notify Portal Webhook", at(4, 0), method="POST",
           url="https://REPLACE-WITH-PORTAL-HOST/api/opportunities/refreshed",
           headers={"Content-Type": "application/json"},
           body=("={{ JSON.stringify({ synced_at: $now.toISO(), "
                 "count: $('Portal Rows').all().length }) }}"),
           full=False, never_error=True),
    log_run("W12_portal_sync", at(5, 0)),
], [
    ("Every Day 06:00", 0, "Get Portal Feed"),
    ("Run Manually", 0, "Get Portal Feed"),
    ("Get Portal Feed", 0, "Portal Rows"),
    ("Portal Rows", 0, "Mirror To Sheet"),
    ("Mirror To Sheet", 0, "Notify Portal Webhook"),
    ("Notify Portal Webhook", 0, "Log Run"),
])
# The webhook node is a placeholder until the portal endpoint exists.
WORKFLOWS["W12_portal_sync"]["nodes"][5]["disabled"] = True


# ------------------------------------------------------------------ validation
def validate(name, w):
    errs = []
    names = [n["name"] for n in w["nodes"]]
    if len(names) != len(set(names)):
        errs.append("duplicate node names")
    for src, outs in w["connections"].items():
        if src not in names:
            errs.append(f"connection from unknown node {src!r}")
        for lane in outs["main"]:
            for c in lane:
                if c["node"] not in names:
                    errs.append(f"connection to unknown node {c['node']!r}")
    # every $('X') reference inside code must name a real node
    for n in w["nodes"]:
        js = n.get("parameters", {}).get("jsCode", "")
        for ref in set(re.findall(r"\$\(\s*['\"]([^'\"]+)['\"]\s*\)", js)):
            if ref not in names:
                errs.append(f"{n['name']}: $('{ref}') is not a node in this workflow")
    return errs


def main():
    check = "--check" in sys.argv
    OUT.mkdir(exist_ok=True)
    bad = 0
    for fname, w in WORKFLOWS.items():
        errs = validate(fname, w)
        path = OUT / f"{fname}.json"
        blob = json.dumps(w, indent=2, ensure_ascii=False) + "\n"
        if errs:
            bad += 1
            print(f"  FAIL {fname}")
            for e in errs:
                print(f"        {e}")
            continue
        if check:
            same = path.exists() and path.read_text() == blob
            print(f"  {'ok  ' if same else 'DRIFT'} {fname}")
            bad += 0 if same else 1
        else:
            path.write_text(blob)
            print(f"  wrote {path.relative_to(ROOT.parent)}  "
                  f"({len(w['nodes'])} nodes, {len(blob)//1024}kB)")
    print(("FAILED" if bad else "all workflows valid") + f"  ({len(WORKFLOWS)} total)")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
