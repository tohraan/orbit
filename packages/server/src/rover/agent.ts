/* The agent loop: one student turn in, a stream of events out.
 *
 * A MANUAL LOOP. The loop needs to do something at the moment a tool result
 * comes back that no SDK helper has a hook for: a `recommend` call has to push
 * real card rows to the browser, and a search has to push an activity line,
 * both before the model has written a word of its reply.
 *
 * STREAMED, for the ordinary reason: with a tool round trip in the middle, a
 * buffered reply means five to ten seconds of nothing. Streaming turns that
 * into "Searched fully funded masters — 101 found", then cards, then prose
 * arriving as it is written.
 *
 * STATELESS, deliberately. Nothing about a conversation is kept on the server:
 * the browser replays the transcript each turn (handlers/rover.ts bounds it)
 * and this builds the model's view from scratch. The tool-call plumbing is NOT
 * replayed — only what was said, plus a note of which ids were shown — so a
 * refinement re-runs the search against today's index instead of reasoning
 * over last turn's rows, which is also what we want when a listing has closed
 * since.
 *
 * THE STEP CEILING IS A BUDGET, NOT A SAFETY RAIL. On a free OpenRouter key
 * the whole portal shares 50 model requests a day, so every step this loop
 * takes is a step some other student does not get. See openrouter.ts.
 */

import "server-only";
import { AGENT_NAME, type StudentProfile } from "@rof/core";
import { getIndex } from "../source";
import { DOCTRINE, situation } from "./prompt";
import { MAX_CARDS, TOOLS, runTool, toolsForOpenRouter, type Recommendation } from "./tools";
import { TextGate } from "./textgate";
import {
  RoverBusy,
  RoverExhausted,
  RoverUnavailable,
  budgetSnapshot,
  chat,
  configured,
  model,
  type ChatMessage,
  type ToolCall,
} from "./openrouter";

/* Enough for a conversational reply plus a tool call. Free models stream, so a
 * generous ceiling costs nothing when it is not used — but it is not huge
 * either: the prompt asks for two to four sentences, and a model given 8,000
 * tokens will sometimes take them. */
const MAX_TOKENS = 2048;

/* Six. Every step is a model request out of a shared daily allowance of fifty,
 * so this is a budget, not a safety rail — but four turned out to be too tight
 * against the real model. Watched live, it spent its steps on
 * vocabulary -> search -> detail -> search and ran out before it could
 * recommend anything, so the student got "went round in circles" when the
 * answer (29 rows) was already in hand.
 *
 * The ceiling alone was the wrong fix, because a bigger number just moves the
 * cliff. What makes it safe is the two steps below it: at the second-to-last
 * step the model is told to wrap up, and on the last one its tools are taken
 * away so it has to write the answer. A student now always gets words. */
const MAX_STEPS = Number(process.env.ROVER_MAX_STEPS ?? 6);

/* What the second-to-last step tells the model, carried on whatever tool
 * result closes that step. */
const WRAP_UP =
  "This is your last tool call for this turn. Call `recommend` now with the best " +
  "ids you have already seen and then write your answer — or, if nothing is worth " +
  "showing, say so plainly. Do not search again.";

/* Per-turn quotas, on top of the step ceiling.
 *
 * The step ceiling stops a loop; these stop a SHAPE of loop that is worse
 * value. Watched live, the model answered a good search by reading three full
 * listings one after another and then ran out of steps without recommending
 * anything — three model requests spent on prose the card already summarises.
 *
 * Refusing the fourth call is free (no request is made) and it tells the model
 * what to do instead, which is the part that makes it recover rather than
 * stall. `recommend` is not capped: calling it is the goal. */
const QUOTAS: Record<string, number> = {
  index_vocabulary: 1,
  get_opportunity: 2,
  search_opportunities: 4,
};

export type Turn = {
  role: "user" | "assistant";
  text: string;
  /** Ids this assistant turn put on screen, so a refinement knows what "these" means. */
  shown?: number[];
};

/* The wire shape the browser parses. `t` rather than `type` because every
 * frame carries it and the client switches on it; see RoverScreen.tsx. */
export type RoverEvent =
  | { t: "status"; text: string }
  | { t: "text"; text: string }
  | { t: "cards"; items: Recommendation["items"]; why: Recommendation["why"] }
  | { t: "done" }
  | { t: "error"; message: string };

export type RoverRequest = {
  turns: Turn[];
  profile: StudentProfile | null;
  /** Aborted when the student sends the next message or closes the tab. */
  signal?: AbortSignal;
};

export { RoverUnavailable, configured, budgetSnapshot, model };

/* The transcript, as the model sees it.
 *
 * An assistant turn that showed cards gets a trailing line naming them. The
 * cards themselves are not replayed — they are 700 bytes each and the model
 * does not need them again — but without the ids, "these are too competitive"
 * and "anything similar in Europe?" have no referent at all. */
function toMessages(turns: Turn[]): ChatMessage[] {
  return turns.map((turn) => {
    if (turn.role === "user") return { role: "user" as const, content: turn.text };
    const shown = turn.shown?.length ? `\n\n[cards shown to the student: ${turn.shown.join(", ")}]` : "";
    return { role: "assistant" as const, content: `${turn.text}${shown}` };
  });
}

/**
 * Runs one turn and yields events in the order the student should see them.
 *
 * Errors are yielded as an `error` event rather than thrown once the stream has
 * started: by the time the first byte is out the HTTP status is already sent,
 * so a failure mid-stream has to be in-band or the browser just sees a
 * truncated answer. Only the pre-flight failures (no key at all) throw.
 */
export async function* run(req: RoverRequest): AsyncGenerator<RoverEvent> {
  if (!configured()) throw new RoverUnavailable("OPENROUTER_API_KEY is not set");

  const index = await getIndex();

  /* The system prompt is one message here rather than two blocks: the
   * Anthropic cache-breakpoint mechanism has no equivalent on this transport.
   * The split is kept in prompt.ts anyway, because it is also just the right
   * way to organise it — frozen doctrine, then what is true of this request —
   * and because a credited key and a provider that caches prefixes would make
   * it load-bearing again with no rewrite. */
  const system = [
    DOCTRINE,
    "",
    situation({ profile: req.profile, openCalls: index.items.length, origin: index.origin }),
  ].join("\n");

  const messages: ChatMessage[] = [{ role: "system", content: system }, ...toMessages(req.turns)];
  const tools = toolsForOpenRouter(TOOLS);

  /* Ids already rendered this turn. Only used to stop a second `recommend`
   * call repeating a card the student can already see; the browser keeps its
   * own list from the card events, which is what it replays next turn. */
  const shown: number[] = [];
  /** How many times each tool has been called this turn, against QUOTAS. */
  const used: Record<string, number> = {};

  for (let step = 0; step < MAX_STEPS; step++) {
    const last = step === MAX_STEPS - 1;
    /* One step after this one. The tool results below carry a note saying so,
     * because a model that knows it is out of searches recommends what it has
     * and one that does not keeps looking. */
    const nearingCeiling = step === MAX_STEPS - 3;

    let calls: ToolCall[] = [];
    let finish: string | null = null;
    let said = "";
    /* Scaffolding the model writes instead of calling a tool must never reach
     * the student; see ./textgate.ts. */
    const gate = new TextGate();

    /* Every tool result that closes this step carries the wrap-up note —
     * REFUSALS INCLUDED. A model whose last call was rejected for quota or
     * bad JSON needs to know it was the last one more than one whose call
     * worked: it has nothing in hand from that step and, without this, it
     * reads a refusal that says "call recommend" with no idea that searching
     * again is not on the table. Missing it on those two paths is what
     * tests/rover-loop.test.mjs caught. */
    const resultFor = (result: Record<string, unknown>) =>
      JSON.stringify(nearingCeiling ? { ...result, budget_note: WRAP_UP } : result);

    try {
      for await (const event of chat({
        messages,
        tools,
        maxTokens: MAX_TOKENS,
        /* On the final step the tools are withheld, so the turn cannot end in
         * another search. Whatever the model has is what the student gets, in
         * words. */
        toolChoice: last ? "none" : "auto",
        signal: req.signal,
      })) {
        if (event.type === "text") {
          said += event.text;
          const safe = gate.push(event.text);
          if (safe) yield { t: "text", text: safe };
        } else if (event.type === "calls") {
          calls = event.calls;
          finish = event.finish;
        } else {
          finish = event.finish;
        }
      }
      const tail = gate.flush();
      if (tail) yield { t: "text", text: tail };
    } catch (err) {
      /* The student navigating away or sending the next message. Nothing to
       * report: the stream is already gone. */
      if ((err as Error)?.name === "AbortError") return;

      /* The three conditions worth naming, because each one tells the student
       * something different about what to do next. */
      if (err instanceof RoverExhausted) {
        const b = budgetSnapshot();
        yield {
          t: "error",
          message:
            `${AGENT_NAME} has used up today's model allowance` +
            (b?.limit ? ` (${b.limit} requests a day on this key)` : "") +
            `. Everything else in the portal still works — Explore has the same ${index.items.length} listings.`,
        };
        return;
      }
      if (err instanceof RoverBusy) {
        yield {
          t: "error",
          message: `${AGENT_NAME} is handling too many questions at once. Give it a few seconds and ask again.`,
        };
        return;
      }
      console.error("[rover] turn failed:", err instanceof Error ? err.message : err);
      yield { t: "error", message: `${AGENT_NAME} could not finish that answer. Try again.` };
      return;
    }

    if (!calls.length) {
      /* Either the turn is finished, or it ran out of room mid-sentence, which
       * the student can see for themselves. */
      if (finish === "length") {
        yield { t: "error", message: "That answer was cut short. Ask again, or ask for less at once." };
      }
      /* A model that answers with neither words nor a tool call has said
       * nothing at all, and an empty bubble reads as a bug.
       *
       * `gate.cut` is the other way to get here: the model DID write
       * something, but all of it was tool-call scaffolding and none of it was
       * shown. That deserves its own sentence — the student should not be told
       * to rephrase a question that was understood perfectly. */
      if (gate.cut && !gate.shown) {
        yield {
          t: "error",
          message: `${AGENT_NAME} garbled that answer. Ask again — it usually gets it the second time.`,
        };
      } else if (!said.trim() && finish !== "length") {
        yield { t: "error", message: `${AGENT_NAME} had nothing to say to that. Try rephrasing it.` };
      }
      yield { t: "done" };
      return;
    }

    /* A tool call cut off at the token ceiling can still parse as a plausible
     * object — a half-written id list being the dangerous case — so it is
     * never run. */
    if (finish === "length") {
      console.error("[rover] tool call truncated at the token ceiling");
      yield { t: "error", message: `${AGENT_NAME} lost its place mid-search. Try asking again.` };
      return;
    }

    /* The assistant turn goes back verbatim, tool calls included: the next
     * request has to show the model what it asked for, or the tool results
     * below have nothing to attach to. */
    messages.push({ role: "assistant", content: said || null, tool_calls: calls });

    for (const call of calls) {
      /* The arguments arrive as a STRING the model wrote, so this is the one
       * place a malformed JSON object can enter. A parse failure is answered
       * as a tool error, which the model can see and correct, rather than
       * throwing away the turn. */
      let input: unknown = {};
      let parseError: string | null = null;
      try {
        input = call.function.arguments.trim() ? JSON.parse(call.function.arguments) : {};
      } catch {
        parseError = call.function.arguments.slice(0, 200);
      }

      if (parseError !== null) {
        console.error(`[rover] unparseable arguments for ${call.function.name}`);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: resultFor({
            error: "invalid_json",
            message: "Those arguments were not valid JSON. Send the call again as a single JSON object.",
          }),
        });
        continue;
      }

      /* The quota check happens before the tool runs, and its refusal is
       * shaped like any other tool error so the model treats it the same
       * way. */
      const name = call.function.name;
      used[name] = (used[name] ?? 0) + 1;
      const quota = QUOTAS[name];
      if (quota !== undefined && used[name] > quota) {
        console.error(`[rover] ${name} over quota (${used[name]} > ${quota})`);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: resultFor({
            error: "tool_quota_reached",
            message:
              `You have already called ${name} ${quota} time(s) this turn, which is the limit. ` +
              "Use what you have: call `recommend` with the best ids you have seen and write your " +
              "answer, or say plainly that you found nothing suitable.",
          }),
        });
        continue;
      }

      const outcome = runTool(name, input, index);
      if (outcome.status) yield { t: "status", text: outcome.status };
      if (outcome.cards) {
        /* Cards go out before the prose that introduces them. The student
         * reads the cards first anyway, and this way they are on screen while
         * the sentences are still being written. */
        for (const item of outcome.cards.items) if (!shown.includes(item.id)) shown.push(item.id);
        yield { t: "cards", items: outcome.cards.items, why: outcome.cards.why };
      }
      /* The wrap-up nudge rides along in the tool result rather than arriving
       * as its own message.
       *
       * A mid-conversation `system` message is the natural way to say this and
       * was the first attempt, but it is also the kind of thing a free
       * provider rejects outright — and a 400 here would be a worse failure
       * than the dead end it was fixing. A `tool` message is accepted
       * everywhere, and the model reads tool results by definition. */
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: resultFor(outcome.result as Record<string, unknown>),
      });
    }
  }

  /* Only reachable if the final tool-free step still came back asking for a
   * tool, which the provider should not allow. Logged as the anomaly it is. */
  console.error(`[rover] hit the ${MAX_STEPS}-step ceiling with tools still pending`);
  yield {
    t: "error",
    message: `${AGENT_NAME} could not settle on an answer. Try narrowing the question.`,
  };
}

export { MAX_CARDS };
