/* Mount point only. The handler itself is in packages/server, so this
 * deployment and the standalone data service (api/) serve byte-identical
 * responses from one implementation. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { GET } from "@rof/server/handlers/detail";
