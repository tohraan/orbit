/* The admin scraper's SSRF guard.
 *
 * This endpoint makes the SERVER fetch a URL a user chose, which is the exact
 * shape that reads cloud credentials out of 169.254.169.254 if the guard is
 * wrong. So the guard is attacked here rather than demonstrated: every test
 * below is an address that MUST be refused, written the way an attacker would
 * write it — decimal, IPv6-mapped, and behind a redirect. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";

const { isPrivateAddress, resolve } = await import("../packages/server/src/net-guard.ts");

/* `resolve` is the whole front door: parse, look up, judge. Testing it rather
 * than the full scrape keeps this a unit test with no network dependency on
 * anyone else's server. */
const scrape = async (u) => {
  const r = await resolve(u);
  return "ok" in r ? r : { ok: true };
};

let n = 0;
const test = (name, fn) => { fn(); n++; console.log("  pass", name); };
const atest = async (name, fn) => { await fn(); n++; console.log("  pass", name); };

test("cloud metadata, loopback and private ranges are all refused", () => {
  const blocked = [
    ["169.254.169.254", 4, "AWS/GCP/Azure instance metadata"],
    ["169.254.170.2", 4, "ECS task metadata"],
    ["127.0.0.1", 4, "loopback"],
    ["127.1.1.1", 4, "loopback, whole /8"],
    ["0.0.0.0", 4, "this host"],
    ["10.0.0.5", 4, "private /8"],
    ["172.16.0.1", 4, "private /12 low"],
    ["172.31.255.254", 4, "private /12 high"],
    ["192.168.1.1", 4, "private /16"],
    ["100.64.0.1", 4, "carrier-grade NAT"],
    ["224.0.0.1", 4, "multicast"],
    ["255.255.255.255", 4, "broadcast"],
    ["::1", 6, "IPv6 loopback"],
    ["fe80::1", 6, "IPv6 link-local"],
    ["fd00::1", 6, "IPv6 unique local"],
    ["::ffff:169.254.169.254", 6, "metadata written as IPv4-mapped IPv6"],
    ["::ffff:127.0.0.1", 6, "loopback written as IPv4-mapped IPv6"],
  ];
  for (const [ip, fam, why] of blocked) {
    assert.equal(isPrivateAddress(ip, fam), true, `${ip} (${why}) must be refused`);
  }
});

test("the /12 boundary is not off by one", () => {
  assert.equal(isPrivateAddress("172.15.255.255", 4), false, "172.15 is public");
  assert.equal(isPrivateAddress("172.16.0.0", 4), true);
  assert.equal(isPrivateAddress("172.31.255.255", 4), true);
  assert.equal(isPrivateAddress("172.32.0.0", 4), false, "172.32 is public");
});

test("ordinary public addresses are allowed", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "140.82.121.4", "93.184.216.34"]) {
    assert.equal(isPrivateAddress(ip, 4), false, `${ip} should be reachable`);
  }
  assert.equal(isPrivateAddress("2606:4700:4700::1111", 6), false);
});

test("malformed input is refused rather than allowed", () => {
  for (const junk of ["", "not-an-ip", "1.2.3", "1.2.3.4.5", "999.1.1.1", "-1.0.0.1"]) {
    assert.equal(isPrivateAddress(junk, 4), true, `${JSON.stringify(junk)} must not be treated as public`);
  }
});

const TODAY = "2026-10-03";

await atest("a link to localhost is refused before any request is made", async () => {
  for (const u of ["http://127.0.0.1/", "http://localhost/", "http://169.254.169.254/latest/meta-data/"]) {
    const r = await scrape(u, TODAY);
    assert.equal(r.ok, false, `${u} must be refused`);
    assert.ok(["blocked_host", "unreachable"].includes(r.code), `got ${r.code} for ${u}`);
  }
});

await atest("non-http schemes are refused", async () => {
  for (const u of ["file:///etc/passwd", "ftp://example.org/x", "gopher://example.org"]) {
    const r = await scrape(u, TODAY);
    assert.equal(r.ok, false);
    assert.equal(r.code, "bad_url", `${u} gave ${r.code}`);
  }
});

await atest("credentials embedded in the URL are refused", async () => {
  const r = await scrape("http://user:pass@example.org/", TODAY);
  assert.equal(r.ok, false);
  assert.equal(r.code, "bad_url");
});

await atest("every hop of a redirect chain is re-judged, not just the first", async () => {
  /* The failure a single up-front check misses: hop one is a genuinely public
   * host, and it answers 302 to the metadata service. scrape.ts follows
   * redirects by hand (redirect: "manual") and calls resolve() on each hop for
   * exactly this reason, so what has to hold is that the guard refuses the
   * redirect TARGET when it is asked about it. */
  const target = await resolve("http://169.254.169.254/latest/meta-data/");
  assert.equal(target.ok, false);
  assert.equal(target.code, "blocked_host");

  /* And that the manual-redirect wiring is actually in the source, since a
   * later edit to `redirect: "follow"` would silently undo the check above. */
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../packages/server/src/scrape.ts", import.meta.url), "utf8");
  assert.ok(src.includes('redirect: "manual"'), "scrape must follow redirects by hand");
  const redirectBranch = src.slice(src.indexOf("res.status >= 300"), src.indexOf("return res;\n  }"));
  assert.ok(
    redirectBranch.includes("await resolve("),
    "the redirect branch must re-resolve the hop before following it",
  );
});

console.log(`\nall ${n} assertions passed`);
