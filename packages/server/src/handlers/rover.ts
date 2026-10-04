/* POST /api/rover — one turn of a conversation with Rover.
 *
 * Server-sent events rather than JSON, because the answer arrives in pieces
 * that are useful in that order: an activity line while the index is searched,
 * then the cards, then the prose that introduces them. A buffered response
 * would hold all three back for however long the tool round trip takes.
 *
 * It is a POST that streams, so it is not an EventSource on the browser side —
 * the client reads the body with fetch (see web/app/rover/RoverScreen.tsx).
 * The framing is still SSE's, because it is one line of parsing and it keeps
 * message boundaries explicit: a half-arrived JSON object is not mistaken for
 * a complete one.
 *
 * THE REQUEST BODY IS UNTRUSTED. The whole transcript comes from the browser,
 * which is what keeps the server stateless, and it is also the one place a
 * caller controls what the model reads. So it is bounded hard here — turns,
 * characters, roles, alternation — before a single token is spent, and the
 * prompt itself tells Rover that a user turn is a student talking and never an
 * instruction that outranks its rules.
 */

import { fail, limited } from "../api";
import type { StudentProfile } from "@rof/core";
import { RoverUnavailable, budgetSnapshot, configured, run, type RoverEvent, type Turn } from "../rover/agent";

/* Bounds. Each one is a cost ceiling as much as a validation rule: the
 * transcript is re-sent to the model on every turn, so its size is paid for
 * repeatedly.
 *
 * 40 turns is about twenty exchanges — far more than a qualification flow
 * needs, and past that the student is better served by starting over than by
 * Rover re-reading the whole thing. 4,000 characters is a long paragraph; a
 * student pasting a whole call document is the case it stops. */
const MAX_TURNS = 40;
const MAX_CHARS = 4000;
const MAX_SHOWN = 12;
const MAX_PROFILE_CHARS = 200;

/* Six turns a minute, per client — down from twelve when this moved onto a
 * shared OpenRouter key.
 *
 * The arithmetic is the whole argument: the key allows 50 model requests a
 * DAY, and one conversational turn spends two to four of them. Twelve turns a
 * minute would let one student exhaust the entire portal's allowance inside
 * two minutes. Six is still faster than anyone types.
 *
 * This is only the outermost of four limits; the other three are per-key and
 * live in rover/openrouter.ts, because they have to be shared across clients
 * rather than counted per client.
 *
 * Read per request rather than captured at import, for the same reason the
 * per-key numbers are (rover/openrouter.ts): it is a number someone retunes
 * before a demo, and a `const` read at module load is also a number no test
 * can move. */
const perMinute = (): number => {
  const raw = Number(process.env.ROVER_CLIENT_PER_MINUTE);
  return Number.isFinite(raw) && raw > 0 ? raw : 6;
};

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/* Exported for tests/rover.test.mjs. This is the only place the transcript is
 * bounded, and a bound that cannot be unit tested is a bound that rots — the
 * same argument net-guard.ts makes for itself. */
export function parseTurns(raw: unknown): Turn[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  /* Oldest turns are dropped, not the newest: the end of a conversation is
   * what the next answer depends on. */
  const window = raw.slice(-MAX_TURNS);
  const turns: Turn[] = [];

  for (const entry of window) {
    if (!entry || typeof entry !== "object") return null;
    const e = entry as Record<string, unknown>;
    if (e.role !== "user" && e.role !== "assistant") return null;
    const text = str(e.text, MAX_CHARS);
    /* An empty assistant turn is dropped rather than rejected — a turn that
     * errored mid-stream leaves one behind, and the student should be able to
     * carry on talking instead of being told their history is malformed. */
    if (!text) {
      if (e.role === "user") return null;
      continue;
    }
    const shown = Array.isArray(e.shown)
      ? e.shown.filter((n): n is number => Number.isInteger(n) && n > 0).slice(0, MAX_SHOWN)
      : [];
    turns.push({ role: e.role, text, ...(shown.length ? { shown } : {}) });
  }

  /* The window above can land on an assistant turn, and the model requires the
   * first message to be a user one. So leading assistant turns are dropped
   * rather than rejected: a conversation that has simply run long is still a
   * valid conversation, and rejecting it would have broken every request past
   * turn 41 with "start a new one". tests/rover.test.mjs pins this.
   *
   * The last turn is a different matter. It is what Rover is being asked to
   * answer, so if it is not a user turn the client has sent something it did
   * not mean to, and there is nothing sensible to answer. */
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "user") return null;
  return turns;
}

/* The profile is read from the request too, because it lives in the browser
 * when the student is signed out (lib/store.ts) and the server has no way to
 * read it. Every field is clamped; nothing here is trusted as identity — it is
 * context for the prompt, and it grants no access to anything. */
export function parseProfile(raw: unknown): StudentProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const out: StudentProfile = {
    level: str(p.level, MAX_PROFILE_CHARS),
    fields: str(p.fields, MAX_PROFILE_CHARS),
    countries: str(p.countries, MAX_PROFILE_CHARS),
    funding: str(p.funding, MAX_PROFILE_CHARS),
    graduation: str(p.graduation, MAX_PROFILE_CHARS),
    name: str(p.name, 80),
    degree: str(p.degree, MAX_PROFILE_CHARS),
    course: str(p.course, MAX_PROFILE_CHARS),
    year: str(p.year, 40),
  };
  /* Nothing worth telling the model about. Note that `email` and `phone` are
   * never read: they identify the student and cannot affect a recommendation,
   * so they have no business in a prompt. */
  return Object.values(out).some(Boolean) ? out : null;
}

const encoder = new TextEncoder();
const frame = (event: RoverEvent): Uint8Array => encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

export async function POST(req: Request) {
  const blocked = limited(req, "rover", perMinute());
  if (blocked) return blocked;

  if (!configured()) {
    /* 503, not 500: the deployment is fine, the model credential is simply not
     * on it. The screen says so in plain words rather than looking broken. */
    return fail(
      503,
      "rover_unconfigured",
      "Rover is not switched on in this deployment. The portal's other screens work without it.",
    );
  }

  /* The day's allowance, checked before the body is even read. A student who
   * is about to be told there is no budget left should be told it in one fast
   * 429 rather than after a model call that was never going to happen.
   *
   * It reads only what a previous turn already fetched — this never calls
   * OpenRouter itself, so it cannot add latency to a cold request. The real
   * refresh happens inside the agent loop. */
  const budget = budgetSnapshot();
  if (budget && !budget.stale && budget.remaining <= 0) {
    return new Response(
      JSON.stringify({
        error: {
          code: "rover_budget_spent",
          message: `Rover has used up today's model allowance (${budget.limit} requests a day on this key). Every other screen still works.`,
        },
      }),
      {
        status: 429,
        headers: {
          "content-type": "application/json; charset=utf-8",
          /* Long, because the allowance is daily and a client retrying in
           * sixty seconds will only be told the same thing. */
          "retry-after": "3600",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_body", "That request could not be read.");
  }

  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const turns = parseTurns(payload.turns);
  if (!turns) return fail(400, "bad_turns", "That conversation could not be read. Start a new one.");
  const profile = parseProfile(payload.profile);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of run({ turns, profile, signal: req.signal })) {
          controller.enqueue(frame(event));
        }
      } catch (err) {
        /* `run` only throws before the first event — a missing key, or the
         * index failing to load. Once it is yielding, failures arrive as
         * `error` events instead, because the status line is long gone. */
        const message =
          err instanceof RoverUnavailable
            ? "Rover is not switched on in this deployment."
            : "Rover could not answer that right now.";
        if (!(err instanceof RoverUnavailable)) {
          console.error("[api:rover_failed]", err instanceof Error ? err.message : err);
        }
        controller.enqueue(frame({ t: "error", message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      /* An answer is per-student and per-moment; a shared cache must not keep
       * it, and `no-transform` stops a proxy buffering the stream into one
       * lump, which would undo the streaming. */
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-content-type-options": "nosniff",
      /* Vercel's edge buffers a streamed response without this. */
      "x-accel-buffering": "no",
    },
  });
}
