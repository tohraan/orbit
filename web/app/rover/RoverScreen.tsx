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
import { AGENT_NAME, APP_NAME } from "@/components/layout/brand";
import type { OpportunitySummary } from "@rof/core";
import { useProfile } from "@/lib/data";
import { api } from "@/lib/api-base";

/* What the server sends, one JSON object per SSE frame. Mirrors RoverEvent in
 * packages/server/src/rover/agent.ts. */
type Wire =
  | { t: "status"; text: string }
  | { t: "text"; text: string }
  | { t: "cards"; items: OpportunitySummary[]; why: Record<string, string> }
  | { t: "done" }
  | { t: "error"; message: string };

/* A block of cards Rover put on screen, with the reason it gave for each. */
type Picks = { items: OpportunitySummary[]; why: Record<string, string> };

type Message = {
  id: number;
  role: "student" | "rover";
  text: string;
  /* Activity lines — "Searched fully funded masters — 6 found". Kept with the
   * message rather than thrown away, so the answer still shows its working
   * after it has finished arriving. */
  activity: string[];
  picks: Picks[];
  error?: string;
  streaming?: boolean;
};

/* The openers. Deliberately the awkward ones: each is vague or
 * multi-constraint in a way a keyword search cannot serve, which is the whole
 * reason this screen exists next to Explore. */
const OPENERS = [
  "What can I apply to as a second-year CS student?",
  "A fellowship I can do alongside college, in the US or Canada",
  "I have free time this semester — what's worth doing?",
  "Fully funded master's scholarships closing soon",
];

let nextId = 1;

export function RoverScreen() {
  const { profile, started } = useProfile();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const foot = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  /* Follow the answer as it arrives, but never fight the student: once they
   * scroll up to read a card, the page stops chasing the bottom until they
   * come back down. */
  const pinned = useRef(true);
  useEffect(() => {
    const onScroll = () => {
      const slack = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      pinned.current = slack < 160;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Throttled, because this is called once per streamed token. A smooth
   * scrollIntoView at that rate fights its own previous animation and the page
   * judders; one jump every 120ms keeps up with the text without it. */
  const lastScroll = useRef(0);
  const toBottom = useCallback((force = false) => {
    if (!pinned.current) return;
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

      const student: Message = { id: nextId++, role: "student", text, activity: [], picks: [] };
      const reply: Message = { id: nextId++, role: "rover", text: "", activity: [], picks: [], streaming: true };

      /* The transcript the server will see, built from what is on screen plus
       * this turn — not from state, which has not updated yet. */
      let history: Message[] = [];
      setMessages((cur) => {
        history = [...cur, student];
        return [...history, reply];
      });

      const ac = new AbortController();
      abort.current = ac;

      const patch = (fn: (m: Message) => Message) =>
        setMessages((cur) => cur.map((m) => (m.id === reply.id ? fn(m) : m)));

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
              patch((m) => ({ ...m, error: event.message }));
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
          error: `The connection to ${AGENT_NAME} dropped. Try again.`,
        }));
      } finally {
        if (abort.current === ac) {
          abort.current = null;
          setBusy(false);
        }
      }
    },
    [profile, started, toBottom],
  );

  const reset = () => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
    setMessages([]);
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
      <header className={s.head}>
        <span className={s.mark} aria-hidden="true">
          <Icon name="rover" size={22} />
        </span>
        <div className={s.headText}>
          <h1 className={s.name}>{AGENT_NAME}</h1>
          <p className={s.role}>Reads the whole {APP_NAME} index and comes back with what fits you</p>
        </div>
        {!empty ? (
          <Button variant="ghost" size="sm" icon="refresh" onClick={reset}>
            New conversation
          </Button>
        ) : null}
      </header>

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
            <p className={s.openingLead}>
              Tell {AGENT_NAME} what you are after and it will ask a couple of questions before it
              goes looking. Vague is fine — that is what the questions are for.
            </p>
            <div className={s.openers}>
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
          messages.map((m) => <Bubble key={m.id} message={m} />)
        )}
        <div ref={foot} className={s.foot} />
      </div>

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

function Bubble({ message }: { message: Message }) {
  if (message.role === "student") {
    return (
      <div className={s.student}>
        <p className={s.studentText}>{message.text}</p>
      </div>
    );
  }

  /* Nothing yet and no activity: the request is out but the first token has
     not landed. One pulsing line, not a spinner — it is replaced by the
     answer, so it sits where the answer will be. */
  const thinking = message.streaming && !message.text && !message.activity.length && !message.picks.length;

  return (
    <div className={s.rover}>
      <span className={s.avatar} aria-hidden="true">
        <Icon name="rover" size={17} />
      </span>
      <div className={s.said}>
        <span className="sr-only">{AGENT_NAME} said:</span>

        {message.activity.length ? (
          <ul className={s.activity}>
            {message.activity.map((line, i) => (
              <li key={`${line}-${i}`} className={s.activityLine}>
                <Icon name="search" size={13} />
                {line}
              </li>
            ))}
          </ul>
        ) : null}

        {thinking ? (
          <p className={s.thinking}>
            <span className={s.dot} />
            <span className={s.dot} />
            <span className={s.dot} />
            <span className="sr-only">Thinking</span>
          </p>
        ) : null}

        {message.text ? (
          <div className={s.prose}>
            {message.text.split(/\n{2,}/).map((para, i) => (
              <p key={i}>{bold(para)}</p>
            ))}
            {message.streaming ? <span className={s.caret} aria-hidden="true" /> : null}
          </div>
        ) : null}

        {message.picks.map((pick, i) => (
          <div key={i} className={s.picks}>
            <div className={card.grid}>
              {pick.items.map((item) => (
                <div key={item.id} className={s.pick}>
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
          <ErrorState compact title="That answer stopped" body={message.error} />
        ) : null}
      </div>
    </div>
  );
}

/* The only markdown Rover is told it may use, rendered by hand.
 *
 * A full markdown renderer is a dependency, a bundle and an injection surface
 * for the sake of one emphasis span — and the prompt asks for plain prose with
 * the occasional bold phrase, so this is the whole of what can arrive. Anything
 * else stays literal text, which is the safe failure. */
function bold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}
