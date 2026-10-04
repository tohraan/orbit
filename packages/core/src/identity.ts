/* The product's names, in one place, on both sides of the wire.
 *
 * It lives in core rather than in the frontend because the names are no longer
 * only chrome: the agent's system prompt tells it who it is, and that prompt is
 * built on the server. Two copies of a mascot's name is how a portal ends up
 * calling it Rover in the sidebar and "the assistant" in its own first
 * sentence.
 *
 * "Orbit" — two syllables, says what the thing does (everything a student is
 * circling: deadlines, applications, places to go), and sits with the rocket in
 * the BITS emblem.
 *
 * "Rover" — two syllables, the mascot. A rover is sent out, covers ground
 * nobody has the time to cover by hand, and reports back; which is exactly what
 * the agent does to 431 listings on a student's behalf, and what the scrapers
 * behind it do to fifteen sources. Change these strings and the rename carries
 * everywhere — the sidebar, the page, the empty states and the prompt.
 */

export const APP_NAME = "Orbit";
export const APP_TAGLINE = "BITS Pilani Dubai";
export const APP_DESCRIPTION =
  "Funded research opportunities, scholarships, fellowships and internships a BITS Pilani Dubai student can apply to.";

export const AGENT_NAME = "Rover";
/** Used wherever the agent is introduced in one line. */
export const AGENT_BLURB = `${AGENT_NAME} reads the whole index and comes back with the ones that fit you.`;
