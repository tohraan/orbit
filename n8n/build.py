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
#
# Supabase needs TWO headers and a single Header Auth credential can only set
# one, so this is an `httpCustomAuth` credential carrying both:
#     apikey:        <service key>   -- satisfies the Supabase gateway
#     Authorization: Bearer <key>    -- sets the PostgREST role to service_role
# Measured 2026-10-01: `apikey` alone returns 200 but the role falls back to
# `anon`, and every table has RLS on with no policies, so the body is `[]` --
# a silent empty read, not an error. `Authorization` alone returns 401.
#
# Do NOT point this back at `Header Auth account` (FluPv7K0v8r1zzx8): that
# credential is shared with Serper and Apollo nodes in four other workflows, so
# it holds an X-API-KEY that PostgREST ignores. That is exactly the bug.
CRED_SUPABASE = {"httpCustomAuth": {"id": "SupaResearchOps1",
                                    "name": "Supabase REST (research-opps)"}}
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0 Safari/537.36")

LIB_SENTINEL = "injected from src/code/_lib_html.js by n8n/build.py"
LIB = (CODE / "_lib_html.js").read_text()
LIB_BODY = LIB.split("if (typeof module")[0].rstrip()


# Names the lib provides. A node that uses one of these MUST get the lib
# injected -- see `validate()`, which fails the build otherwise.
LIB_EXPORTS = re.findall(r"^(?:function|const)\s+([A-Za-z_$][\w$]*)", LIB_BODY, re.M)

# The marker is a header-comment line that is just `* LIB`, with or without the
# comment terminator -- ` * LIB */` is how it reads when it ends the header.
LIB_MARKER = re.compile(r"^\s*\*\s*LIB\s*(?:\*/)?\s*$", re.M)


def code(name: str) -> str:
    """Load a code node, injecting the shared lib when the file asks for it."""
    src = (CODE / name).read_text()
    if LIB_MARKER.search(src):
        src = (f"/* ---- {LIB_SENTINEL} ----\n"
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

def n_code(name, file_or_src, pos, each_item=False, inline=False, always_output=False):
    src = file_or_src if inline else code(file_or_src)
    p = {"jsCode": src}
    if each_item:
        p["mode"] = "runOnceForEachItem"
    node = {"name": name, "type": "n8n-nodes-base.code", "typeVersion": 2,
            "position": pos, "parameters": p}
    # A node that outputs NOTHING stops its branch dead: n8n does not run a node
    # with no input items, so the branch never reaches `Mark Source OK` and the
    # loop is never told to continue. `alwaysOutputData` makes it emit a single
    # empty item instead, which `Any Rows?` then routes past the upsert.
    if always_output:
        node["alwaysOutputData"] = True
    return node

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
    # n8n only EVALUATES a parameter when its value starts with '='. Without it
    # the braces are sent verbatim -- PostgREST answered
    #   invalid input syntax for type bigint: "{{ $json.id }}"
    # and the PATCH filters matched nothing, so `Mark Source OK` and
    # `Save Detail` "succeeded" 55 times while changing zero rows.
    if "{{" in url and not url.startswith("="):
        url = "=" + url
    p = {"method": method, "url": url, "options": {}}
    if cred:
        p["authentication"] = "genericCredentialType"
        # Derive the generic auth type from the credential itself -- hardcoding
        # httpHeaderAuth silently mismatches an httpCustomAuth credential.
        p["genericAuthType"] = next(iter(cred))
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


def n_switch(name, pos, field, keys):
    """Route one item down a lane per value of `field` (no fallback lane: an
    unregistered kind is dropped rather than silently mis-parsed)."""
    values = []
    for i, k in enumerate(keys):
        values.append({
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "",
                            "typeValidation": "loose", "version": 2},
                "combinator": "and",
                "conditions": [{"id": f"r{i}", "operator": {"type": "string",
                                                            "operation": "equals"},
                                "leftValue": field, "rightValue": k}],
            },
            "renameOutput": True, "outputKey": k,
        })
    return {"name": name, "type": "n8n-nodes-base.switch", "typeVersion": 3.2,
            "position": pos, "parameters": {"rules": {"values": values}, "options": {}}}


def n_rss(name, pos):
    return {"name": name, "type": "n8n-nodes-base.rssFeedRead", "typeVersion": 1.1,
            "position": pos,
            "parameters": {"url": "={{ $json.feed_url }}", "options": {}},
            "onError": "continueRegularOutput", "retryOnFail": True, "maxTries": 2,
            "waitBetweenTries": 3000}


# --------------------------------------------------- reusable Supabase fragments
def supa_get(name, table_and_query, pos, once=False):
    return n_http(name, pos, url=f"{SUPA}/{table_and_query}", cred=CRED_SUPABASE,
                  headers={"Accept": "application/json"}, full=False, retries=2, once=once)

def supa_upsert(name, table, on_conflict, pos, body=None, prefer="resolution=merge-duplicates,return=minimal"):
    # Keep this expression SIMPLE. n8n's expression sandbox is not full JS --
    # `Array.from(new Map(...).values())` silently produced an empty array here,
    # so the POST returned 201 and inserted nothing at all. Deduplication now
    # happens in the `Dedupe Batch` CODE node, which is real JS.
    body = body or "={{ JSON.stringify($input.all().map(i => i.json)) }}"
    return n_http(name, pos, method="POST",
                  url=f"{SUPA}/{table}?on_conflict={on_conflict}", cred=CRED_SUPABASE,
                  headers={"Prefer": prefer, "Content-Profile": "public"},
                  body=body, full=False, retries=2, once=True, never_error=True)

def supa_patch(name, table_and_query, pos, body, once=False):
    return n_http(name, pos, method="PATCH", url=f"{SUPA}/{table_and_query}",
                  cred=CRED_SUPABASE, headers={"Prefer": "return=minimal"},
                  body=body, full=False, retries=2, once=once, never_error=True)


def mark_source_ok(pos):
    return supa_patch("Mark Source OK",
        "sources?slug=eq.{{ $json.slug }}", pos,
        body=("={{ JSON.stringify({ last_run_at: $now.toISO(), last_success_at: $now.toISO(), "
              "consecutive_fails: 0, last_error: null }) }}"))


def log_run(workflow, pos, notes="{}"):
    return n_http("Log Run", pos, method="POST", url=f"{SUPA}/run_log", cred=CRED_SUPABASE,
                  headers={"Prefer": "return=minimal"},
                  body=("={{ JSON.stringify([{ workflow: " + json.dumps(workflow) +
                        ", finished_at: $now.toISO(), status: 'ok', notes: " + notes + " }]) }}"),
                  full=False, once=True, never_error=True)


# ------------------------------------------------------------------- assembly
def wf(name, nodes, links, *, active=False, tags=None, wf_id=None):
    conns = {}
    for src, out_idx, dst in links:
        conns.setdefault(src, {"main": []})
        while len(conns[src]["main"]) <= out_idx:
            conns[src]["main"].append([])
        conns[src]["main"][out_idx].append({"node": dst, "type": "main", "index": 0})
    w = {"name": name, "nodes": nodes, "connections": conns, "active": active,
         "settings": {"executionOrder": "v1", "saveDataErrorExecution": "all",
                      "saveExecutionProgress": True, "timezone": "Asia/Dubai"},
         "tags": [{"name": t} for t in (tags or ["research-opps"])]}
    # A STABLE id, because `n8n import:workflow` requires one
    # (SQLITE_CONSTRAINT: NOT NULL constraint failed: workflow_entity.id) and
    # because re-importing the same id UPDATES that workflow instead of adding a
    # duplicate -- the same idempotency rule the Supabase writes follow.
    if wf_id:
        w["id"] = wf_id
    return w


WORKFLOWS = {}

# ===================================================== W01 · scrape opportunities
# One workflow, registry-driven. `Get Enabled Sources` reads every enabled row in
# `sources`; `Route By Kind` sends it down the branch that understands its wire
# format. All four branches converge on the same upsert, so adding a source of an
# existing kind stays a single INSERT. When the source loop finishes, the same run
# drains the detail queue — listing endpoints give titles, but deadline /
# eligibility / benefits / apply link exist only on the rendered page.
KINDS = ["wp_rest", "rss", "post_api", "json_api"]

WORKFLOWS["W01_scrape_opportunities"] = wf("W01 · Scrape Opportunities", [
    n_schedule("Every Day 02:00", "0 2 * * *", at(0, 0)),
    n_manual("Run Manually", at(0, 1)),
    supa_get("Get Enabled Sources",
             "sources?enabled=is.true&select=*&order=kind,slug", at(1, 0)),
    n_loop("Loop Sources", at(2, 0)),
    n_switch("Route By Kind", at(3, 0), "={{ $json.kind }}", KINDS),

    # ---- branch: wp_rest -------------------------------------------------
    n_code("Build Probe URL", """/* One cheap request tells us exactly how many pages this run needs, and
 * x-wp-total goes straight into the run log. Incremental: only posts modified
 * since our last clean run, minus an hour of overlap for clock skew. */
const s = $json;
const cfg = s.config || {};
const since = s.last_success_at
  ? new Date(new Date(s.last_success_at).getTime() - 36e5).toISOString().slice(0, 19)
  : null;
// URLSearchParams does not exist in the n8n Code sandbox, and this node is not
// a LIB node, so it builds the query string itself.
const parts = [['per_page','1'], ['_fields','id'], ['orderby','modified'], ['order','desc']];
if (since) parts.push(['modified_after', since]);
if (Array.isArray(cfg.exclude_categories) && cfg.exclude_categories.length)
  parts.push(['categories_exclude', cfg.exclude_categories.join(',')]);
const query = parts
  .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
  .join('&');
return { json: { source: s, probe_url: `${s.base_url}/posts?${query}` } };""",
           at(4, -2), each_item=True, inline=True),
    n_http("Probe Total Pages", at(5, -2), url="={{ $json.probe_url }}",
           headers={"User-Agent": UA, "Accept": "application/json"},
           never_error=True, retries=2, timeout=30000),
    n_code("Plan Pages", "plan_wp_pages.js", at(6, -2)),
    n_http("Fetch WP Page", at(7, -2), url="={{ $json.url }}",
           headers={"User-Agent": UA, "Accept": "application/json"},
           never_error=True, retries=2, timeout=60000),
    n_code("Normalize WP", "normalize_wp.js", at(8, -2), always_output=True),

    # ---- branch: rss -----------------------------------------------------
    # NOT each_item: this node fans one source row out into one item per feed,
    # and a runOnceForEachItem node may only return a SINGLE item. Returning an
    # array there fails with "A 'json' property isn't an object [item 0]".
    n_code("Expand Feed URLs", """/* A source may declare several feeds (e.g. one per category). */
const out = [];
for (const item of $input.all()) {
  const s = item.json;
  for (const u of ((s.config || {}).feed_urls || [])) {
    out.push({ json: { source_slug: s.slug, feed_url: u } });
  }
}
return out;""",
           at(4, -1), inline=True),
    n_rss("Read Feed", at(5, -1)),
    n_code("Normalize RSS", "normalize_rss.js", at(6, -1), always_output=True),

    # ---- branch: post_api + json_api (shared planner and normaliser) ------
    n_code("Plan API Requests", "plan_api.js", at(4, 1)),
    n_if("Is POST?", at(5, 1), "={{ $json.method === 'POST' }}"),
    n_http("Call POST API", at(6, 0), method="POST", url="={{ $json.url }}",
           headers={"Content-Type": "application/json", "Accept": "application/json",
                    "User-Agent": UA},
           body="={{ JSON.stringify($json.body) }}",
           never_error=True, retries=2, timeout=60000),
    n_http("Call GET API", at(6, 2), url="={{ $json.url }}",
           headers={"Accept": "application/json", "User-Agent": UA},
           never_error=True, retries=2, timeout=60000),
    n_code("Normalize API", "normalize_api.js", at(7, 1), always_output=True),

    # ---- converge --------------------------------------------------------
    # A source can legitimately yield zero rows -- erasmus_plus and erc are
    # news feeds whose relevance filter drops everything (CONTEXT.md §13.10).
    # Route those straight to `Mark Source OK` so the loop still advances.
    n_if("Any Rows?", at(9, 0), "={{ $json.source_slug !== undefined }}"),
    n_code("Dedupe Batch", """/* PostgREST rejects an ENTIRE batch with 500 / 21000 "ON CONFLICT DO UPDATE
 * command cannot affect row a second time" when two rows share a conflict key,
 * and these nodes are neverError, so the source silently lands nothing.
 * WordPress paginates by `modified`; ties make the page boundary unstable, so a
 * post can appear on two pages -- scholars4dev returned 227 rows, 226 unique.
 * Must be a CODE node: the same logic in an expression evaluated to [] . */
const seen = new Map();
for (const item of $input.all()) {
  const r = item.json;
  seen.set(String(r.source_slug) + '|' + String(r.external_id), r);
}
const out = [...seen.values()].map(json => ({ json }));
const dropped = $input.all().length - out.length;
if (dropped) console.log(`deduped ${dropped} duplicate key(s) out of ${$input.all().length}`);
return out;""", at(10, 0), inline=True),
    supa_upsert("Upsert Raw Items", "raw_items", "source_slug,external_id", at(11, 0)),
    # Both the "had rows" and "no rows" paths converge here so the slug reaches
    # `Mark Source OK` as plain item data.
    n_code("Source Done", """/* Carry the current source's slug to Mark Source OK. */
const s = $('Loop Sources').first().json;
return [{ json: { slug: s.slug, at: new Date().toISOString() } }];""",
           at(12, 0), inline=True),
    mark_source_ok(at(13, 0)),

    # ---- detail phase, once every source has been walked -----------------
    log_run("W01_scrape_opportunities", at(3, 3)),
    # Compute saver: only fetch detail pages for opportunities that actually
    # close between today and 31 Dec. Soonest deadline first, so the pages a
    # student can still act on are enriched before anything else.
    #
    # NOTE: rows with a NULL deadline are deliberately NOT queued here -- that is
    # where most of the saving comes from. They keep needs_detail = true, so
    # nothing is lost and widening the window later picks them up.
    supa_get("Get Detail Queue",
             "raw_items?needs_detail=is.true&detail_fetched_at=is.null"
             "&payload->>deadline=gte.{{ $now.toISODate() }}"
             "&payload->>deadline=lte.{{ $now.endOf('year').toISODate() }}"
             "&select=id,url,source_slug,payload->>deadline"
             "&order=payload->>deadline.asc&limit=200", at(4, 3)),
    n_loop("Loop Detail Queue", at(5, 3)),
    n_http("Fetch Detail Page", at(6, 3), url="={{ $json.url }}",
           headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml",
                    "Accept-Language": "en-US,en;q=0.9"},
           text=True, never_error=True, retries=2, timeout=45000),
    n_code("Parse Detail", "parse_detail.js", at(7, 3)),
    supa_patch("Save Detail", "raw_items?id=eq.{{ $json.id }}", at(8, 3),
               body=("={{ JSON.stringify({ detail: $json.detail, "
                     "detail_fetched_at: $json.detail_fetched_at, "
                     "detail_error: $json.detail_error, needs_detail: false }) }}")),
    n_wait("Throttle 2s", at(9, 3), 2),
    n_noop("Scrape Complete", at(6, 4)),
], [
    ("Every Day 02:00", 0, "Get Enabled Sources"),
    ("Run Manually", 0, "Get Enabled Sources"),
    ("Get Enabled Sources", 0, "Loop Sources"),
    ("Loop Sources", 0, "Log Run"),          # every source walked -> detail phase
    ("Loop Sources", 1, "Route By Kind"),

    ("Route By Kind", 0, "Build Probe URL"),      # wp_rest
    ("Route By Kind", 1, "Expand Feed URLs"),     # rss
    ("Route By Kind", 2, "Plan API Requests"),    # post_api
    ("Route By Kind", 3, "Plan API Requests"),    # json_api

    ("Build Probe URL", 0, "Probe Total Pages"),
    ("Probe Total Pages", 0, "Plan Pages"),
    ("Plan Pages", 0, "Fetch WP Page"),
    ("Fetch WP Page", 0, "Normalize WP"),
    ("Normalize WP", 0, "Any Rows?"),

    ("Expand Feed URLs", 0, "Read Feed"),
    ("Read Feed", 0, "Normalize RSS"),
    ("Normalize RSS", 0, "Any Rows?"),

    ("Plan API Requests", 0, "Is POST?"),
    ("Is POST?", 0, "Call POST API"),
    ("Is POST?", 1, "Call GET API"),
    ("Call POST API", 0, "Normalize API"),
    ("Call GET API", 0, "Normalize API"),
    ("Normalize API", 0, "Any Rows?"),

    ("Any Rows?", 0, "Dedupe Batch"),          # has rows
    ("Dedupe Batch", 0, "Upsert Raw Items"),
    ("Any Rows?", 1, "Source Done"),           # zero rows -> keep the loop moving
    ("Upsert Raw Items", 0, "Source Done"),
    ("Source Done", 0, "Mark Source OK"),
    ("Mark Source OK", 0, "Loop Sources"),

    ("Log Run", 0, "Get Detail Queue"),
    ("Get Detail Queue", 0, "Loop Detail Queue"),
    ("Loop Detail Queue", 0, "Scrape Complete"),
    ("Loop Detail Queue", 1, "Fetch Detail Page"),
    ("Fetch Detail Page", 0, "Parse Detail"),
    ("Parse Detail", 0, "Save Detail"),
    ("Save Detail", 0, "Throttle 2s"),
    ("Throttle 2s", 0, "Loop Detail Queue"),
], wf_id="W01ScrapeOpps001")


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
    # Any parameter containing {{ }} must start with '=' or n8n sends it as a
    # literal string. This is invisible until a request 400s at runtime.
    for n in w["nodes"]:
        for k, v in (n.get("parameters") or {}).items():
            if k == "jsCode":      # code node bodies are real JS, not expressions
                continue
            if isinstance(v, str) and "{{" in v and not v.startswith("="):
                errs.append(f"{n['name']}: parameter {k!r} contains an expression "
                            f"but does not start with '=' -- n8n will send it literally")
        for hp in ((n.get("parameters") or {}).get("headerParameters") or {}).get("parameters", []):
            hv = hp.get("value", "")
            if isinstance(hv, str) and "{{" in hv and not hv.startswith("="):
                errs.append(f"{n['name']}: header {hp.get('name')!r} contains an "
                            f"expression but does not start with '='")
    # A runOnceForEachItem node may only return a SINGLE {json} item. Returning
    # an array there fails at runtime with "A 'json' property isn't an object
    # [item 0]" -- which is exactly how `Expand Feed URLs` died on its first run.
    for n in w["nodes"]:
        pr = n.get("parameters", {})
        if pr.get("mode") != "runOnceForEachItem":
            continue
        js = pr.get("jsCode", "")
        if re.search(r"return\s*\[", js) or re.search(r"return\s+[\w.()]*\.map\(", js):
            errs.append(f"{n['name']}: runs once per item but returns an array -- "
                        f"an each-item node must return a single {{json}} object "
                        f"(drop each_item if it needs to fan out)")
    # a node that calls a lib helper without the lib injected throws at runtime
    # ("plain is not defined") -- which structural validation alone never caught.
    for n in w["nodes"]:
        js = n.get("parameters", {}).get("jsCode", "")
        if not js or LIB_SENTINEL in js:
            continue
        used = sorted({f for f in LIB_EXPORTS if re.search(rf"\b{f}\s*\(", js)})
        if used:
            errs.append(f"{n['name']}: calls {', '.join(used)} but the lib was not "
                        f"injected -- add a `* LIB` line to its header comment")
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
