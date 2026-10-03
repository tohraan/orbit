/* Server-only exports. Importing this from a client component is a build
 * error, not a silent leak: source.ts carries `server-only`. */

export { getIndex, invalidateIndex, warm, type Index } from "./source";
export { getInterest, withInterest, MIN_VISIBLE, type Interest } from "./interest";
export { CACHE_LIST, CACHE_STATIC, fail, json, limited } from "./api";
export { clientKey, take, type Verdict } from "./rate-limit";
export { authorised, validate, toRow, writeRow, deleteRow, type AdminInput, type AdminError } from "./admin";
