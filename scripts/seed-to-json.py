#!/usr/bin/env python3
"""Extract the `sources` registry from db/003_seed.sql as JSON.

Lets the local scrape runner exercise the real registry before the migrations
have been applied to Supabase. Once they are applied, prefer the live table --
this is a bootstrap, not a second source of truth.
"""
import json, pathlib, re, sys

sql = (pathlib.Path(__file__).parent.parent / "db" / "003_seed.sql").read_text()
block = sql[sql.index("insert into sources"):]
block = block[block.index("values") + 6:]
block = block[:block.index("\non conflict")] if "\non conflict" in block else block[:block.index("\n;")]

COLS = ["slug", "name", "kind", "base_url", "authority_tier", "trust_score",
        "cadence_cron", "config", "tos_note"]

def tuples(text):
    """Yield the top-level (...) groups, respecting single-quoted strings."""
    depth, buf, inside, i = 0, [], False, 0
    while i < len(text):
        c = text[i]
        if inside:
            if c == "'":
                if i + 1 < len(text) and text[i + 1] == "'":
                    buf.append("''"); i += 2; continue
                inside = False
            buf.append(c)
        else:
            if c == "'":
                inside = True; buf.append(c)
            elif c == "(":
                depth += 1
                if depth == 1: buf = []; i += 1; continue
                buf.append(c)
            elif c == ")":
                depth -= 1
                if depth == 0:
                    yield "".join(buf); i += 1; continue
                buf.append(c)
            elif c == "-" and text[i:i+2] == "--" and depth == 0:
                i = text.index("\n", i) if "\n" in text[i:] else len(text)
                continue
            else:
                if depth: buf.append(c)
        i += 1

def fields(t):
    """Split one tuple on top-level commas."""
    out, buf, inside, depth = [], [], False, 0
    i = 0
    while i < len(t):
        c = t[i]
        if inside:
            if c == "'":
                if i + 1 < len(t) and t[i + 1] == "'":
                    buf.append("'"); i += 2; continue
                inside = False; buf.append(c)
            else: buf.append(c)
        elif c == "'": inside = True; buf.append(c)
        elif c in "[{(": depth += 1; buf.append(c)
        elif c in "]})": depth -= 1; buf.append(c)
        elif c == "," and depth == 0: out.append("".join(buf).strip()); buf = []
        else: buf.append(c)
        i += 1
    out.append("".join(buf).strip())
    return out

def val(raw):
    raw = raw.strip()
    raw = re.sub(r"::(jsonb|text|numeric|int)\b", "", raw).strip()
    if raw.lower() in ("null", ""): return None
    if raw.startswith("'"):
        return raw[1:raw.rindex("'")].replace("''", "'")
    try: return json.loads(raw)
    except Exception: return raw

rows = []
for t in tuples(block):
    f = fields(t)
    if len(f) != len(COLS): continue
    r = dict(zip(COLS, (val(x) for x in f)))
    if isinstance(r.get("config"), str):
        r["config"] = json.loads(r["config"])
    r["enabled"] = True
    r["last_success_at"] = None
    rows.append(r)

json.dump(rows, sys.stdout, indent=2)
print(file=sys.stderr)
print(f"extracted {len(rows)} sources: " +
      ", ".join(f"{r['slug']}({r['kind']})" for r in rows), file=sys.stderr)
