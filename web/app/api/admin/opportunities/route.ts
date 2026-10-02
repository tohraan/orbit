/* Mount point only; the handler lives in packages/server so this deployment
 * and the standalone data service behave identically. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { GET, POST, DELETE } from "@rof/server/handlers/admin";
