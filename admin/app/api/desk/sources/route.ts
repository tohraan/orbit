/* Thin route shim. The handler lives in @rof/server so the logic is testable
 * and shared, exactly as the portal's /api routes are. */
import { sourcesRoute } from "@rof/server/handlers/desk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = sourcesRoute;
