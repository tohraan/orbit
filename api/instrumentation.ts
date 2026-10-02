/* Runs once when the server process starts, before it takes any traffic.
 *
 * This is the only reliable place to warm the index. A route module looks like
 * the obvious home for it, but Next loads route modules LAZILY — the code in
 * app/route.ts does not execute until something requests that path, so a warm
 * call there fires after the first visitor has already waited for it.
 *
 * Measured: the cold index read is ~3.5s even after the database-side filter
 * (432 rows of jsonb rather than 2,274). Moving it here takes it off the
 * request path entirely.
 */

export async function register() {
  /* Node runtime only. The edge runtime has no filesystem for the snapshot
   * fallback and gets its own fresh process per region anyway. */
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { warm } = await import("@rof/server");
  warm();
}
