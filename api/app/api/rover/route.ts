/* Mount point only. The handler itself is in packages/server, so this
 * deployment and the standalone data service (api/) serve byte-identical
 * responses from one implementation.
 *
 * `force-dynamic` and the node runtime for the usual reasons, plus one of its
 * own: the handler streams, and the edge runtime has no filesystem for the
 * snapshot fallback the index falls back to. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { POST } from "@rof/server/handlers/rover";
