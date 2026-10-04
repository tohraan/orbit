/* How complete a student's profile is, and what the next useful step is.
 *
 * Shared by /profile (which shows it) and /welcome (which fills it), so the
 * two can never disagree about what counts as done — the commonest way a
 * setup flow ends up claiming 100% on a screen that still has empty fields.
 *
 * Phases are groups of fields that belong to the same question, which is what
 * makes the flow feel like a conversation rather than a form: a student is
 * asked one thing at a time, heaviest first, and never more than three fields
 * on a screen.
 *
 * Completeness is therefore measured ONLY over fields the matcher reads. A
 * profile at 100% is one that can be ranked confidently — not one where every
 * box happens to be filled. That is why the "course" phase declares no
 * required fields: it is real information worth keeping, and it buys the
 * student nothing in the ranking, so it must not be able to inflate the
 * number that tells them how well we can match them.
 */

import type { Profile } from "./store";

export type Phase = {
  id: "level" | "subjects" | "funding" | "course";
  title: string;
  blurb: string;
  icon: "user" | "school" | "explore" | "coins" | "globe" | "sparkle";
  /** Which profile fields this phase owns. */
  fields: (keyof Profile)[];
  /** Fields that are optional — counted when present, never missed when not. */
  optional?: (keyof Profile)[];
  /** What filling it in actually buys, in the student's terms. */
  payoff: string;
  /** Share of the match score this phase decides, 0-100. Zero is honest
   *  rather than a reason to hide a phase - it is why that phase comes last. */
  weight: number;
};

/* ORDERED BY WHAT EACH ONE IS WORTH, not by what is conventional to ask first.
 *
 * The previous order opened with name, email and phone, then degree, branch,
 * year and graduation: seven questions, none of which the matcher reads,
 * before the first one that changes a single recommendation. A student who
 * gave up at question four had told us nothing we could rank with.
 *
 * packages/core/src/match.ts weights level 34, field 26, funding 18 and
 * country 12. Those are now the first things asked, heaviest first, and no
 * phase holds more than three fields so no screen reads as a form.
 *
 * Name and email are gone entirely. Sign-up already captures both - signUp()
 * writes full_name and the address IS the login - so asking again was the
 * flow re-collecting what it already had. Branch and graduation are gone from
 * the flow for the same reason they were never scored: they are profile
 * details, editable on /profile, not questions worth a step of someone's
 * attention on first run. */
export const PHASES: Phase[] = [
  {
    id: "level",
    title: "Your level",
    blurb: "What you are applying for",
    icon: "sparkle",
    fields: ["level"],
    payoff:
      "The single biggest factor - a third of the score, and the one thing that stops a PhD fellowship being ranked for a first-year.",
    weight: 34,
  },
  {
    id: "subjects",
    title: "Your subjects",
    blurb: "The work you want to do",
    icon: "explore",
    fields: ["fields"],
    payoff:
      "Matched against every listing's title and description, because no source publishes a field of study.",
    weight: 26,
  },
  {
    id: "funding",
    title: "Funding and places",
    blurb: "What you need, and where",
    icon: "coins",
    fields: ["funding", "countries"],
    payoff:
      "Separates fully funded places from ones that expect you to cover living costs, and promotes countries you would actually move to.",
    weight: 30,
  },
  {
    id: "course",
    title: "Your course",
    blurb: "Degree, year, phone",
    icon: "school",
    fields: [],
    optional: ["degree", "year", "phone"],
    payoff:
      "Changes no ranking. It is here so the portal can show whether a programme's dates fit around your degree, and it is the last thing asked for exactly that reason.",
    weight: 0,
  },
];

export type PhaseState = Phase & {
  done: number;
  total: number;
  complete: boolean;
  missing: (keyof Profile)[];
};

const filled = (p: Profile, k: keyof Profile) => String(p[k] ?? "").trim().length > 0;

export function phaseStates(profile: Profile): PhaseState[] {
  return PHASES.map((ph) => {
    const done = ph.fields.filter((f) => filled(profile, f)).length;
    return {
      ...ph,
      done,
      total: ph.fields.length,
      complete: done === ph.fields.length,
      missing: ph.fields.filter((f) => !filled(profile, f)),
    };
  });
}

/** 0–100 across the required fields of every phase. */
export function completeness(profile: Profile): number {
  const states = phaseStates(profile);
  const done = states.reduce((n, s) => n + s.done, 0);
  const total = states.reduce((n, s) => n + s.total, 0);
  return total ? Math.round((done / total) * 100) : 0;
}

/** The phase to send someone to next — the first unfinished one. */
export function nextPhase(profile: Profile): PhaseState | null {
  return phaseStates(profile).find((s) => !s.complete) ?? null;
}

export const FIELD_LABELS: Partial<Record<keyof Profile, string>> = {
  name: "Your name",
  email: "Campus email",
  phone: "Phone",
  degree: "Degree",
  course: "Branch",
  year: "Year of study",
  graduation: "Expected graduation",
  level: "Level you are applying at",
  fields: "Subjects",
  countries: "Countries",
  funding: "Funding you need",
};
