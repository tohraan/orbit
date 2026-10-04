/* The chat grammar, with no React and no CSS in it.
 *
 * Split out from RichText.tsx so it can be tested by plain node — the renderer
 * imports a CSS module, which node cannot load, and the part worth testing is
 * exactly the part that decides whether a model's output becomes a list, a
 * code block or a clickable link. tests/rover-richtext.test.mjs exercises this
 * file directly.
 *
 * Everything here is pure: text in, typed tokens out. The renderer's only job
 * is to map those tokens onto elements, which is why the link policy is
 * decided HERE — `link` tokens are only ever produced for a scheme that is
 * safe to put in an href, and anything else comes back as `text`. */

/** Schemes a link may use. A model can type `javascript:` into a markdown
 *  link; everything outside this set becomes plain text rather than an anchor,
 *  so a bad scheme cannot reach the DOM as something clickable. Relative paths
 *  are allowed because they stay inside the portal. */
const SAFE = /^(https?:\/\/|mailto:|\/)/i;
export const safeHref = (url: string) => SAFE.test(url.trim());

export type Token =
  | { t: "text"; value: string }
  | { t: "bold"; value: string }
  | { t: "code"; value: string }
  | { t: "link"; value: string; href: string }
  | { t: "br" };

/* One pass over the inline forms. Code comes first in the alternation because
 * text inside backticks must never be re-read as anything else. */
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s<>()]+)/g;

export function inlineTokens(text: string): Token[] {
  const out: Token[] = [];

  const plain = (value: string) => {
    /* A single newline inside a paragraph is a break the model meant. */
    const parts = value.split("\n");
    parts.forEach((part, i) => {
      if (part) out.push({ t: "text", value: part });
      if (i < parts.length - 1) out.push({ t: "br" });
    });
  };

  for (const part of text.split(INLINE)) {
    if (!part) continue;

    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      out.push({ t: "code", value: part.slice(1, -1) });
      continue;
    }

    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      out.push({ t: "bold", value: part.slice(2, -2) });
      continue;
    }

    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      if (safeHref(href)) out.push({ t: "link", value: label, href });
      else plain(label);
      continue;
    }

    if (/^https?:\/\//i.test(part)) {
      /* Trailing punctuation belongs to the sentence, not to the link:
       * "see https://x.org." must not put the full stop inside the anchor. */
      const trail = /[.,;:!?)]+$/.exec(part);
      const href = trail ? part.slice(0, -trail[0].length) : part;
      out.push({ t: "link", value: href, href });
      if (trail) out.push({ t: "text", value: trail[0] });
      continue;
    }

    plain(part);
  }

  return out;
}

export type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "pre"; text: string };

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

/** Line by line, once. An UNCLOSED fence is normal rather than an error: this
 *  runs on every streamed delta, so the closing ``` usually has not arrived
 *  yet, and the half-written block still has to render as a block. */
export function parse(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];

  const flush = () => {
    const text = para.join("\n").trim();
    if (text) blocks.push({ kind: "p", text });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      blocks.push({ kind: "pre", text: body.join("\n") });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "h", text: heading[1] });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = NUMBER.exec(line);
    if (bullet || numbered) {
      flush();
      const kind = bullet ? "ul" : "ol";
      const item = (bullet ?? numbered)![1];
      const last = blocks[blocks.length - 1];
      if (last && last.kind === kind) last.items.push(item);
      else blocks.push(kind === "ul" ? { kind: "ul", items: [item] } : { kind: "ol", items: [item] });
      continue;
    }

    if (!line.trim()) flush();
    else para.push(line);
  }

  flush();
  return blocks;
}
