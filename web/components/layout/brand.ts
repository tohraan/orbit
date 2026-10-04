/* The product's name, in one place — which is now packages/core/identity.ts,
 * because the server needs the same strings: Rover's system prompt tells it
 * what it is called and which portal it lives in, and a second copy of a name
 * is how a mascot ends up called Rover in the sidebar and "the assistant" in
 * its own opening line.
 *
 * Re-exported from here so every screen keeps importing it from the place it
 * always did. Rename in core; nothing else hard-codes either name.
 */

export { APP_NAME, APP_TAGLINE, APP_DESCRIPTION, AGENT_NAME, AGENT_BLURB } from "@rof/core";
