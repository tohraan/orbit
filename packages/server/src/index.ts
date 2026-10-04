/* Server-only exports. Importing this from a client component is a build
 * error, not a silent leak: source.ts carries `server-only`. */

export { getIndex, invalidateIndex, warm, type Index } from "./source";
export { getInterest, withInterest, MIN_VISIBLE, type Interest } from "./interest";
export { CACHE_LIST, CACHE_STATIC, fail, json, limited } from "./api";
export { clientKey, take, type Verdict } from "./rate-limit";
export { validate, toRow, writeRow, type AdminInput, type AdminError } from "./admin";
/* Rover. `configured()` is what the UI asks before offering the screen at all,
 * so a deployment without an Anthropic key says so instead of failing on the
 * first message. */
export { configured as roverConfigured, budgetSnapshot as roverBudget, model as roverModel } from "./rover/agent";

