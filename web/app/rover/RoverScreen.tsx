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
 * TWO STATES, NOT ONE PAGE. Everything below is one of two compositions:
 *
 *   cold  nothing said yet. One centred group — the question, four ways to
 *         answer it, and the composer — because the composer IS the screen at
 *         that point. It used to be a block of copy at the top and an input
 *         pinned to the bottom of the window with a screen of nothing between
 *         them, which read as a page that had failed to load.
 *   live  a conversation. The transcript is the content, it grows down the
 *         page, and the composer is a compact sticky bar under it.
 *
 * The DOM is the same in both; `cold`/`live` on the root switches the
 * composition. There is no second screen component and no second composer.
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
import Link from "next/link";
import s from "./rover.module.css";
import card from "@/components/opportunities/card.module.css";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import { ErrorState } from "@/components/feedback/States";
import { RichText } from "./RichText";
import { PageHead } from "@/components/layout/AppShell";
import { AGENT_NAME, APP_NAME } from "@/components/layout/brand";
import type { IconName } from "@/components/ui/Icon";
import { deadlineState, titleCase } from "@rof/core";
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


/* The six ways in.
 *
 * They are KINDS of opportunity rather than four phrasings of "find me
 * something", because the first screen's job is to tell a student what is in
 * the index at all. `prompt` is what gets sent — a full sentence, since that is
 * what Rover answers best — and `title`/`blurb` are what the card shows.
 *
 * The icons come from @rof/ui, not from a second icon set: three of them
 * (flask, briefcase, trophy) were added there for this screen. */
const CARDS: { icon: IconName; title: string; blurb: string; prompt: string }[] = [
  {
    icon: "flask",
    title: "Research programs",
    blurb: "Undergrad AI/ML research roles and labs",
    prompt:
      "Find research programs and lab opportunities for an undergraduate CS student interested in AI/ML.",
  },
  {
    icon: "briefcase",
    title: "Internships",
    blurb: "Summer and semester roles, remote or UAE",
    prompt: "Find internships for a CS student that I can do remotely or from the UAE.",
  },
  {
    icon: "globe",
    title: "Fellowships abroad",
    blurb: "US, Canada, UK, doable alongside college",
    prompt: "Find fellowships in the US, Canada, or UK that I can do alongside college.",
  },
  {
    icon: "school",
    title: "Scholarships",
    blurb: "Closing soon, sorted by deadline",
    prompt: "Show scholarships closing soon, sorted by deadline.",
  },
  {
    icon: "trophy",
    title: "Hackathons & contests",
    blurb: "Open now, with prizes and team sizes",
    prompt: "Find hackathons and competitions open for registration right now.",
  },
  {
    icon: "clock",
    title: "Free time this semester",
    blurb: "Pick what fits my schedule",
    prompt: "I have free time this semester. What is worth doing, ranked by fit?",
  },
];

/* Narrowings, not questions. A chip is appended to whatever is already in the
 * composer so it reads as one sentence the student assembled. */
const CHIPS = ["Deadlines this week", "Fully funded", "Remote", "UAE-eligible", "Beginner-friendly"];


export function RoverScreen() {
  const { profile, started } = useProfile();
  const { user, status } = useAuth();
  /* Who this runtime currently belongs to. Not a key the chat is stored
   * under — see session.ts — only a value that, when it changes, means the
   * previous conversation must not be shown to whoever is here now. */
  const who = user?.id ?? "anonymous";
  const [messages, setMessages] = useState<Message[]>([]);
  /* Everything the session already held when this screen mounted.
   *
   * Entrance animations are for content the student watches arrive. Coming
   * back to Rover from Explore — or reloading the tab — brings the whole
   * conversation back at once, and replaying every card's entrance would
   * announce old news as if it were new. Only ids absent from this set get
   * the animation classes; the rest render in their settled state. */
  const restored = useRef<Set<number>>(new Set());
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
  const transcript = useRef<Message[]>([]);
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
  /* The thread's own scroll box. It is the scroller only where the two-pane
   * layout exists (>=1360, where the chat is a fixed-height box beside the
   * opportunities panel); narrower than that the page scrolls as before and
   * this element simply never overflows. Everything below asks which one is
   * actually scrolling rather than assuming. */
  const scroller = useRef<HTMLDivElement>(null);
  /* Which opportunity the panel is showing in full. Null = the list. */
  const [open, setOpen] = useState<number | null>(null);

  /* Follow the answer as it arrives, but never fight the student: once they
   * scroll up to read a card, the page stops chasing the bottom until they
   * come back down. */
  const pinned = useRef(true);
  /* New content arrived while the student was scrolled up. */
  const [behind, setBehind] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const el = scroller.current;
      /* The box is the scroller when it actually overflows; otherwise the
         page is. Asking the wrong one leaves the transcript permanently
         "behind" and the follow-the-answer scroll switched off. */
      const slack =
        el && el.scrollHeight > el.clientHeight + 4
          ? el.scrollHeight - el.clientHeight - el.scrollTop
          : document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      pinned.current = slack < 160;
      /* Coming back down dismisses the notice; there is nothing below to go
         to any more. */
      if (pinned.current) setBehind(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const box = scroller.current;
    box?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      box?.removeEventListener("scroll", onScroll);
    };
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

  /* The stored conversation is picked up AFTER the first render, never during
   * it.
   *
   * sessionStorage does not exist on the server, so a component that read it
   * while rendering would produce an empty screen on the server and a full one
   * in the browser — which is a hydration mismatch, and React answers that by
   * throwing the whole tree away and rebuilding it, with an error in the
   * console for anyone looking. Rendering empty first and filling in on mount
   * costs one frame and is correct in both places.
   *
   * It waits for the session to resolve, too: `who` is "anonymous" for the
   * moment before auth answers, and restoring against that identity and then
   * seeing the real one arrive would clear the transcript the student came
   * back for. */
  useEffect(() => {
    if (status === "loading") return;
    const stored = openSession(who);
    restored.current = new Set(stored.map((m) => m.id));
    transcript.current = stored;
    setMessages(stored);
  }, [who, status]);

  /* The field is the point of the screen, so it has the caret on arrival.
   * Once only: re-focusing on every render would fight a student who has
   * clicked into a card or scrolled away to read one. */
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);

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

  /* The conversation, grouped.
   *
   * The wire is a flat list of turns and stays that way — this is a reading of
   * it, built at render. An exchange is a question and the answer it produced,
   * which is the unit a student scrolls by and the unit the sticky question
   * header needs to be scoped to. A reply with no question before it (only
   * possible if a transcript is ever restored half-written) still gets its own
   * exchange rather than being dropped. */
  const exchanges: { student?: Message; rover?: Message }[] = [];
  for (const m of messages) {
    if (m.role === "student") exchanges.push({ student: m });
    else {
      const open = exchanges[exchanges.length - 1];
      if (open && !open.rover) open.rover = m;
      else exchanges.push({ rover: m });
    }
  }

  /* What this conversation has turned up, in one place.
   *
   * Everything here was already on the screen — these are the rows Rover sent
   * as `cards`, deduplicated by id and kept in the order they first appeared.
   * Nothing is invented and nothing is re-ranked; the panel is a second view
   * of the transcript, not a second opinion about it. It exists because the
   * answers scroll away and the opportunities are the part worth keeping. */
  const found: { item: OpportunitySummary; why?: string }[] = [];
  const seen = new Set<number>();
  for (const m of messages) {
    for (const pick of m.picks) {
      for (const item of pick.items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        found.push({ item, why: pick.why[item.id] });
      }
    }
  }
  const asked = messages.filter((m) => m.role === "student").length;

  /* The greeting is addressed when there is a name to address. The profile's
   * own name first, the account's local part second, and when neither exists
   * the question stands on its own — a greeting to "there" is worse than no
   * greeting. */
  const first = (profile.name.trim() || (user?.email ?? "").split("@")[0] || "").split(/[\s.]+/)[0];
  const greeting = first ? `What are you looking for, ${first}?` : "What are you looking for?";

  return (
    <div className={[s.screen, empty ? s.cold : s.live].join(" ")}>
      {/* The wallpaper. A fixed layer behind everything, masked twice: once by
          the doodle tile itself and once by a radial that fades it out under
          the column where the reading happens. Pointer-events off, aria-hidden,
          and no DOM of its own — it is paint. */}
      <div className={s.doodles} aria-hidden="true" />

      {/* A screen reader gets ONE announcement per answer, not one per token.
          aria-live on the transcript itself re-announced the whole growing
          reply on every delta, which is unusable; the transcript is a plain log
          that can be read at leisure, and this says when there is something new
          in it. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className={s.body}>
        {empty ? (
          <>
            <div className={s.greetWrap}>
              {/* The one soft light on the screen, behind the mark. */}
              <div className={s.glow} aria-hidden="true" />
              <span className={s.mascot} aria-hidden="true">
                <Icon name="rover" size={30} />
              </span>
              <h1 className={s.greeting}>{greeting}</h1>
              <p className={s.greetSub}>
                {AGENT_NAME} reads the whole {APP_NAME} index and comes back with what fits you.
              </p>
            </div>

            <div className={s.cards}>
              {CARDS.map((c, i) => (
                <button
                  key={c.title}
                  type="button"
                  className={s.card}
                  style={{ animationDelay: `${i * 50}ms` }}
                  onClick={() => {
                    /* Fill the composer, then send it: the student sees what
                       was asked on their behalf, in their own words, in the
                       transcript a moment later. */
                    setDraft(c.prompt);
                    void send(c.prompt);
                  }}
                >
                  <span className={s.cardIcon} aria-hidden="true">
                    <Icon name={c.icon} size={17} />
                  </span>
                  <span className={s.cardText}>
                    <span className={s.cardTitle}>{c.title}</span>
                    <span className={s.cardBlurb}>{c.blurb}</span>
                  </span>
                  <span className={s.cardGo} aria-hidden="true">
                    <Icon name="arrow-right" size={15} />
                  </span>
                </button>
              ))}
            </div>

            <Composer
              empty
              draft={draft}
              busy={busy}
              inputRef={input}
              onDraft={setDraft}
              onSend={() => void send(draft)}
            />

            <div className={s.chips}>
              {CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={s.chip}
                  onClick={() => {
                    /* Appended, not sent. A filter is a narrowing of the
                       question the student is still writing. */
                    setDraft((d) => (d.trim() ? `${d.trim()}, ${chip.toLowerCase()}` : chip));
                    input.current?.focus();
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>

            <p className={s.disclaimer}>
              {AGENT_NAME} only reports what the index holds, and every card below is a live listing —
              but check the funder&apos;s own page before you apply.
            </p>
          </>
        ) : (
          <>
            {/* THE CHAT WINDOW, as an actual window: one bordered surface
                holding the bar, the transcript and the composer, with its own
                scroll. The three used to float on the page with nothing drawing
                the edge of the thing they belong to — which is also why the
                space beside them read as missing rather than as margin. */}
            <div className={s.chat}>
              {/* The bar. The page head it replaces scrolled away with the
                  first answer, taking "New conversation" with it — the one
                  control a student reaches for when a thread has gone the wrong
                  way. Its two counts are read off the transcript; while a turn
                  is running it says so instead, because they are mid-change. */}
              <div className={s.bar}>
                <span className={s.barMark} aria-hidden="true">
                  <Icon name="rover" size={17} />
                </span>
                <span className={s.barName}>{AGENT_NAME}</span>
                <span className={s.barMeta}>
                  {busy ? (
                    <span className={s.barWorking}>
                      <span className={s.barDot} aria-hidden="true" />
                      Working
                    </span>
                  ) : (
                    <>
                      {asked} {asked === 1 ? "question" : "questions"}
                      {found.length ? ` · ${found.length} found` : ""}
                    </>
                  )}
                </span>
                <Button variant="ghost" size="sm" icon="refresh" onClick={reset}>
                  New conversation
                </Button>
              </div>

              <div className={s.thread} ref={scroller} aria-busy={busy}>
                {exchanges.map((x, i) => (
                  <Exchange
                    key={x.student?.id ?? x.rover?.id ?? i}
                    exchange={x}
                    onRetry={retry}
                    fresh={!restored.current.has(x.rover?.id ?? -1)}
                  />
                ))}
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

              <Composer
                draft={draft}
                busy={busy}
                inputRef={input}
                onDraft={setDraft}
                onSend={() => void send(draft)}
              />
            </div>

            {/* The other half of the split. Everything Rover has put on the
                screen this session, in one place and in more detail than a card
                has room for — and the answer to what the right-hand side of a
                wide window is for. */}
            {found.length ? (
              <Dossier
                found={found}
                openId={open}
                onOpen={setOpen}
                onJump={(id) =>
                  document
                    .getElementById(`pick-${id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- the input --- */

/* One composer, two placements: inside the chat window once there is a
 * conversation, and in the middle of the cold screen before there is. It is one
 * component so the two can never drift into two different inputs. */
function Composer({
  draft,
  busy,
  empty,
  inputRef,
  onDraft,
  onSend,
}: {
  draft: string;
  busy: boolean;
  empty?: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onDraft: (next: string | ((d: string) => string)) => void;
  onSend: () => void;
}) {
  return (
    <form
      className={[s.composer, empty ? s.composerCold : null].filter(Boolean).join(" ")}
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <div className={s.field}>
        <textarea
          ref={inputRef}
          className={s.input}
          value={draft}
          rows={1}
          /* Enter sends, Shift-Enter breaks the line: this is a chat box, and a
             student who wants a second paragraph is the rare case. */
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          onChange={(e) => {
            onDraft(e.target.value);
            /* Grow with the text up to the CSS max-height, then scroll. */
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
          }}
          placeholder={empty ? "Describe what you want, or pick a card above" : `Continue with ${AGENT_NAME}…`}
          aria-label={`Message ${AGENT_NAME}`}
        />
        <button
          type="submit"
          className={s.send}
          disabled={!draft.trim()}
          aria-label={busy ? "Send and interrupt the current answer" : "Send"}
        >
          <Icon name={busy ? "refresh" : "arrow-up"} size={18} />
        </button>
      </div>
    </form>
  );
}

/* --------------------------------------------------------- the dossier --- */

/* What this conversation has turned up, in full.
 *
 * Two states in one panel: the list of everything found, and one opportunity
 * opened out. The detail is the fields a card has no room for — the summary,
 * the funding line as the source worded it, the level and type, and Rover's own
 * reason for picking it — so the panel answers "tell me more about that one"
 * without leaving the conversation or opening a tab.
 *
 * It owns no data. Every row here is a row the agent already sent as `cards`,
 * and the actions either move the thread or leave for the funder's own page;
 * save, compare and .ics stay on the card in the thread, which is the one place
 * they are implemented. */
function Dossier({
  found,
  openId,
  onOpen,
  onJump,
}: {
  found: { item: OpportunitySummary; why?: string }[];
  openId: number | null;
  onOpen: (id: number | null) => void;
  onJump: (id: number) => void;
}) {
  const current = found.find((f) => f.item.id === openId);

  if (current) {
    const { item, why } = current;
    /* The portal's own deadline grammar, not a second one: "1 day left",
       "Closes today", "Rolling", and the long date once it is far enough off
       to be a date rather than a countdown. Hand-rolling it here produced
       "1 days left" next to a card that said "1 day left". */
    const dl = deadlineState(item);
    const money = item.amount?.raw ?? (item.amount ? `${item.amount.currency} ${item.amount.value}` : null);
    return (
      <aside className={s.found} aria-label={`${item.title}, in detail`}>
        <div className={s.foundHead}>
          <button type="button" className={s.foundBack} onClick={() => onOpen(null)}>
            <Icon name="chevron-left" size={14} />
            All {found.length}
          </button>
        </div>

        <div className={s.detail}>
          <h3 className={s.detailTitle}>{item.title}</h3>
          <p className={s.detailOrigin}>
            {item.host ?? item.sourceName}
            {item.country ? ` · ${item.country}` : ""}
          </p>

          <div className={s.detailTags}>
            {item.type ? <span className={s.detailTag}>{titleCase(item.type)}</span> : null}
            {/* "Any" is not a level a student is looking for, it is the absence
                of one, and it reads as a third real tag beside Scholarship and
                Master's. */}
            {item.levels
              .filter((l) => l !== "any")
              .slice(0, 2)
              .map((l) => (
                <span key={l} className={s.detailTag}>
                  {titleCase(l)}
                </span>
              ))}
            {item.funding ? <span className={s.detailTag}>{titleCase(item.funding)}</span> : null}
          </div>

          <dl className={s.detailFacts}>
            <div>
              <dt>Funding</dt>
              <dd>{money ?? "Not stated"}</dd>
            </div>
            <div>
              <dt>Deadline</dt>
              <dd>
                <span className={dl.tone === "urgent" || dl.tone === "expired" ? s.foundSoon : undefined}>
                  {dl.label}
                </span>
                {dl.full && dl.full !== dl.label ? (
                  <span className={s.detailQuiet}> · {dl.full}</span>
                ) : null}
              </dd>
            </div>
            {item.duration ? (
              <div>
                <dt>Length</dt>
                <dd>{item.duration}</dd>
              </div>
            ) : null}
          </dl>

          {why ? (
            <p className={s.detailWhy}>
              <Icon name="sparkle" size={13} />
              {why}
            </p>
          ) : null}

          {item.summary ? <p className={s.detailSummary}>{item.summary}</p> : null}

          <div className={s.detailActions}>
            <button type="button" className={s.detailGhost} onClick={() => onJump(item.id)}>
              Jump to card
            </button>
            {/* The funder's own page, in a new tab, with the opener severed —
                the same rule the chat's links follow. */}
            <a className={s.detailLink} href={item.url} target="_blank" rel="noopener noreferrer">
              Open listing
              <Icon name="external" size={13} />
            </a>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className={s.found} aria-label="Found in this conversation">
      <div className={s.foundHead}>
        <span className={s.foundTitle}>Found so far</span>
        <span className={s.foundCount}>{found.length}</span>
      </div>
      <ol className={s.foundList}>
        {found.map(({ item, why }) => {
          const dl = deadlineState(item);
          return (
            <li key={item.id}>
              <button
                type="button"
                className={s.foundRow}
                title={why ?? item.title}
                onClick={() => onOpen(item.id)}
              >
                <span className={s.foundName}>{item.title}</span>
                <span className={s.foundMeta}>
                  {titleCase(item.country) ?? item.host ?? item.sourceName}
                  {" · "}
                  <span className={dl.tone === "urgent" || dl.tone === "expired" ? s.foundSoon : undefined}>
                    {dl.label}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {/* The panel's one instruction, at the foot where it is out of the way
          until the list is read. Without it a row looks like a label rather
          than something that opens. */}
      <p className={s.foundHint}>Pick one to see the full listing beside the chat.</p>
    </aside>
  );
}


/* --------------------------------------------------------- one exchange --- */

/* A question and the answer it produced, as one block.
 *
 * WHY THEY ARE ONE BLOCK NOW. The question used to be a bubble floating off to
 * the right, on the reasoning that an alignment flip is how you find your own
 * words when scrolling back. In a transcript that answers in grids of cards
 * that stopped being true: three screens below the question, nothing on the
 * page says what was asked. So the question is the HEADER of its exchange and
 * it sticks to the top of the reading area for exactly as long as its answer is
 * on screen, then hands over to the next one. Scrolling a long answer, the
 * thing you are reading always says what it is answering.
 *
 * That is also why the exchange is a <section>: it is a part of a document, and
 * the question is its heading. */
function Exchange({
  exchange,
  onRetry,
  fresh,
}: {
  exchange: { student?: Message; rover?: Message };
  onRetry: (failedId: number, text: string) => void;
  fresh: boolean;
}) {
  const { student, rover } = exchange;
  return (
    <section className={s.turn}>
      {student ? (
        <h2 className={s.ask}>
          <span className={s.askLabel}>You asked</span>
          <span className={s.askText}>{student.text}</span>
        </h2>
      ) : null}
      {rover ? <Answer message={rover} onRetry={onRetry} fresh={fresh} /> : null}
    </section>
  );
}

function Answer({
  message,
  onRetry,
  fresh,
}: {
  message: Message;
  onRetry: (failedId: number, text: string) => void;
  /* False for a conversation restored on re-mount or on reload: render
     settled, do not replay entrances the student already watched. */
  fresh: boolean;
}) {
  /* Whether this turn's working is expanded after it has finished. Collapsed
   * by default once there is an answer to read — see below. */
  const [showWork, setShowWork] = useState(false);

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
  const cards = message.picks.reduce((n, p) => n + p.items.length, 0);

  /* Progressive disclosure, and the condition is "there is now something
   * better to read". A finished turn's five activity lines are evidence, not
   * the answer: left expanded they push every answer in the conversation down
   * by a block of grey text that was only ever interesting while it was
   * happening. So once the turn has stopped and produced an answer, the lines
   * fold into one summary row the student can open again.
   *
   * A turn that finished with NO answer keeps them open — then the working is
   * all there is to look at, and hiding it would be hiding the explanation. */
  const foldable = !working && steps.length > 0 && answering;
  const open = !foldable || showWork;
  const summary = cards
    ? `Activity · ${steps.length} ${steps.length === 1 ? "step" : "steps"} · ${cards} ${cards === 1 ? "opportunity" : "opportunities"} shown`
    : `Activity · ${steps.length} ${steps.length === 1 ? "step" : "steps"}`;

  return (
    <div className={s.rover}>
      <div className={s.said}>
        {/* No byline and no avatar. The exchange above says who is answering,
            and a label repeated under every question is a line of the screen
            spent telling the reader what they worked out at the first one. */}
        <span className="sr-only">{AGENT_NAME} answered:</span>

        {/* The process indicator.
            Each finished step is a tick and quiets down; the one in flight
            carries the marker and the only motion on screen. When the turn
            settles the block folds to its summary row rather than vanishing,
            so nothing the student watched happen becomes unverifiable. */}
        {steps.length || working ? (
          <div className={s.process}>
            {foldable ? (
              <button
                type="button"
                className={[s.processToggle, showWork ? s.processToggleOpen : null].filter(Boolean).join(" ")}
                aria-expanded={showWork}
                onClick={() => setShowWork((v) => !v)}
              >
                <Icon name="chevron-down" size={14} className={s.chev} />
                {summary}
              </button>
            ) : null}

            {/* Height is animated by the grid row rather than by a measured
                max-height: the list's height is unknown until it is laid out,
                and a wrong max-height either clips the last line or animates
                to a gap. A browser without 0fr→1fr support simply snaps, which
                is the correct degradation. */}
            <div className={[s.processBody, open ? s.processOpen : null].filter(Boolean).join(" ")}>
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
                {/* Before the first tool reports there is nothing true to show,
                    so this one line is generic. It is also the only thing the
                    250ms delay in .step applies to in practice, which is the
                    point: a turn answered quickly never flashes it. */}
                {working && !steps.length && !answering ? (
                  <li className={[s.step, fresh ? s.stepEnter : null, s.stepNow].filter(Boolean).join(" ")}>
                    <span className={s.mark} aria-hidden="true" />
                    Understanding your request
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
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
                /* The id is the dossier panel's target: a row there scrolls
                   the card itself back into view rather than carrying a second
                   copy of its actions. */
                <div
                  key={item.id}
                  id={`pick-${item.id}`}
                  className={[s.pick, fresh ? s.pickEnter : null].filter(Boolean).join(" ")}
                >
                  <OpportunityCard item={item} />
                  {pick.why[item.id] ? (
                    /* The title carries the whole sentence; the box shows two
                       lines of it so the row's cards stay the same height. */
                    <p className={s.why} title={pick.why[item.id]}>
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
