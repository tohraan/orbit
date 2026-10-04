/* What a model actually sends, rendered safely.
 *
 * WHY THIS EXISTS. The prompt asks Rover for plain prose with the occasional
 * bold phrase, and for a while the renderer was one `**bold**` split on that
 * basis. Then a live turn came back as a markdown list — "- **UNU Finance
 * Internship** – remote, stipend, closes today" — and every character of it
 * landed in the bubble as literal text, asterisks and all. A model will write
 * markdown whatever the prompt says, so the renderer has to read markdown. The
 * answer to "it should not do that" is in tools.ts; this file's job is that
 * the screen never looks broken when it does.
 *
 * WHY BY HAND AND NOT A LIBRARY. The grammar in ./markdown.ts is the whole of
 * what can arrive from a chat model: paragraphs, headings, the two kinds of
 * list, fenced and inline code, links and bare URLs. A CommonMark parser plus
 * a sanitiser is two dependencies and an injection surface for that. Anything
 * outside the grammar stays literal text, which is the safe failure — a stray
 * asterisk is a worse-looking answer, never a security problem.
 *
 * THE LINK RULE IS ENFORCED IN ONE PLACE. `Anchor` below is the only anchor
 * the chat can produce, and it always carries target="_blank" and
 * rel="noopener noreferrer". Which hrefs are allowed to become a link at all
 * is decided in ./markdown.ts, so a `javascript:` URL never reaches this file
 * as a `link` token. All chat prose goes through `RichText`, so there is no
 * second rendering path where either half of that rule can be forgotten. */

import type { ReactNode } from "react";
import s from "./markdown.module.css";
import { inlineTokens, parse, type Token } from "./markdown";

/** The one place an anchor is built in the chat. */
function Anchor({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className={s.link} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function Inline({ text, k }: { text: string; k: string }) {
  return (
    <>
      {inlineTokens(text).map((token: Token, i) => {
        const key = `${k}-${i}`;
        if (token.t === "br") return <br key={key} />;
        if (token.t === "bold") return <strong key={key}>{token.value}</strong>;
        if (token.t === "code")
          return (
            <code key={key} className={s.code}>
              {token.value}
            </code>
          );
        if (token.t === "link")
          return (
            <Anchor key={key} href={token.href}>
              {token.value}
            </Anchor>
          );
        return <span key={key}>{token.value}</span>;
      })}
    </>
  );
}

export function RichText({ text }: { text: string }) {
  return (
    <>
      {parse(text).map((b, i) => {
        const key = `b${i}`;

        if (b.kind === "pre") {
          /* Scrolls inside itself. A wide line of code must never widen the
             bubble, because that widens the transcript and then the page. */
          return (
            <pre key={key} className={s.pre}>
              <code>{b.text}</code>
            </pre>
          );
        }

        if (b.kind === "h") {
          return (
            <h3 key={key} className={s.heading}>
              <Inline text={b.text} k={key} />
            </h3>
          );
        }

        if (b.kind === "ul") {
          return (
            <ul key={key} className={s.list}>
              {b.items.map((item, j) => (
                <li key={`${key}-${j}`}>
                  <Inline text={item} k={`${key}-${j}`} />
                </li>
              ))}
            </ul>
          );
        }

        if (b.kind === "ol") {
          return (
            <ol key={key} className={s.list}>
              {b.items.map((item, j) => (
                <li key={`${key}-${j}`}>
                  <Inline text={item} k={`${key}-${j}`} />
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p key={key}>
            <Inline text={b.text} k={key} />
          </p>
        );
      })}
    </>
  );
}
