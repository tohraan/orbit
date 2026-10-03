/* Is this address one a public scraper may talk to?
 *
 * Its own file, with no `server-only` and no imports but node:dns, for one
 * reason: this is the judgement that stops the admin scraper being used to read
 * cloud credentials out of 169.254.169.254, and a guard that cannot be unit
 * tested is a guard that rots. tests/scrape.test.mjs attacks it directly.
 */

import { lookup } from "node:dns/promises";

export type GuardFailure = {
  ok: false;
  code: "bad_url" | "blocked_host" | "unreachable";
  message: string;
};

/** Address ranges a public scraper must never reach. */
export function isPrivateAddress(ip: string, family: number): boolean {
  if (family === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fe80:")) return true;               // link-local
    if (/^f[cd]/.test(v)) return true;                    // unique local
    /* IPv4-mapped (::ffff:127.0.0.1) — unwrap and judge as v4, or every v4
     * rule below can be bypassed by writing the address in v6 form. */
    const m = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isPrivateAddress(m[1], 4);
    return false;
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;       // this host, private, loopback
  if (a === 169 && b === 254) return true;                 // link-local — cloud metadata lives here
  if (a === 172 && b >= 16 && b <= 31) return true;        // private
  if (a === 192 && b === 168) return true;                 // private
  if (a === 100 && b >= 64 && b <= 127) return true;       // carrier-grade NAT
  if (a === 192 && b === 0) return true;                   // IETF protocol assignments
  if (a >= 224) return true;                               // multicast, reserved, broadcast
  return false;
}

/** Parse, then resolve, then judge. Returns the URL only if every address the
 *  hostname resolves to is public — ALL of them, because a name that returns
 *  one public and one private address would otherwise be a coin flip. */
export async function resolve(raw: string): Promise<{ url: URL } | GuardFailure> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, code: "bad_url", message: "That is not a valid link." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, code: "bad_url", message: "Only http and https links can be read." };
  }
  /* Credentials in the URL are a redirect-laundering trick and have no place in
   * a link to a public opportunity page. */
  if (url.username || url.password) {
    return { ok: false, code: "bad_url", message: "Remove the username and password from the link." };
  }
  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(url.hostname, { all: true });
  } catch {
    return { ok: false, code: "unreachable", message: "That hostname does not resolve." };
  }
  if (!addrs.length) {
    return { ok: false, code: "unreachable", message: "That hostname does not resolve." };
  }
  if (addrs.some((a) => isPrivateAddress(a.address, a.family))) {
    return {
      ok: false,
      code: "blocked_host",
      message: "That link points inside a private network, so it cannot be read.",
    };
  }
  return { url };
}
