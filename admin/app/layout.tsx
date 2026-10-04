import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist } from "next/font/google";
import "@rof/styles/globals.css";
import { SessionProvider } from "@/lib/session";
import { Shell } from "@/components/Shell";

/* §8.1: Geist, with the fallback stack declared in globals.css. next/font
 * self-hosts both faces at build time, which is what lets the CSP forbid every
 * third-party host outright — no fonts.googleapis.com, no font-src exception. */
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
  title: "Orbit Desk — BITS Pilani Dubai",
  description: "The management desk for the BITS Pilani Dubai opportunity portal.",
  icons: { icon: "/bits-logo-64.png", apple: "/bits-logo-256.png" },
  /* This deployment lists students. It is not for the index. */
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/* Applied before first paint, so a dark-theme viewer never sees a white flash.
 * It has to be inline and synchronous for that, which means it needs the CSP
 * nonce explicitly — Next stamps its own scripts, not ours.
 *
 * The same key as the portal ("rof.v1.theme"), on purpose: staff use both, and
 * a theme that resets when you cross between them reads as two products. */
const THEME_SCRIPT = `try{var c=localStorage.getItem('rof.v1.theme');if(c==='dark'||c==='light')document.documentElement.setAttribute('data-theme',c)}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <SessionProvider>
          <Shell>{children}</Shell>
        </SessionProvider>
      </body>
    </html>
  );
}
