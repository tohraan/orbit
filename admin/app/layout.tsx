import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "@rof/styles/globals.css";
import { SessionProvider } from "@/lib/session";
import { Shell } from "@/components/Shell";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });

/* A nonce can only be stamped onto a page rendered per request: Next reads it
 * out of the incoming request's own Content-Security-Policy header (proxy.ts),
 * and a statically prerendered page has no incoming request.
 *
 * Without this the response carries a policy with a nonce that none of the
 * <script> tags have, `strict-dynamic` revokes the host allowance, and the
 * browser blocks EVERY script. The server-rendered HTML still paints, so the
 * desk looked like it was working and simply sat on "Checking your session…"
 * forever — 0 of 11 script tags nonced, against 16 of 16 on the portal, which
 * is what finally showed it. The portal carries the same line for the same
 * reason; copying proxy.ts without it reproduced the bug exactly. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Orbit Desk",
  description: "The management desk for the BITS Pilani Dubai opportunity portal.",
  /* This deployment lists students. It is not for the index. */
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body>
        <SessionProvider>
          <Shell>{children}</Shell>
        </SessionProvider>
      </body>
    </html>
  );
}
