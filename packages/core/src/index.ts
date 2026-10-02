/* The shared surface both deployments import.
 *
 * `web` (the frontend) and `api` (the data service) are separate Vercel
 * projects. Everything they must agree on lives here, so a field renamed in
 * the projection cannot silently diverge from the type the browser renders. */

export * from "./types";
export * from "./format";
export * from "./fx";
export * from "./shuffle";
export * from "./query";
export * from "./project";
export * from "./match";
