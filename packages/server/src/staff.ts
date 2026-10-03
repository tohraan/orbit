/* Who is asking, and are they staff?
 *
 * This replaces the shared ADMIN_TOKEN. That token kept the write endpoint off
 * the open internet and did nothing else: it recorded that "staff" added a
 * listing rather than WHO, and it could not be revoked for one person without
 * changing it for everyone who had it.
 *
 * Now the caller sends their own Supabase access token, exactly as the student
 * portal does, and this verifies it with Supabase and then reads `is_staff`
 * from their students row.
 *
 * TWO CALLS, AND BOTH ARE NECESSARY.
 *
 *   1. /auth/v1/user with the caller's token — asks Supabase "is this token
 *      real, unexpired, and whose is it?". A JWT decoded locally without
 *      checking the signature is just a claim the caller wrote.
 *   2. The students row, read with the SERVICE key — asks the database "is
 *      this person staff?". Read with the caller's own token it would be
 *      subject to RLS and, more importantly, `is_staff` would then be a field
 *      the caller's session could in principle influence. The service key reads
 *      the truth.
 *
 * db/015's students_update_own policy already pins is_staff to its existing
 * value, so a student cannot promote themselves; this module is what finally
 * reads the flag.
 */

import "server-only";

export type Staff = { id: string; email: string; name: string | null };

export type StaffCheck =
  | { ok: true; staff: Staff }
  | { ok: false; status: 401 | 403 | 500; code: string; message: string };

function env() {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY ?? "";
  return url && key ? { url, key } : null;
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  const t = m?.[1]?.trim();
  return t || null;
}

/** Verify the caller and confirm they are staff. Every refusal is deliberately
 *  the same shape to the caller: a probe must not be able to tell "no such
 *  account" from "not staff". */
export async function requireStaff(req: Request): Promise<StaffCheck> {
  const cfg = env();
  if (!cfg) {
    /* Refuse rather than run open. An admin API that is accidentally public is
     * worse than one that is accidentally broken. */
    return { ok: false, status: 500, code: "not_configured", message: "The desk is not configured." };
  }
  const token = bearer(req);
  if (!token) return { ok: false, status: 401, code: "unauthorised", message: "Sign in to use the desk." };

  let user: { id?: string; email?: string };
  try {
    const res = await fetch(`${cfg.url}/auth/v1/user`, {
      headers: { apikey: cfg.key, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, status: 401, code: "unauthorised", message: "Sign in to use the desk." };
    user = (await res.json()) as { id?: string; email?: string };
  } catch {
    return { ok: false, status: 500, code: "auth_unreachable", message: "Could not verify your session." };
  }
  if (!user?.id) return { ok: false, status: 401, code: "unauthorised", message: "Sign in to use the desk." };

  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/students?select=id,email,full_name,is_staff&id=eq.${encodeURIComponent(user.id)}`,
      { headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` }, cache: "no-store" },
    );
    if (!res.ok) return { ok: false, status: 500, code: "lookup_failed", message: "Could not check your access." };
    const rows = (await res.json()) as { id: string; email: string | null; full_name: string | null; is_staff: boolean }[];
    const row = rows[0];
    if (!row?.is_staff) {
      return { ok: false, status: 403, code: "forbidden", message: "This area is for department staff." };
    }
    return { ok: true, staff: { id: row.id, email: row.email ?? user.email ?? "", name: row.full_name } };
  } catch {
    return { ok: false, status: 500, code: "lookup_failed", message: "Could not check your access." };
  }
}

/** Append to the audit trail. Written with the service key because db/020
 *  denies INSERT to every role a browser can hold — a staff member must not be
 *  able to author their own trail. Never throws: a failed audit write must not
 *  fail the action it was recording, but it is reported so it is not silent. */
export async function audit(
  staff: Staff,
  action: string,
  target: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  const cfg = env();
  if (!cfg) return;
  try {
    const res = await fetch(`${cfg.url}/rest/v1/admin_audit`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ actor: staff.id, actor_email: staff.email, action, target, detail }),
    });
    if (!res.ok) console.error(`[audit] ${action} not recorded: ${res.status}`);
  } catch (e) {
    console.error("[audit] not recorded", e);
  }
}
