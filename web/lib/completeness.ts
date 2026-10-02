/* How complete a student's profile is, and what the next useful step is.
 *
 * Shared by /profile (which shows it) and /welcome (which fills it), so the
 * two can never disagree about what counts as done — the commonest way a
 * setup flow ends up claiming 100% on a screen that still has empty fields.
 *
 * Phases are groups of fields that belong to the same question, which is what
 * makes the flow feel like a conversation rather than a form: a student is
 * asked who they are, then what they study, then what they want — not asked
 * for eleven fields at once.
 */

import type { Profile } from "./store";

export type Phase = {
  id: "you" | "course" | "goals" | "funding";
  title: string;
  blurb: string;
  icon: "user" | "school" | "explore" | "coins";
  /** Which profile fields this phase owns. */
  fields: (keyof Profile)[];
  /** Fields that are optional — counted when present, never missed when not. */
  optional?: (keyof Profile)[];
  /** What filling it in actually buys, in the student's terms. */
  payoff: string;
};

export const PHASES: Phase[] = [
  {
    id: "you",
    title: "About you",
    blurb: "Name and how to reach you",
    icon: "user",
    fields: ["name", "email"],
    optional: ["phone"],
    payoff: "So the portal can address you and send deadline reminders when email is switched on.",
  },
  {
    id: "course",
    title: "Your course",
    blurb: "Degree, branch and year",
    icon: "school",
    fields: ["degree", "course", "year"],
    optional: ["graduation"],
    payoff: "So you can tell at a glance whether a programme's dates fit around your degree.",
  },
  {
    id: "goals",
    title: "What you want",
    blurb: "Level and subjects",
    icon: "explore",
    fields: ["level", "fields"],
    payoff: "The two biggest factors in ranking — together they are 60% of how we match you.",
  },
  {
    id: "funding",
    title: "Where and how funded",
    blurb: "Countries and funding",
    icon: "coins",
    fields: ["countries", "funding"],
    payoff: "Promotes places you would actually go, and separates fully funded from the rest.",
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
