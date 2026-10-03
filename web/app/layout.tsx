import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist } from "next/font/google";
import "@rof/styles/globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/components/layout/brand";

/* §8.1: Geist, with the fallback stack declared in globals.css. next/font
 * self-hosts both faces at build time, which is what lets the CSP forbid every
 * third-party host outright — no fonts.googleapis.com, no font-src exception. */
const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });

export const metadata: Metadata = {
  title: `${APP_NAME} — ${APP_TAGLINE}`,
  description: APP_DESCRIPTION,
  icons: { icon: "/bits-logo-64.png", apple: "/bits-logo-256.png" },
  /* Nothing here should be indexed: the content is other people's listings,
   * republished for one campus, and the canonical page for every one of them
   * is the source site. */
  robots: { index: false, follow: false },
};

/* A nonce can only be stamped onto a page that is rendered per request: Next
 * reads it out of the incoming request's own Content-Security-Policy header
 * (see proxy.ts), and a statically prerendered page has no incoming request.
 * Without this the policy carries a nonce that none of the <script> tags have,
 * `strict-dynamic` revokes the host allowance, and the browser silently blocks
 * every script -- the server HTML paints and the page then never fetches
 * anything, which looks exactly like a broken backend.
 *
 * Declaring it on the root layout covers every route beneath it. The cost is
 * near nothing: these pages render no data, so a request only assembles the
 * shell. The data itself is cached and paginated behind /api. */
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  /* §19: safe-area padding on supported devices needs the cover fit. */
  viewportFit: "cover",
  themeColor: "#f7f7f4",
};

/* Applied before first paint, so a dark-theme viewer never sees a white flash.
 * It has to be inline and synchronous for that, which means it needs the CSP
 * nonce explicitly — Next stamps its own scripts, not ours. Reading the stored
 * choice here rather than in React also avoids a hydration mismatch, because
 * the attribute is already on <html> by the time React runs.
 *
 * Deliberately tiny and failure-tolerant: if storage throws, the page keeps
 * the system theme rather than not rendering. */
const THEME_SCRIPT = `try{var c=localStorage.getItem('rof.v1.theme');if(c==='dark'||c==='light')document.documentElement.setAttribute('data-theme',c)}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {/* §74: a logical tab order starts with a way past the navigation. */}
        <a
          href="#main"
          style={{
            position: "absolute",
            left: -9999,
            top: 0,
            zIndex: 200,
            padding: "10px 14px",
            background: "var(--color-action)",
            color: "var(--color-action-text)",
            borderRadius: 8,
          }}
          onFocus={undefined}
          className="skip-link"
        >
          Skip to content
        </a>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
