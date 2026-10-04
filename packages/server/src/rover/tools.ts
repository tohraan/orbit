/* Rover's hands: the four tools it is allowed to use, and their executors.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE. Chat is the interface; the index is
 * the source of truth. Rover never states a deadline, an amount or an
 * eligibility rule from its own memory — every fact it reports has to have
 * come back through one of these four functions, and every card the student
 * sees is a row `recommend` named by id. That is what keeps a language model
 * from inventing a scholarship that does not exist.
 *
 * All four read the SAME in-process index the rest of the API serves
 * (`getIndex()`), so a listing that has closed and left the index cannot be
 * recommended, and a filter means in chat exactly what it means on Explore —
 * `filter()` and `sort()` from @rof/core, not a second implementation that
 * would drift.
 *
 * They are read-only on purpose. Saving an opportunity and adding it to
 * Applications stay the student's own clicks on the card, because an agent
 * that writes to someone's collections has to be right about intent as well
 * as about data, and the card already carries both actions.
 */

import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import {
  DEADLINE_WINDOWS,
  FUNDING_BUCKETS,
  REQUIREMENTS,
  SORTS,
  daysUntil,
  facets,
  filter,
  formatMoney,
  fundingBucket,
  sort as sortItems,
  toSummary,
  type DeadlineWindow,
  type FundingBucket,
  type OpportunityDetail,
  type Query,
  type Requirement,
  type Sort,
} from "@rof/core";
import type { Index } from "../source";
import type { FunctionTool } from "./openrouter";

/* How many rows one search may put in front of the model.
 *
 * Eight, not forty. A tool result is re-sent with every subsequent turn of the
 * conversation, so a generous limit here is a cost that compounds for the rest
 * of the session — and a student cannot act on forty cards anyway. Rover is
 * told to narrow and search again rather than ask for more. */
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 12;

/** At most this many cards per answer, so a reply stays readable on a phone. */
export const MAX_CARDS = 6;

/* The prose fields are long — eligibility runs to 1,900 characters on an
 * opportunitiescircle page. `get_opportunity` is where Rover goes for them, and
 * even there they are trimmed: the question is always "does this student
 * qualify", which the first part of the section answers. */
const DETAIL_CHARS = 1200;
const SUMMARY_CHARS = 220;

function trim(v: string | null, max: number): string | null {
  if (!v) return null;
  const clean = v.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/* ------------------------------------------------------------- projection ---
 * What a row looks like to the model.
 *
 * Short keys and no nulls: a search result holding eight rows of the full
 * wire shape is most of a thousand tokens of `"deadlineNote": null`. Dropping
 * empty fields also stops the model reading a null as "no deadline" when what
 * the source actually said was nothing at all — absent means unstated, and the
 * prompt says so. */
type Brief = Record<string, unknown>;

function brief(o: OpportunityDetail): Brief {
  const days = daysUntil(o.deadline);
  const b: Brief = { id: o.id, title: o.title };
  if (o.type) b.type = o.type;
  if (o.levels.length) b.levels = o.levels;
  if (o.country) b.country = o.country;
  if (o.funding) b.funding = o.funding;
  if (o.deadline) {
    b.deadline = o.deadline;
    if (days != null) b.days_left = days;
  } else if (o.deadlineKind) {
    b.deadline = o.deadlineKind === "rolling" ? "rolling" : "not stated";
  }
  if (o.deadlineNote) b.deadline_note = trim(o.deadlineNote, 160);
  if (o.duration) b.duration = o.duration;
  const amount = formatMoney(o.amount);
  if (amount) b.amount = amount;
  b.source = o.sourceName;
  if (o.sourceTier) b.source_tier = o.sourceTier;
  const summary = trim(o.summary, SUMMARY_CHARS);
  if (summary) b.summary = summary;
  if (o.hasDetail) b.has_detail = true;
  return b;
}

/* ----------------------------------------------------------- the schemas ---
 * Written as plain JSON Schema rather than through a validation library,
 * because the executors below re-validate every value against the enums in
 * @rof/core anyway — a schema is a request, not a guarantee, and `filter()`
 * must never see a value Explore could not also produce. */

const ENUM_TYPE = [
  "scholarship",
  "fellowship",
  "internship",
  "research_internship",
  "grant",
  "award",
  "training",
  "competition",
  "summer_school",
  "exchange",
  "job",
];

const ENUM_LEVEL = ["bachelors", "masters", "phd", "postdoc", "any"];

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_opportunities",
    description:
      "Search the live index of open opportunities. Returns matching rows plus the total number of " +
      "matches, so you can tell a narrow result from an empty one. Combine filters freely; every " +
      "filter is AND. Prefer two or three narrow searches over one broad one. `q` is a full-text " +
      "probe over title, summary, country, type, funder and funding wording, and every word in it " +
      "must appear somewhere in a row, so keep it to one or two words.",
    /* strict: the executor still re-checks, but this stops the model inventing
     * a filter name and getting a silently ignored argument back. */
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        q: {
          type: ["string", "null"],
          /* Pass null, loudly and first. Watched live: a second-year CS student
           * got q:"computer science" stacked on level + type + country, which
           * is an AND over four things and came back empty twice before the
           * relaxation path found the one real row. The filters are indexed
           * values; `q` is a substring probe over prose, and no source
           * publishes field of study, so it is the weakest thing here and the
           * most expensive to be wrong about. */
          description:
            "PASS null ON YOUR FIRST SEARCH. Use the filters instead — they are real indexed " +
            "values, `q` is only a substring probe over the title and summary text. Add one or two " +
            "words of `q` ONLY to narrow a later search that came back with more rows than you can " +
            "show — never to narrow a result of six or fewer, which is already a card's worth. Every " +
            "word must appear in the row, so `q` plus two or more filters is almost always empty " +
            "even when the index holds exactly what was asked for. A subject like 'computer " +
            "science' is a poor `q`: no source publishes field of study.",
        },
        type: {
          type: ["array", "null"],
          items: { type: "string", enum: ENUM_TYPE },
          description: "Opportunity kinds to include. Omit for any kind.",
        },
        level: {
          type: ["array", "null"],
          items: { type: "string", enum: ENUM_LEVEL },
          description:
            "Degree levels. Include 'any' alongside a specific level: 189 of 431 rows are marked " +
            "'any' rather than naming a level, and leaving it out hides them.",
        },
        country: {
          type: ["array", "null"],
          items: { type: "string" },
          description:
            "Lowercase country values exactly as index_vocabulary lists them. 'online' is the value " +
            "that means remote. Most rows name no country at all and are excluded by this filter, so " +
            "use it only when the student has actually said where they want to go.",
        },
        funding: {
          type: ["array", "null"],
          items: { type: "string", enum: [...FUNDING_BUCKETS] },
          description: "Funding buckets. 'unspecified' means the source did not say.",
        },
        deadline: {
          type: ["string", "null"],
          enum: [...DEADLINE_WINDOWS],
          description:
            "Deadline window: d7/d30/d90/d180 for 'closes within N days', 'dated' for anything with " +
            "a date, 'rolling' for no deadline, 'any' for both. Only 111 of 431 rows carry a date, so " +
            "a window filter also throws away the 320 rolling ones.",
        },
        requires: {
          type: ["array", "null"],
          items: { type: "string", enum: [...REQUIREMENTS] },
          description:
            "Only rows that have: 'detail' (full eligibility prose), 'amount' (a stated figure), " +
            "'apply' (a direct application link).",
        },
        sort: {
          type: ["string", "null"],
          enum: [...SORTS],
          description:
            "'relevance' when q is set, 'deadline' for what closes soonest, 'amount' for the largest " +
            "stated figure, 'newest' for recently posted. Defaults to relevance with q, deadline without.",
        },
        limit: {
          type: ["integer", "null"],
          minimum: 1,
          maximum: MAX_LIMIT,
          description: `Rows to return, default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}.`,
        },
      },
      required: ["q", "type", "level", "country", "funding", "deadline", "requires", "sort", "limit"],
    },
  },
  {
    name: "index_vocabulary",
    description:
      "Every value the filters actually accept, with a count of rows for each. NOT A WARM-UP: do " +
      "not call this before your first search. A search result already tells you what the index " +
      "holds, and it answers the student as well. Call this only when a specific value is " +
      "genuinely in doubt after a search — a country or a kind you have not seen come back in a " +
      "result — because the index holds about 25 countries, not every country. Once per turn.",
    strict: true,
    input_schema: { type: "object", additionalProperties: false, properties: {}, required: [] },
  },
  {
    name: "get_opportunity",
    description:
      "The full record for one listing: eligibility, benefits, how to apply, the application link. " +
      "Use it to answer a specific question about one opportunity — whether an Indian national " +
      "qualifies, what the stipend covers, what the commitment is — not to pad a recommendation.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { id: { type: "integer", description: "The listing id from a search result." } },
      required: ["id"],
    },
  },
  {
    name: "recommend",
    description:
      "Show opportunities to the student as real portal cards — the same card Explore renders, with " +
      "its save, compare, calendar and apply controls live. This is the ONLY way to present an " +
      "opportunity: never list titles, deadlines or links in your own prose. Pass the ids you have " +
      `actually seen in a search result, at most ${MAX_CARDS}, best first, each with one short line ` +
      "saying why it fits THIS student. Then write a two or three sentence introduction in your reply; " +
      "do not repeat the per-card reasons there.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        picks: {
          type: "array",
          minItems: 1,
          maxItems: MAX_CARDS,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "integer", description: "Listing id from a search result." },
              why: {
                type: "string",
                description:
                  "One line, under 110 characters, specific to this student's stated constraints — " +
                  "'fully funded and no GRE' not 'a great opportunity'.",
              },
            },
            required: ["id", "why"],
          },
        },
      },
      required: ["picks"],
    },
  },
];

/* Our schemas, in the shape OpenRouter wants.
 *
 * TOOLS above stays the single source of truth and keeps the Anthropic shape
 * (`input_schema`, top-level `strict`) because that is the shape the schemas
 * were written and reviewed in. This is a mechanical rename: `input_schema`
 * becomes `function.parameters`, and `strict` moves inside `function`.
 *
 * `strict` is passed through but must not be relied on. The free models this
 * runs against are served by a dozen different providers and several of them
 * ignore it — the probe that pinned this wire format came back with
 * `funding: ["fully funded"]` against an enum that says `fully_funded`. That
 * is why `queryFrom()` below normalises rather than trusting. */
export function toolsForOpenRouter(tools: Anthropic.Tool[]): FunctionTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description ?? "",
      parameters: t.input_schema as Record<string, unknown>,
      ...(t.strict ? { strict: true } : {}),
    },
  }));
}

/* ---------------------------------------------------------- the executors --- */

/** A `recommend` call, resolved against the index and ready for the client. */
export type Recommendation = {
  items: ReturnType<typeof toSummary>[];
  /** Keyed by id, so the card and its reason cannot come apart in transit. */
  why: Record<number, string>;
};

export type ToolOutcome = {
  /** What goes back to the model as the tool_result. */
  result: unknown;
  isError?: boolean;
  /** Cards to push to the browser — only `recommend` ever sets this. */
  cards?: Recommendation;
  /** A short line for the UI's activity row, in the student's language. */
  status?: string;
};

/* Words a model writes when it means "no value".
 *
 * This cost a whole turn to find. Asked for fully funded master's
 * fellowships, the model sent `q: "None"` — a Python null, as a string —
 * alongside three perfectly good filters. Every word of `q` must appear in a
 * row, so "none" matched nothing, and the real answer (29 rows) came back as
 * "nothing matched" four times over until the step ceiling stopped it.
 *
 * TWO SETS, and the difference matters. `any` and `all` are also what a model
 * writes in a required field it does not want to use — but `any` is a REAL
 * level in this index, carried by 189 of 426 rows, and the search tool's own
 * description tells the model to pass it. So the broad set only ever applies
 * to free text; a filter VALUE is judged by the narrow one and then by the
 * real enum. */
const NULLISH_TEXT = new Set(["none", "null", "nil", "undefined", "n/a", "na", "-", "any", "all"]);
const NULLISH_VALUE = new Set(["none", "null", "nil", "undefined", "n/a", "na", "-"]);

/* Tolerant on purpose.
 *
 * Three things a weaker model does that a strict reader would throw away:
 * it sends a bare string where the schema says array ("masters"), it writes
 * an enum in prose ("fully funded" for `fully_funded`), and it pads with
 * empty strings. None of those is the student's fault, and none of them is
 * worth an empty result — so the shape is coerced and the SPACING is
 * normalised, while the VALUE itself is still checked against the real enum
 * afterwards. A value that is genuinely not ours is still dropped. */
const asArray = (v: unknown): string[] => {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.toLowerCase().trim().replace(/[\s-]+/g, "_"))
    .filter((x) => x && !NULLISH_VALUE.has(x));
};

/* Countries are the exception: they are open-ended in the data and hold real
 * spaces (`south korea`, `islamabad pakistan`), so underscoring them would
 * stop every multi-word country matching. */
const asCountries = (v: unknown): string[] => {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.toLowerCase().trim().replace(/_+/g, " ").replace(/\s+/g, " "))
    .filter((x) => x && !NULLISH_VALUE.has(x));
};

const within = <T extends string>(values: string[], allowed: readonly T[]): T[] =>
  values.filter((v): v is T => (allowed as readonly string[]).includes(v));

/* A full Query, built from scratch rather than from a URL.
 *
 * Every field is set explicitly: `filter()` and `sort()` read all of them, and
 * a partial object would make a missing key behave like whichever default
 * happened to be falsy. */
function queryFrom(input: Record<string, unknown>, vocabulary: Set<string>): Query {
  const rawQ = typeof input.q === "string" ? input.q.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  const q = NULLISH_TEXT.has(rawQ.toLowerCase()) ? "" : rawQ;
  const limit = Number.isInteger(input.limit) ? Math.min(MAX_LIMIT, Math.max(1, input.limit as number)) : DEFAULT_LIMIT;
  const requested = typeof input.sort === "string" ? (input.sort as Sort) : null;
  const deadline = typeof input.deadline === "string" ? (input.deadline as DeadlineWindow) : "any";

  return {
    q,
    ids: [],
    type: asArray(input.type),
    /* Countries are open-ended in the data (`islamabad pakistan` is a value),
     * so they cannot be enum-checked — but a value that is not in the index at
     * all is dropped rather than silently matching nothing, which is the
     * difference between "no rows in Germany" and "I misspelled Germany". */
    country: asCountries(input.country).filter((c) => vocabulary.has(c)),
    /* Through `fundingBucket()` rather than a bare enum check: it is the same
     * function that normalises the SOURCES' uneven wording ("fully funded"
     * and "fully_funded" are both in the index), so it already knows how to
     * read a model that wrote the bucket in prose. An unrecognisable value
     * becomes `unspecified`, which is a real bucket, so it is dropped here
     * instead — asking for unspecified funding is not what the model meant. */
    funding: [
      ...new Set(
        asArray(input.funding)
          .map((v) => fundingBucket(v))
          .filter((v) => v !== "unspecified"),
      ),
    ] as FundingBucket[],
    level: asArray(input.level),
    source: [],
    tier: [],
    deadline: (DEADLINE_WINDOWS as readonly string[]).includes(deadline) ? deadline : "any",
    requires: within(asArray(input.requires), REQUIREMENTS) as Requirement[],
    sort: requested && (SORTS as readonly string[]).includes(requested) ? requested : q ? "relevance" : "deadline",
    /* `mixed` is the only sort that reads the seed, and Rover is not offered a
     * reason to shuffle: a recommendation has to be reproducible. */
    seed: "",
    page: 1,
    pageSize: limit,
  };
}

export function runTool(name: string, raw: unknown, index: Index): ToolOutcome {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  if (name === "index_vocabulary") {
    const f = facets(index.items);
    return {
      status: "Checking what the index covers",
      result: {
        total_open_calls: index.items.length,
        type: f.type.map((b) => `${b.value} (${b.count})`),
        level: f.level.map((b) => `${b.value} (${b.count})`),
        country: f.country.map((b) => `${b.value} (${b.count})`),
        funding: f.funding.map((b) => `${b.value} (${b.count})`),
        source: f.source.map((b) => `${b.value} (${b.count})`),
        note:
          "Counts are rows carrying that value. A row with no country, no level or no deadline is " +
          "excluded by a filter on it. fields_of_study is empty on every row — no source publishes " +
          "it — so match a subject through `q` against the title and summary instead.",
      },
    };
  }

  if (name === "search_opportunities") {
    const vocabulary = new Set(facets(index.items).country.map((b) => b.value));
    const query = queryFrom(input, vocabulary);
    const matched = sortItems(filter(index.items, query), query);
    const shown = matched.slice(0, query.pageSize);

    /* The dropped filters are reported back. Without this the model cannot
     * tell "there is nothing in Germany" from "germany is not a value here",
     * and it would guess — usually by telling the student there is nothing. */
    const asked = asCountries(input.country);
    const dropped = asked.filter((c) => !vocabulary.has(c));

    /* When nothing matched, say WHICH constraint did it.
     *
     * Earned the hard way. A model that is told only "total: 0" guesses at
     * which filter to drop, and on a 50-request-a-day budget it does not get
     * four guesses — the first live run spent the whole step ceiling
     * re-searching and told the student there was nothing, when there were 29
     * rows behind one bad parameter.
     *
     * So each applied filter is removed in turn and the result counted. It is
     * four or five extra passes over 426 rows in memory, costs nothing
     * measurable, and turns a dead end into one obvious next move. */
    const relaxed = matched.length === 0 ? relaxations(index, query) : undefined;

    return {
      status: searchStatus(query, matched.length),
      result: {
        total: matched.length,
        returned: shown.length,
        applied: {
          q: query.q || undefined,
          type: query.type.length ? query.type : undefined,
          level: query.level.length ? query.level : undefined,
          country: query.country.length ? query.country : undefined,
          funding: query.funding.length ? query.funding : undefined,
          deadline: query.deadline !== "any" ? query.deadline : undefined,
          requires: query.requires.length ? query.requires : undefined,
          sort: query.sort,
        },
        ...(dropped.length
          ? {
              ignored_country_values: dropped,
              hint: "Those values are not in the index. Call index_vocabulary for the ones that are.",
            }
          : {}),
        ...(relaxed && Object.keys(relaxed).length
          ? {
              nothing_matched: relaxed,
              hint:
                "Each number is how many rows there would be with that one constraint dropped and " +
                "the rest kept. Drop the one that is costing the most, tell the student which " +
                "requirement you relaxed, and search once more — do not keep guessing.",
            }
          : {}),
        funding_covers: "NOT RECORDED. These rows carry a funding bucket only. What the money " +
          "covers — tuition, stipend, travel, insurance, accommodation — is not in the index and " +
          "must not appear in your answer. Say the bucket (\"fully funded\") and nothing more. If " +
          "the student asks what one covers, call get_opportunity for that id.",
        items: shown.map(brief),
      },
    };
  }

  if (name === "get_opportunity") {
    const id = Number.isInteger(input.id) ? (input.id as number) : null;
    const row = id == null ? undefined : index.byId.get(id);
    if (!row) {
      return {
        isError: true,
        result: {
          error: "no_such_listing",
          message:
            "No open listing has that id. It may have closed and left the index. Search again rather " +
            "than describing it from memory.",
        },
      };
    }
    return {
      status: `Reading the full listing for ${row.title}`,
      result: {
        ...brief(row),
        url: row.url,
        apply_link: row.applyLink,
        eligibility: trim(row.eligibility, DETAIL_CHARS),
        benefits: trim(row.benefits, DETAIL_CHARS),
        how_to_apply: trim(row.howToApply, DETAIL_CHARS),
        documents: trim(row.documents, 400),
        /* Said out loud because the prose is cut: the model should not infer
         * that an eligibility rule is absent when it was merely truncated. */
        note: "Prose fields are trimmed. Point the student at the listing for the full text.",
      },
    };
  }

  if (name === "recommend") {
    const picks = Array.isArray(input.picks) ? input.picks.slice(0, MAX_CARDS) : [];
    const items: OpportunityDetail[] = [];
    const why: Record<number, string> = {};
    const unknown: number[] = [];

    for (const pick of picks) {
      const p = (pick && typeof pick === "object" ? pick : {}) as Record<string, unknown>;
      const id = Number.isInteger(p.id) ? (p.id as number) : null;
      const row = id == null ? undefined : index.byId.get(id);
      if (!row || id == null) {
        if (id != null) unknown.push(id);
        continue;
      }
      /* First mention wins, so a repeated id cannot render the same card twice. */
      if (why[id] !== undefined) continue;
      items.push(row);
      why[id] = typeof p.why === "string" ? p.why.replace(/\s+/g, " ").trim().slice(0, 160) : "";
    }

    if (!items.length) {
      return {
        isError: true,
        result: {
          error: "nothing_shown",
          message:
            unknown.length
              ? `None of those ids (${unknown.join(", ")}) is an open listing. Search again and recommend ids from the result.`
              : "No ids were given, so no cards were shown. Pass ids from a search result.",
        },
      };
    }

    return {
      status: items.length === 1 ? "Showing 1 opportunity" : `Showing ${items.length} opportunities`,
      cards: { items: items.map(toSummary), why },
      result: {
        shown: items.map((o) => ({ id: o.id, title: o.title })),
        ...(unknown.length ? { not_shown: unknown, reason: "not open listings" } : {}),
        note:
          "The cards are now on screen with their own save, compare and apply controls. Write your " +
          "introduction; do not repeat the per-card reasons or restate deadlines in prose.",
        funding_covers: "NOT RECORDED. These cards carry a funding bucket only. What the money " +
          "covers — tuition, stipend, travel, insurance, accommodation — is not in the index and " +
          "must not appear in your answer. Say the bucket (\"fully funded\") and nothing more. If " +
          "the student asks what one covers, call get_opportunity for that id.",
      },
    };
  }

  return { isError: true, result: { error: "unknown_tool", message: `There is no tool called ${name}.` } };
}

/* Which single constraint emptied the result.
 *
 * One pass per applied filter, each with that filter alone removed. Only the
 * ones that actually change the answer are reported: a filter that still
 * yields nothing when dropped is not the problem, and listing it would send
 * the model after the wrong thing. */
function relaxations(index: Index, query: Query): Record<string, number> {
  const count = (patch: Partial<Query>): number => filter(index.items, { ...query, ...patch }).length;
  const out: Record<string, number> = {};
  if (query.q) out["without q"] = count({ q: "" });
  if (query.type.length) out["without type"] = count({ type: [] });
  if (query.level.length) out["without level"] = count({ level: [] });
  if (query.country.length) out["without country"] = count({ country: [] });
  if (query.funding.length) out["without funding"] = count({ funding: [] });
  if (query.deadline !== "any") out["without the deadline window"] = count({ deadline: "any" });
  if (query.requires.length) out["without requires"] = count({ requires: [] });
  /* A level filter that names a specific level but not `any` hides the 189
   * rows the sources left unlabelled. That is the single most common way to
   * miss rows here, so it is called out by name rather than left implicit. */
  if (query.level.length && !query.level.includes("any")) {
    const withAny = count({ level: [...query.level, "any"] });
    if (withAny > 0) out["adding 'any' to level"] = withAny;
  }
  return Object.fromEntries(Object.entries(out).filter(([, n]) => n > 0));
}

/* The activity line the student sees while a search runs. Written from the
 * query rather than from the model's own words, so it cannot describe a search
 * that did not happen. */
function searchStatus(q: Query, total: number): string {
  const bits: string[] = [];
  if (q.funding.includes("fully_funded")) bits.push("fully funded");
  if (q.level.length) bits.push(q.level.filter((l) => l !== "any").join(" / "));
  if (q.type.length) bits.push(q.type.join(" / ").replace(/_/g, " "));
  else bits.push("opportunities");
  if (q.country.length) bits.push(`in ${q.country.join(", ")}`);
  if (q.q) bits.push(`matching “${q.q}”`);
  const what = bits.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return total ? `Searched ${what} — ${total} found` : `Searched ${what} — nothing matched`;
}
