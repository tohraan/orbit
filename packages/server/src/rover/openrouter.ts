/* The model transport: OpenRouter, over plain fetch.
 *
 * WHY FETCH AND NOT AN SDK. OpenRouter speaks the OpenAI chat-completions
 * shape, and the only part of it this agent needs is one streaming POST. The
 * wire format below was captured from a real response rather than recalled —
 * frames are `data: {…}` with a `[DONE]` sentinel, text arrives on
 * `choices[0].delta.content`, a tool call arrives as `delta.tool_calls[]` whose
 * `function.arguments` is a STRING accumulated across frames, and some models
 * also stream `delta.reasoning`, which is their thinking and is deliberately
 * dropped on the floor here.
 *
 * WHY THE RATE LIMITING IS THE BIG PART OF THIS FILE. The Anthropic key this
 * was first written against is per-deployment and generous. An OpenRouter free
 * key is neither: it is ONE shared bucket for every student using the portal,
 * capped at 50 model requests PER DAY, and a single conversational turn can
 * spend three of them (search, recommend, answer). So the budget is not a
 * courtesy guard here the way packages/server/src/rate-limit.ts is — it is the
 * difference between a demo that works and a key that is exhausted by lunch.
 *
 * Four layers, outermost first:
 *
 *   1. per-client, per-minute      — rate-limit.ts, in the route handler
 *   2. per-key, per-minute         — `window` below; one student cannot spend
 *                                    everyone else's minute
 *   3. concurrency                 — `gate` below; free endpoints 429 readily
 *                                    under parallel load, and a queue that
 *                                    waits is better than a retry storm
 *   4. the daily budget            — `budget` below, read from OpenRouter
 *                                    itself rather than guessed
 *
 * Layers 2–4 are process-local, with the same honesty as rate-limit.ts: they
 * survive neither a restart nor a second serverless instance. That is a real
 * limitation and it is why layer 4 asks OPENROUTER for the true remaining
 * count rather than trusting its own counter — the counter only stops this
 * instance running ahead of a number it has not refreshed yet.
 */

import "server-only";

/* OPENROUTER_BASE_URL exists so tests/rover-loop.test.mjs can point the whole
 * transport at a local fake that speaks the same protocol. It is not a feature
 * for production — there is one OpenRouter — and it is read once here rather
 * than threaded through every call site. */
const BASE = (process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
const ENDPOINT = `${BASE}/chat/completions`;
const KEY_ENDPOINT = `${BASE}/key`;

/* The default model.
 *
 * It has to do three things at once: follow a long behavioural prompt, emit a
 * well-formed tool call, and sound like a person. This one was probed against
 * the real endpoint and produced a correct `search_opportunities` call on the
 * first attempt from a one-line instruction.
 *
 * `:free` is not incidental — a key with no credits can only run `:free`
 * variants, and asking for a paid model returns 402 rather than falling back.
 * Set ROVER_MODEL to override; put a credited key in and a stronger model is
 * one environment variable away. */
const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

/* The tunables, read at CALL time rather than at module load.
 *
 * Not a style choice: these are the numbers an operator changes when a demo is
 * about to start and the numbers tests/rover-loop.test.mjs moves between
 * scenarios, and a `const` captured at import makes both impossible — the test
 * that claims to prove the per-key window would quietly prove nothing. One
 * `process.env` read per model request is free next to the request itself.
 *
 * Layer 2. Twenty a minute across the whole key: enough that a demo in front
 * of judges never queues, small enough that a loop in someone's code cannot
 * spend the day's budget in thirty seconds.
 *
 * Layer 3. Two at a time. Free providers are shared infrastructure and answer
 * parallel load with 429s; the third request waits rather than being refused,
 * because a student who waited two seconds got an answer and a student who was
 * refused did not.
 *
 * Layer 4. `RESERVE` stops short of zero, so a judge's last question still
 * works and a second instance that has not refreshed yet has room to be wrong
 * in. `TTL` is how long a budget reading is trusted before asking again. */
const num = (name: string, fallback: number): number => {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
};
const perMinute = () => num("ROVER_PER_MINUTE", 20);
const concurrency = () => Math.max(1, num("ROVER_CONCURRENCY", 2));
const budgetReserve = () => num("ROVER_BUDGET_RESERVE", 2);
const budgetTtlMs = () => num("ROVER_BUDGET_TTL_MS", 60_000);
const QUEUE_WAIT_MS = 15_000;

const MAX_ATTEMPTS = 3;
/* The upstream can sit thinking for a while on a free endpoint; this is the
 * ceiling on one attempt, not on a turn. */
const REQUEST_TIMEOUT_MS = 90_000;

export function configured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export function model(): string {
  return process.env.ROVER_MODEL?.trim() || DEFAULT_MODEL;
}

/** Raised for a condition the student should be told about in plain words. */
export class RoverBusy extends Error {}
export class RoverExhausted extends Error {}
export class RoverUnavailable extends Error {}

/* ------------------------------------------------------- shared state ---
 * On globalThis for the same reason source.ts puts its index there: Next
 * compiles route handlers and instrumentation into different bundles, so a
 * module-level binding is not guaranteed to be the same object across them.
 * A limiter with two copies of its own counter is not a limiter. */
type State = {
  /** Timestamps of recent upstream calls, for the per-minute window. */
  window: number[];
  /** In-flight upstream calls. */
  active: number;
  /** Remaining daily free requests as last reported, and when. */
  budget: { remaining: number; limit: number; at: number } | null;
};
const KEY = Symbol.for("rof.rover.limits");
const state: State = ((globalThis as Record<symbol, unknown>)[KEY] as State) ?? {
  window: [],
  active: 0,
  budget: null,
};
(globalThis as Record<symbol, unknown>)[KEY] = state;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------ budget ---
 * OpenRouter reports the free-tier daily allowance on its key endpoint, and
 * that call does NOT itself count against the allowance — which is what makes
 * asking better than guessing. A failure to read it is not fatal: the local
 * counter still applies, so the worst case is that this instance keeps its own
 * conservative tally.
 */
async function refreshBudget(key: string): Promise<void> {
  if (state.budget && Date.now() - state.budget.at < budgetTtlMs()) return;
  try {
    const res = await fetch(KEY_ENDPOINT, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`key endpoint ${res.status}`);
    const body = (await res.json()) as {
      data?: { free_model_daily_requests?: { used?: number; limit?: number; remaining?: number } };
    };
    const free = body.data?.free_model_daily_requests;
    if (free && typeof free.remaining === "number") {
      state.budget = { remaining: free.remaining, limit: free.limit ?? 0, at: Date.now() };
    }
  } catch (err) {
    /* Logged, not thrown. A budget we cannot read is a reason to be careful,
     * not a reason to refuse everybody. */
    console.error("[rover] could not read the OpenRouter budget:", err instanceof Error ? err.message : err);
    if (state.budget) state.budget.at = Date.now();
  }
}

/** What is left of today's allowance, for the UI and the health check. */
export function budgetSnapshot(): { remaining: number; limit: number; stale: boolean } | null {
  if (!state.budget) return null;
  return {
    remaining: Math.max(0, state.budget.remaining),
    limit: state.budget.limit,
    stale: Date.now() - state.budget.at >= budgetTtlMs(),
  };
}

/* ------------------------------------------------------------- gating --- */
async function admit(key: string): Promise<void> {
  await refreshBudget(key);

  const b = state.budget;
  const reserve = budgetReserve();
  if (b && b.remaining <= reserve) {
    throw new RoverExhausted(
      `the day's ${b.limit} free model requests are spent (${b.remaining} left, ${reserve} held back)`,
    );
  }

  /* Per-minute window. Pruned on every pass, so the array cannot grow. */
  const now = Date.now();
  state.window = state.window.filter((t) => now - t < 60_000);
  const limit = perMinute();
  if (state.window.length >= limit) {
    throw new RoverBusy(`${limit} model requests already made this minute`);
  }

  /* Concurrency. Waits rather than refusing, up to QUEUE_WAIT_MS. */
  const until = now + QUEUE_WAIT_MS;
  const slots = concurrency();
  while (state.active >= slots) {
    if (Date.now() > until) throw new RoverBusy("too many answers in flight");
    await sleep(250);
  }

  state.active += 1;
  state.window.push(Date.now());
  /* Spend it locally the moment it is committed. The refresh will correct
   * this, but between refreshes an optimistic counter is how a budget gets
   * overrun. */
  if (state.budget) state.budget.remaining -= 1;
}

function release(): void {
  state.active = Math.max(0, state.active - 1);
}

/* -------------------------------------------------------------- types --- */

/** A tool, in the shape OpenRouter wants. `toolsFor()` converts ours. */
export type FunctionTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
  };
};

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "calls"; calls: ToolCall[]; finish: string | null }
  | { type: "end"; finish: string | null };

/* ------------------------------------------------------------ the call --- */

/**
 * One streaming turn. Yields text as it arrives, then either the tool calls
 * the model made or a plain end.
 *
 * Retries only what retrying can fix: a 429, a 5xx, and a network failure, and
 * only before any output has been emitted — once a token is out, re-issuing
 * would duplicate it on the student's screen.
 */
export async function* chat(opts: {
  messages: ChatMessage[];
  tools: FunctionTool[];
  maxTokens: number;
  /* "auto" normally. "none" is how the loop forces a final answer on its last
   * step: the tools stay in the request, so the model can still see what it
   * called earlier in the transcript, but it cannot call another one and has
   * to write prose instead. Sending an empty `tools` array would do it too,
   * and some providers reject that. */
  toolChoice?: "auto" | "none";
  signal?: AbortSignal;
}): AsyncGenerator<ChatEvent> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new RoverUnavailable("OPENROUTER_API_KEY is not set");

  for (let attempt = 1; ; attempt++) {
    await admit(key);
    let emitted = false;
    /* The concurrency slot is held exactly once per attempt. A flag rather
     * than a bare `release()` call, because every exit from the block below —
     * a retry `continue`, a `return`, a throw, or the consumer abandoning the
     * generator when the student closes the tab — passes through `finally`,
     * and a slot released twice silently frees somebody else's. */
    let held = true;
    const letGo = () => {
      if (held) {
        held = false;
        release();
      }
    };
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
          /* OpenRouter attributes traffic with these. Honest identification is
           * the same courtesy the scrapers extend to the sources. */
          "http-referer": process.env.ROVER_SITE_URL?.trim() || "https://orbit-ruby-five-16.vercel.app",
          /* ASCII only. A header value is a ByteString, so the em dash this
           * started with ("Orbit — BITS Pilani Dubai") threw
           * `Cannot convert argument to a ByteString` before the request ever
           * left the process — and the retry loop then tried it twice more. */
          "x-title": "Orbit - BITS Pilani Dubai",
        },
        body: JSON.stringify({
          model: model(),
          stream: true,
          max_tokens: opts.maxTokens,
          /* Low, deliberately. This is a chat: a model that writes five
           * paragraphs when one would do is both slower and worse here. */
          temperature: 0.4,
          tools: opts.tools,
          tool_choice: opts.toolChoice ?? "auto",
          messages: opts.messages,
          /* Return the usage frame so the cost of a turn is observable. */
          usage: { include: true },
        }),
        signal: opts.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });

      if (!res.ok || !res.body) {
        const detail = (await res.text().catch(() => "")).slice(0, 400);
        /* 429 and 5xx are worth another attempt; 401/402/404 are not — a bad
         * key, no credits, or a model this key cannot run will not fix itself. */
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < MAX_ATTEMPTS) {
          const after = Number(res.headers.get("retry-after"));
          const wait = Number.isFinite(after) && after > 0 ? after * 1000 : 800 * 2 ** (attempt - 1);
          console.error(`[rover] upstream ${res.status}, retrying in ${wait}ms (attempt ${attempt})`);
          letGo();
          await sleep(Math.min(wait, 8_000));
          continue;
        }
        if (res.status === 402) {
          throw new RoverExhausted("this OpenRouter key has no credit for the model requested");
        }
        if (res.status === 429) {
          throw new RoverBusy("OpenRouter is rate limiting this key");
        }
        throw new Error(`openrouter ${res.status}: ${detail}`);
      }

      /* ---- the stream ----
       * Frames are separated by a blank line and a chunk can split one
       * anywhere, so the tail is carried over. Tool-call arguments arrive as
       * string fragments keyed by `index` and are accumulated. */
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finish: string | null = null;
      const building = new Map<number, { id: string; name: string; args: string }>();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          let parsed: {
            choices?: {
              delta?: { content?: string | null; tool_calls?: Partial<ToolCall & { index: number }>[] };
              finish_reason?: string | null;
            }[];
            error?: { message?: string };
          };
          try {
            parsed = JSON.parse(payload);
          } catch {
            /* A frame we cannot parse is skipped rather than fatal: a comment
             * or a keep-alive from a provider is not an error. */
            continue;
          }

          /* OpenRouter reports a mid-stream failure in-band, with a 200
           * already sent. Surfacing it as a throw lets the caller tell the
           * student rather than ending the answer in silence. */
          if (parsed.error?.message) throw new Error(`openrouter stream: ${parsed.error.message}`);

          const choice = parsed.choices?.[0];
          if (!choice) continue;
          if (choice.finish_reason) finish = choice.finish_reason;

          const text = choice.delta?.content;
          if (text) {
            emitted = true;
            yield { type: "text", text };
          }

          for (const part of choice.delta?.tool_calls ?? []) {
            const index = typeof part.index === "number" ? part.index : 0;
            const slot = building.get(index) ?? { id: "", name: "", args: "" };
            if (part.id) slot.id = part.id;
            if (part.function?.name) slot.name = part.function.name;
            if (part.function?.arguments) slot.args += part.function.arguments;
            building.set(index, slot);
          }
        }
      }

      const calls: ToolCall[] = [...building.entries()]
        .sort((a, b) => a[0] - b[0])
        .filter(([, c]) => c.name)
        .map(([index, c]) => ({
          /* Some providers omit the id. One is synthesised so the tool_result
           * can still be addressed back to its call. */
          id: c.id || `call_${index}`,
          type: "function" as const,
          function: { name: c.name, arguments: c.args },
        }));

      if (calls.length) yield { type: "calls", calls, finish };
      else yield { type: "end", finish };
      return;
    } catch (err) {
      letGo();
      /* A caller-side abort is the student sending the next message. */
      if (err instanceof RoverBusy || err instanceof RoverExhausted || err instanceof RoverUnavailable) throw err;
      if ((err as Error)?.name === "AbortError") throw err;
      const network = err instanceof TypeError || (err as Error)?.name === "TimeoutError";
      if (network && !emitted && attempt < MAX_ATTEMPTS) {
        console.error(`[rover] ${(err as Error).message}, retrying (attempt ${attempt})`);
        await sleep(600 * attempt);
        continue;
      }
      throw err;
    } finally {
      /* Covers every exit the paths above did not already take, including the
       * generator being abandoned mid-stream. */
      letGo();
    }
  }
}
