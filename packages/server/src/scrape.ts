/* The admin desk's scraper: a staff member pastes a link, we read the page.
 *
 * This is the one place in the product where a request from a user causes the
 * SERVER to fetch a URL that same user chose. That makes it server-side request
 * forgery bait, and it is why `resolve()` below exists: without it, a staff
 * member — or anyone who got hold of a staff session — could point this at
 * http://169.254.169.254/ and read the deployment's cloud credentials out of
 * the instance metadata service, or sweep the private network for internal
 * services, using our server as the one thing allowed to talk to them.
 *
 * So the target is resolved to its IP addresses and checked BEFORE the fetch,
 * and again after every redirect, because a public hostname is free to redirect
 * to 127.0.0.1 and a check that only ran once would wave it through.
 *
 * EXTRACTION IS NOT REIMPLEMENTED HERE. It binds to _lib_html.js through
 * ./lib-html, which is the pipeline's own parsing, read against fifteen real
 * sources and covered by tests/parse.test.mjs. A second copy would drift.
 *
 * ROBOTS. We check robots.txt and honour it. A staff member pasting one link
 * is not a crawl, but the project's position on this (CONTEXT.md, the
 * findaphd.com exclusion) is that we do not route around a site's stated
 * wishes, and an admin panel is not an excuse to start.
 */

import "server-only";
import { lib } from "./lib-html";
import { isPrivateAddress, resolve } from "./net-guard";

export type ScrapeField<T> = {
  value: T;
  /** Where it came from, so the form can show staff what was inferred rather
   *  than read, and they can judge it instead of trusting it. */
  from: "page" | "meta" | "none";
};

export type ScrapeResult = {
  ok: true;
  url: string;
  finalUrl: string;
  title: string | null;
  summary: string | null;
  deadline: string | null;
  deadlineKind: string;
  deadlineNote: string | null;
  funding: string | null;
  covers: string[];
  amount: { currency: string | null; value: number; period: string | null; raw: string | null } | null;
  duration: string | null;
  eligibility: string | null;
  benefits: string | null;
  howToApply: string | null;
  documents: string | null;
  applyLink: string | null;
  /** Fields the page did not yield, named so the UI can point staff at exactly
   *  what still needs typing instead of showing a form of empty boxes. */
  missing: string[];
  /** Non-fatal things staff should see: a roundup page, an audience mismatch,
   *  a deadline already past. */
  warnings: string[];
};

export type ScrapeFailure = { ok: false; code: ScrapeErrorCode; message: string };

export type ScrapeErrorCode =
  | "bad_url" | "blocked_host" | "robots" | "unreachable"
  | "http_error" | "not_html" | "too_large" | "timeout" | "empty";

const TIMEOUT_MS = 12_000;
const MAX_BYTES = 3_000_000;   // 3 MB of HTML is already a pathological page
const MAX_REDIRECTS = 4;

/* --------------------------------------------------------------- fetch --- */

/* Discriminated on `code`, NOT on `ok`.
 *
 * `Response` carries its own boolean `ok`, so `"ok" in res` is true for a
 * perfectly good 200 — the first version of this returned the live Response
 * down the failure path and TypeScript only caught it once a third workspace
 * compiled the file. ScrapeFailure is the only one of the two with `code`. */
function isFailure(x: Response | ScrapeFailure): x is ScrapeFailure {
  return "code" in x;
}

async function get(url: URL, signal: AbortSignal, accept: string): Promise<Response | ScrapeFailure> {
  /* Redirects are followed BY HAND so each hop can be re-resolved. `redirect:
   * "follow"` would let hop two land on 127.0.0.1 with nothing watching. */
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(current, {
        signal,
        redirect: "manual",
        headers: {
          accept,
          /* Identifying ourselves honestly, with a contact route, is what the
           * project does everywhere else it touches someone's server. */
          "user-agent": "OrbitBot/1.0 (+https://orbit-bits.vercel.app; BITS Pilani Dubai student portal)",
        },
      });
    } catch {
      if (signal.aborted) return { ok: false, code: "timeout", message: "That page took too long to respond." };
      return { ok: false, code: "unreachable", message: "That page could not be reached." };
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        return { ok: false, code: "bad_url", message: "That page redirected somewhere invalid." };
      }
      const checked = await resolve(next.toString());
      if ("ok" in checked) return checked;   // GuardFailure; {url} has no `ok`
      current = checked.url;
      continue;
    }
    return res;
  }
  return { ok: false, code: "http_error", message: "That page redirected too many times." };
}

/** Read at most MAX_BYTES, so a hostile or broken server cannot exhaust memory
 *  by streaming forever. `res.text()` would read all of it. */
async function readCapped(res: Response): Promise<string | ScrapeFailure> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared && declared > MAX_BYTES) {
    return { ok: false, code: "too_large", message: "That page is too large to read." };
  }
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return { ok: false, code: "too_large", message: "That page is too large to read." };
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
}

/* --------------------------------------------------------------- robots --- */

async function disallowedPaths(origin: string, signal: AbortSignal): Promise<string[]> {
  try {
    const res = await fetch(new URL("/robots.txt", origin), {
      signal,
      headers: { "user-agent": "OrbitBot/1.0" },
    });
    if (!res.ok) return [];
    const body = (await res.text()).slice(0, 100_000);
    /* Only the groups that apply to us: `*` and our own name. A Disallow under
     * `User-agent: SomeOtherBot` is not addressed to this request. */
    const out: string[] = [];
    let applies = false;
    for (const line of body.split(/\r?\n/)) {
      const t = line.replace(/#.*$/, "").trim();
      if (!t) continue;
      const [rawKey, ...rest] = t.split(":");
      const key = rawKey.trim().toLowerCase();
      const val = rest.join(":").trim();
      if (key === "user-agent") applies = val === "*" || val.toLowerCase() === "orbitbot";
      else if (key === "disallow" && applies && val) out.push(val);
    }
    return out;
  } catch {
    /* No robots.txt, or it would not load. The convention is that absent means
     * allowed; we do not invent a prohibition that the site did not state. */
    return [];
  }
}

/* -------------------------------------------------------------- extract --- */

const squash = (s: string | null | undefined, n: number): string | null => {
  if (!s) return null;
  const t = String(s).replace(/\s+/g, " ").trim().slice(0, n);
  return t || null;
};

function titleOf(html: string, L: ReturnType<typeof lib>): string | null {
  return (
    squash(L.meta(html, "og:title"), 240) ??
    squash(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] && L.plain(RegExp.$1), 240) ??
    squash(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] && L.plain(RegExp.$1), 240)
  );
}

export async function scrape(rawUrl: string, today: string): Promise<ScrapeResult | ScrapeFailure> {
  const checked = await resolve(rawUrl);
  if ("ok" in checked) return checked;
  const { url } = checked;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const disallow = await disallowedPaths(url.origin, controller.signal);
    const L = lib();
    if (!L.robotsAllows(url.toString(), disallow)) {
      return {
        ok: false,
        code: "robots",
        message: "That site's robots.txt asks us not to read this page. Enter the details by hand.",
      };
    }

    const res = await get(url, controller.signal, "text/html,application/xhtml+xml");
    if (isFailure(res)) return res;
    if (!res.ok) {
      return { ok: false, code: "http_error", message: `That page returned ${res.status}.` };
    }
    const ctype = res.headers.get("content-type") ?? "";
    if (ctype && !/text\/html|application\/xhtml|text\/plain/i.test(ctype)) {
      return { ok: false, code: "not_html", message: "That link is not a web page we can read." };
    }

    const body = await readCapped(res);
    if (typeof body !== "string") return body;
    if (body.trim().length < 200) {
      return { ok: false, code: "empty", message: "That page had nothing readable on it." };
    }

    const text = L.plain(body);
    const secs = L.sections(body);
    const dl = L.extractDeadline(body);
    const fund = L.extractFunding(text);
    const stipend = fund.stipend ?? fund.amounts[0] ?? null;

    const title = titleOf(body, L);
    const summary =
      squash(L.meta(body, "og:description"), 400) ?? squash(L.meta(body, "description"), 400) ?? squash(text, 400);
    const eligibility = squash(L.pickSection(secs, ["eligib", "who can apply", "requirement", "criteria"]), 4000);
    const benefits = squash(L.pickSection(secs, ["benefit", "what you get", "funding", "award", "cover"]), 4000);
    const howToApply = squash(L.pickSection(secs, ["how to apply", "application process", "apply"]), 4000);
    const documents = squash(L.pickSection(secs, ["document", "required document", "checklist"]), 2000);

    const missing: string[] = [];
    const want: [string, unknown][] = [
      ["title", title], ["summary", summary], ["deadline", dl.deadline],
      ["funding", fund.funding_kind], ["eligibility", eligibility],
      ["howToApply", howToApply], ["applyLink", L.extractApplyLink(body, text)],
    ];
    for (const [k, v] of want) if (!v) missing.push(k);

    /* Warnings, not rejections. The pipeline uses these to DROP a listing; a
     * staff member looking at the page is better placed to judge than we are,
     * so they are told and left to decide. */
    const warnings: string[] = [];
    if (title && L.isRoundup(title, summary ?? "")) {
      warnings.push("This looks like a roundup article listing many opportunities, not a single one.");
    }
    const audience = title ? L.audienceReject(title, summary ?? "") : null;
    if (audience) warnings.push(`This may not be open to BITS students (${audience}).`);
    if (dl.deadline && L.isPastDeadline(dl.deadline, today)) {
      warnings.push(`The deadline found on the page (${dl.deadline}) has already passed.`);
    }
    if (dl.deadline && !L.plausibleDeadline(dl.deadline, today, 3)) {
      warnings.push(`The deadline found (${dl.deadline}) is far enough out to be worth checking.`);
    }
    /* `.locked`, not the record itself: geoLock always returns an object, so
     * testing the record fired this on every single page. */
    const geo = L.geoLock(text);
    if (geo.locked) {
      warnings.push(
        geo.region === "identity"
          ? "The page suggests this is limited to a particular group of applicants."
          : `The page suggests a restriction to ${geo.region} applicants.`,
      );
    }

    return {
      ok: true,
      url: rawUrl,
      finalUrl: res.url || url.toString(),
      title,
      summary,
      deadline: dl.deadline,
      deadlineKind: dl.deadline_kind,
      deadlineNote: squash(dl.deadline_note, 160),
      funding: fund.funding_kind,
      covers: fund.covers ?? [],
      amount: stipend
        ? { currency: stipend.currency, value: stipend.amount, period: stipend.period, raw: stipend.raw ?? null }
        : null,
      duration: squash(L.extractDuration(text), 60),
      eligibility,
      benefits,
      howToApply,
      documents,
      applyLink: L.extractApplyLink(body, text),
      missing,
      warnings,
    };
  } finally {
    clearTimeout(timer);
  }
}

