/* The one binding to n8n/src/code/_lib_html.js.
 *
 * CLAUDE.md: "Shared HTML/date parsing lives only in n8n/src/code/_lib_html.js".
 * The admin desk's scraper needs exactly the extraction the pipeline already
 * does — deadlines, funding kind, amounts, duration, the apply link, the
 * eligibility section — so it binds to that file rather than growing a second
 * copy that would drift from it. Those functions have been read against fifteen
 * real sources and are covered by tests/parse.test.mjs; a reimplementation
 * would start with none of that.
 *
 * The file is pure (its own header promises no n8n globals and no require), so
 * importing it here is safe and bundles cleanly. It is CommonJS, which is why
 * this adapter exists at all: one place knows the path and the interop shape,
 * and everything else gets a typed surface.
 */

import "server-only";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);

/* A relative require, resolved at runtime from this file. Node resolves it on
 * the server; no bundler needs to follow it, which keeps the n8n tree out of
 * the client graph entirely. */
/* These signatures were read off _lib_html.js, not guessed. Two of them are
 * not what the names suggest and both cost a wrong assumption the first time:
 * extractDeadline and extractFunding return RECORDS, not a date and a string,
 * and extractDeadline only fires when a date sits next to a cue word
 * ("Deadline: 15 March 2027"), which is why a page that merely mentions a date
 * yields kind 'unknown' rather than a wrong date. */
type Money = { currency: string | null; amount: number; period: string | null; raw: string };

type Lib = {
  plain(html: string): string;
  sections(html: string): { heading: string; text: string }[];
  pickSection(secs: unknown, keywords: string[], minLen?: number): string;
  toISODate(s: string): string | null;
  extractDeadline(html: string): {
    deadline: string | null;
    /** 'fixed' | 'rolling' | 'varies' | 'unknown' */
    deadline_kind: string;
    deadline_note: string | null;
  };
  extractApplyLink(html: string, sectionText?: string): string | null;
  meta(html: string, name: string): string | null;
  extractAmounts(text: string, limit?: number): Money[];
  extractFunding(text: string): {
    funding_kind: string | null;
    covers: string[];
    amounts: Money[];
    stipend: Money | null;
  };
  extractDuration(text: string): string | null;
  extractTimeline(text: string): unknown;
  robotsAllows(url: string, disallow: string[]): boolean;
  plausibleDeadline(d: string, today: string, maxYears: number): boolean;
  isPastDeadline(d: string, today: string): boolean;
  isRoundup(title: string, summary: string): boolean;
  audienceReject(title: string, summary: string): string | null;
  /* Returns a RECORD, never a string. `if (geoLock(t))` is therefore always
   * true — which fired this warning on every page scraped and printed
   * "[object Object]" into it. audienceReject() is the one that returns a
   * string. */
  geoLock(text: string): { locked: boolean; region: string | null };
};


let cached: Lib | null = null;

export function lib(): Lib {
  if (cached) return cached;
  /* eslint-disable-next-line @typescript-eslint/no-var-requires */
  cached = require_("../../../n8n/src/code/_lib_html.js") as Lib;
  return cached;
}
