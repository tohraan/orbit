"use client";

/* Rover's screen: a conversation that answers in portal cards.
 *
 * The shape of the thing. Chat is the interface; the index stays the source of
 * truth. So this screen renders exactly two kinds of thing — what was said, and
 * the portal's own OpportunityCard — and it never formats an opportunity
 * itself. When the server sends a `cards` event it is sending real
 * `OpportunitySummary` rows straight off the index, and they go into the same
 * component Explore, Home and Saved use, with its save, compare, .ics and
 * apply controls live. That is the point: a recommendation you can act on in
 * place, not a paragraph you have to go and search for.
 *
 * WHY THE TRANSCRIPT IS THE CLIENT'S. The server keeps nothing between turns
 * (packages/server/src/rover/agent.ts), so this component owns the history and
 * replays it with each request. Two consequences worth knowing:
 *   - a reload starts a fresh conversation, which is honest rather than a
 *     half-restored one, and it is why the opener suggestions are always there
 *   - `shown` travels with each assistant turn, so "these are too competitive"
 *     has a referent on the next turn without re-sending the card rows
 *
 * The composer stays enabled while Rover is answering; sending interrupts the
 * stream and starts the next turn. Students type over an answer they can
 * already see is wrong, and making them wait for it to finish is worse than
 * abandoning it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import s from "./rover.module.css";
import card from "@/components/opportunities/card.module.css";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import { ErrorState } from "@/components/feedback/States";
import { RichText } from "./RichText";
import { PageHead } from "@/components/layout/AppShell";
import { AGENT_NAME, APP_NAME } from "@/components/layout/brand";
import type { OpportunitySummary } from "@rof/core";
import { useProfile } from "@/lib/data";
import { api } from "@/lib/api-base";
import { useAuth } from "@/lib/auth";
import { clearSession, nextId, openSession, saveSession, type Message } from "./session";

/* What the server sends, one JSON object per SSE frame. Mirrors RoverEvent in
 * packages/server/src/rover/agent.ts. */
type Wire =
  | { t: "status"; text: string }
  | { t: "text"; text: string }
  | { t: "cards"; items: OpportunitySummary[]; why: Record<string, string> }
  | { t: "done" }
  | { t: "error"; message: string };


/* The openers. Deliberately the awkward ones: each is vague or
 * multi-constraint in a way a keyword search cannot serve, which is the whole
 * reason this screen exists next to Explore. */
const OPENERS = [
  "What can I apply to as a second-year CS student?",
  "A fellowship I can do alongside college, in the US or Canada",
  "I have free time this semester — what's worth doing?",
  "Fully funded master's scholarships closing soon",
];

export function RoverScreen() {
  const { profile, started } = useProfile();
  const { user } = useAuth();
  /* Who this runtime currently belongs to. Not a key the chat is stored
   * under — see session.ts — only a value that, when it changes, means the
   * previous conversation must not be shown to whoever is here now. */
  const who = user?.id ?? "anonymous";
  const [messages, setMessages] = useState<Message[]>(() => openSession(who));
  /* Everything the session already held when this screen mounted.
   *
   * Entrance animations are for content the student watches arrive. Coming
   * back to Rover from Explore re-mounts the screen with the whole
   * conversation already in hand, and replaying every card's entrance would
   * announce old news as if it were new. Only ids absent from this set get
   * the animation classes; the rest render in their settled state. */
  const restored = useRef<Set<number>>(new Set(messages.map((m) => m.id)));
  /* The transcript, readable SYNCHRONOUSLY.
   *
   * `send` has to put the whole conversation in the request body at the
   * moment it builds it, and `messages` cannot give it that: a state updater
   * does not run when you call the setter, it runs at render. An earlier
   * version assigned the history out of the updater's body and read it on the
   * next line, which meant the array was still empty — so the very first
   * message of every conversation posted `turns: []` and came back 400
   * "That conversation could not be read", from parseTurns rejecting an empty
   * array. Every write goes through `commit` below so this ref and the state
   * can never disagree. */
  const transcript = useRef<Message[]>(messages);
  const commit = useCallback((next: (cur: Message[]) => Message[]) => {
    transcript.current = saveSession(next(transcript.current));
    setMessages(transcript.current);
    return transcript.current;
  }, []);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const foot = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  /* Follow the answer as it arrives, but never fight the student: once they
   * scroll up to read a card, the page stops chasing the bottom until they
   * come back down. */
  const pinned = useRef(true);
  /* New content arrived while the student was scrolled up. */
  const [behind, setBehind] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const slack = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      pinned.current = slack < 160;
      /* Coming back down dismisses the notice; there is nothing below to go
         to any more. */
      if (pinned.current) setBehind(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Throttled, because this is called once per streamed token. A smooth
   * scrollIntoView at that rate fights its own previous animation and the page
   * judders; one jump every 120ms keeps up with the text without it. */
  const lastScroll = useRef(0);
  const toBottom = useCallback((force = false) => {
    if (!pinned.current) {
      /* The student is reading something further up. Their scroll position is
         theirs — say there is something new and let them choose, rather than
         yanking the page down mid-sentence. */
      setBehind(true);
      return;
    }
    const now = Date.now();
    if (!force && now - lastScroll.current < 120) return;
    lastScroll.current = now;
    foot.current?.scrollIntoView({ behavior: force ? "smooth" : "auto", block: "end" });
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.replace(/\s+/g, " ").trim();
      if (!text) return;

      /* A new turn supersedes an unfinished one. The half-written answer is
       * kept on screen — it is part of what was said — but it stops growing. */
      abort.current?.abort();
      setDraft("");
      setBusy(true);
      pinned.current = true;

      const student: Message = { id: nextId(), role: "student", text, activity: [], picks: [] };
      const reply: Message = { id: nextId(), role: "rover", text: "", activity: [], picks: [], streaming: true };

      /* The transcript the server will see: what is on screen plus this turn,
       * read back from the ref so it is the real list and not an empty one. */
      const history = [...transcript.current, student];
      commit(() => [...history, reply]);

      const ac = new AbortController();
      abort.current = ac;

      const patch = (fn: (m: Message) => Message) =>
        commit((cur) => cur.map((m) => (m.id === reply.id ? fn(m) : m)));

      try {
        const res = await fetch(api("/api/rover"), {
          method: "POST",
          signal: ac.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            turns: history
              /* An errored turn carries no answer, so it is not replayed —
               * the server rejects an empty assistant turn anyway. */
              .filter((m) => m.role === "student" || m.text.trim())
              .map((m) => ({
                role: m.role === "student" ? "user" : "assistant",
                text: m.text,
                ...(m.picks.length
                  ? { shown: m.picks.flatMap((p) => p.items.map((i) => i.id)) }
                  : {}),
              })),
            /* Only the fields that can change a recommendation. The server
               strips the rest anyway (handlers/rover.ts), but the API can be a
               different origin, and a phone number that is never sent cannot
               be sent to the wrong place. */
            profile: started
              ? {
                  name: profile.name,
                  level: profile.level,
                  degree: profile.degree,
                  course: profile.course,
                  year: profile.year,
                  fields: profile.fields,
                  countries: profile.countries,
                  funding: profile.funding,
                  graduation: profile.graduation,
                }
              : null,
          }),
        });

        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          patch((m) => ({
            ...m,
            streaming: false,
            error: body?.error?.message || `${AGENT_NAME} could not answer that right now.`,
            retry: text,
          }));
          return;
        }

        /* SSE framing over a POST body: frames are separated by a blank line,
         * and a chunk can split one anywhere, so the tail is carried over. */
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            let event: Wire;
            try {
              event = JSON.parse(line.slice(5).trim()) as Wire;
            } catch {
              continue;
            }

            if (event.t === "text") {
              patch((m) => ({ ...m, text: m.text + event.text }));
            } else if (event.t === "status") {
              patch((m) => ({ ...m, activity: [...m.activity, event.text] }));
            } else if (event.t === "cards") {
              patch((m) => ({ ...m, picks: [...m.picks, { items: event.items, why: event.why }] }));
            } else if (event.t === "error") {
              patch((m) => ({ ...m, error: event.message, retry: text }));
            }
            /* A card block changes the height a lot, so it gets an
               unthrottled scroll; text deltas go through the throttle. */
            toBottom(event.t === "cards");
          }
        }
        patch((m) => ({ ...m, streaming: false }));
      } catch (err) {
        /* An abort is the student sending the next message, not a failure. */
        if ((err as Error).name === "AbortError") {
          patch((m) => ({ ...m, streaming: false }));
          return;
        }
        patch((m) => ({
          ...m,
          streaming: false,
          error: `The connection to ${AGENT_NAME} dropped.`,
          retry: text,
        }));
      } finally {
        if (abort.current === ac) {
          abort.current = null;
          setBusy(false);
        }
      }
    },
    [profile, started, toBottom, commit],
  );

  /* Run a failed turn again.
   *
   * The failed answer AND the question that produced it come off the
   * transcript first. Without that the question would be sent twice — once in
   * the replayed history and once as the new turn — and the model would see a
   * student who asked the same thing immediately after being ignored. */
  const retry = useCallback(
    (failedId: number, text: string) => {
      commit((cur) => {
        const i = cur.findIndex((m) => m.id === failedId);
        return i <= 0 ? [] : cur.slice(0, i - 1);
      });
      void send(text);
    },
    [commit, send],
  );

  const reset = () => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
    clearSession();
    commit(() => []);
    setDraft("");
    input.current?.focus();
  };

  const empty = messages.length === 0;

  /* What the live region says. Derived from the last turn rather than pushed
   * at each event, so it cannot announce a state the screen is not in. */
  const last = messages[messages.length - 1];
  const announcement =
    !last || last.role === "student"
      ? busy
        ? `${AGENT_NAME} is looking.`
        : ""
      : last.streaming
        ? ""
        : last.error
          ? `${AGENT_NAME} could not finish: ${last.error}`
          : (() => {
              const cards = last.picks.reduce((n, p) => n + p.items.length, 0);
              return cards
                ? `${AGENT_NAME} answered and showed ${cards} ${cards === 1 ? "opportunity" : "opportunities"}.`
                : `${AGENT_NAME} answered.`;
            })();

  return (
    <div className={s.screen}>
      {/* The portal's own page head, not a bespoke one. Rover is a screen of
          Orbit in the same sense Explore and Compare are — same eyebrow, same
          title, same place for the page's one action — and a chat that drew
          its own header read as a separate product bolted onto the side. */}
      <PageHead
        eyebrow="Ask"
        title={AGENT_NAME}
        description={`Reads the whole ${APP_NAME} index and comes back with what fits you`}
        actions={
          !empty ? (
            <Button variant="ghost" size="sm" icon="refresh" onClick={reset}>
              New conversation
            </Button>
          ) : null
        }
      />

      {/* A screen reader gets ONE announcement per answer, not one per token.
          aria-live on the transcript itself re-announced the whole growing
          reply on every delta, which is unusable; the transcript is a plain
          log that can be read at leisure, and this says when there is
          something new in it. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className={s.transcript} aria-busy={busy}>
        {empty ? (
          <div className={s.opening}>
            {/* A question, then the ways to answer it. The old version opened
                with a paragraph about how the screen worked, which is reading
                to do before you are allowed to start. */}
            <h2 className={s.openingTitle}>What are you looking for?</h2>
            <p className={s.openingLead}>
              Vague is fine — {AGENT_NAME} will ask a couple of questions before it goes looking.
            </p>
            <div className={s.openers}>
              <p className={s.openersLabel}>Or start with one of these</p>
              {OPENERS.map((o) => (
                <button key={o} type="button" className={s.opener} onClick={() => void send(o)}>
                  <span>{o}</span>
                  <Icon name="arrow-right" size={15} />
                </button>
              ))}
            </div>
            {!started ? (
              <p className={s.openingNote}>
                You have not set up a profile yet, so {AGENT_NAME} will have to ask about your course
                and level. Filling in your profile saves it asking every time.
              </p>
            ) : null}
          </div>
        ) : (
          messages.map((m) => (
            <Bubble key={m.id} message={m} onRetry={retry} fresh={!restored.current.has(m.id)} />
          ))
        )}
        <div ref={foot} className={s.foot} />
      </div>

      {behind ? (
        <div className={s.behind}>
          <button
            type="button"
            className={s.behindButton}
            onClick={() => {
              pinned.current = true;
              setBehind(false);
              foot.current?.scrollIntoView({ behavior: "smooth", block: "end" });
            }}
          >
            <Icon name="arrow-down" size={14} />
            New response
          </button>
        </div>
      ) : null}

      <form
        className={s.composer}
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <div className={s.field}>
          <textarea
            ref={input}
            className={s.input}
            value={draft}
            rows={1}
            /* Enter sends, Shift-Enter breaks the line: this is a chat box, and
               a student who wants a second paragraph is the rare case. */
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            onChange={(e) => {
              setDraft(e.target.value);
              /* Grow with the text up to the CSS max-height, then scroll. */
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            placeholder={`Ask ${AGENT_NAME} for something…`}
            aria-label={`Message ${AGENT_NAME}`}
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            icon={busy ? "refresh" : "arrow-right"}
            disabled={!draft.trim()}
            aria-label={busy ? "Send and interrupt the current answer" : "Send"}
          >
            {busy ? "Interrupt" : "Send"}
          </Button>
        </div>
        <p className={s.disclaimer}>
          {AGENT_NAME} only reports what the index holds, and every card below is a live listing —
          but check the funder&apos;s own page before you apply.
        </p>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------- one turn --- */

function Bubble({
  message,
  onRetry,
  fresh,
}: {
  message: Message;
  onRetry: (failedId: number, text: string) => void;
  /* False for a conversation restored on re-mount: render settled, do not
     replay entrances the student already watched. */
  fresh: boolean;
}) {
  if (message.role === "student") {
    return (
      <div className={s.student}>
        <p className={s.studentText}>{message.text}</p>
      </div>
    );
  }

  /* Is this turn still working, and has it said anything yet?
   *
   * The process indicator is the activity list itself rather than a separate
   * widget: the lines Rover already reports ("Searched fully funded masters —
   * 22 found") are both truer and more useful than an invented sequence of
   * "Comparing options", and inventing one would be exactly the AI theatre
   * worth avoiding. The only generic line is the first, before any tool has
   * reported, because at that point there is genuinely nothing to say yet. */
  const working = Boolean(message.streaming);
  const answering = Boolean(message.text || message.picks.length);
  const steps = message.activity;

  return (
    <div className={s.rover}>
      <div className={s.said}>
        {/* The identity marker, once, at the top of the response — not a round
            avatar beside every block. An avatar repeated down the transcript
            is 42px of every line spent saying something the reader worked out
            at the first one, and on a 320px phone that is the margin the
            cards need. A quiet label reads as a byline instead. */}
        <p className={s.who}>
          <span aria-hidden="true">{AGENT_NAME}</span>
          <span className="sr-only">{AGENT_NAME} said:</span>
        </p>

        {/* The process indicator.
            Each finished step is a tick and quiets down; the one in flight
            carries the marker and the only motion on screen. Once the answer
            starts arriving the whole block settles into its completed state
            (see .done) rather than disappearing, so the response does not jump
            up into the space the steps were using. */}
        {steps.length || working ? (
          <ul className={[s.activity, answering ? s.activityDone : null].filter(Boolean).join(" ")}>
            {steps.map((line, i) => {
              const current = working && !answering && i === steps.length - 1;
              return (
                <li
                  key={`${line}-${i}`}
                  className={[s.step, fresh ? s.stepEnter : null, current ? s.stepNow : s.stepDone]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className={s.mark} aria-hidden="true" />
                  {line}
                </li>
              );
            })}
            {/* Before the first tool reports there is nothing true to show, so
                this one line is generic. It is also the only thing the 250ms
                delay in .step applies to in practice, which is the point: a
                turn answered quickly never flashes it. */}
            {working && !steps.length && !answering ? (
              <li className={[s.step, fresh ? s.stepEnter : null, s.stepNow].filter(Boolean).join(" ")}>
                <span className={s.mark} aria-hidden="true" />
                Understanding your request
              </li>
            ) : null}
          </ul>
        ) : null}

        {message.text ? (
          <div className={s.prose}>
            <RichText text={message.text} />
            {message.streaming ? <span className={s.caret} aria-hidden="true" /> : null}
          </div>
        ) : null}

        {message.picks.map((pick, i) => (
          <div key={i} className={s.picks}>
            <div className={card.grid}>
              {pick.items.map((item) => (
                <div key={item.id} className={[s.pick, fresh ? s.pickEnter : null].filter(Boolean).join(" ")}>
                  <OpportunityCard item={item} />
                  {pick.why[item.id] ? (
                    <p className={s.why}>
                      <Icon name="sparkle" size={13} />
                      {pick.why[item.id]}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}

        {message.error ? (
          <ErrorState
            compact
            title="That answer stopped"
            body={message.error}
            /* Offered whenever the turn recorded what to re-send, which is
               every failure except an abort — an abort is the student sending
               something else and is not shown as an error at all. Retrying a
               day's-budget failure is harmless: the server refuses it before
               spending anything, and by tomorrow the same button works. */
            actions={
              message.retry ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon="refresh"
                  onClick={() => onRetry(message.id, message.retry as string)}
                >
                  Try again
                </Button>
              ) : undefined
            }
          />
        ) : null}
      </div>
    </div>
  );
}

