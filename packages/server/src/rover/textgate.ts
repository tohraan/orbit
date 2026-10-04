/* Stops a model's tool-call scaffolding reaching the student.
 *
 * WHY THIS EXISTS. On its last step the loop withholds tools, so the model has
 * to answer in prose. A weak model sometimes answers by writing the tool call
 * it wanted to make, as text:
 *
 *   <tool_call>
 *   <function=search_opportunities>
 *   <parameter=level>["masters"]</parameter>
 *   ...
 *
 * That streamed straight into the chat bubble on a live run. It is a
 * well-known failure mode rather than a quirk of one model — any model that
 * has been trained to emit tool calls can emit the surface form instead of the
 * structured block — so it is handled here rather than hoped against.
 *
 * HOW IT WORKS. Text is held back until there is enough of it to judge, or the
 * stream ends. If a marker shows up, everything from the marker on is dropped
 * and the gate latches shut for the rest of the turn; a marker inside the
 * held-back opening suppresses the whole thing. Otherwise the text flows with
 * a delay nobody can perceive.
 *
 * It is deliberately conservative: the markers are shapes no ordinary sentence
 * about a scholarship contains, and the gate never rewrites text, only cuts
 * it. A false positive costs a sentence; a false negative shows a student XML.
 */

/* The opening of the longest marker here is 11 characters, so judging on 24 is
 * enough to never split one, while staying short enough that the delay before
 * the first word is imperceptible. */
const LOOKAHEAD = 24;

/* Surface forms of a tool call, across the model families this runs on.
 * `<function=` and `<parameter=` are the shapes seen live; the rest are the
 * other common ones and cost nothing to guard. */
const MARKERS = [
  "<tool_call",
  "</tool_call",
  "<function=",
  "<function_call",
  "<parameter=",
  "<|python_tag|>",
  "<|tool_call",
  "[TOOL_CALL",
  '{"name":"search_opportunities"',
  '{"name": "search_opportunities"',
  '{"name":"recommend"',
  '{"name": "recommend"',
];

function markerAt(text: string): number {
  let at = -1;
  for (const m of MARKERS) {
    const i = text.indexOf(m);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  return at;
}

export class TextGate {
  private held = "";
  private open = false;
  private shut = false;
  /** True once anything was suppressed, so the caller can say why it stopped. */
  cut = false;
  /** True once any text has actually been let through. The caller needs both:
   *  text cut after a real sentence is a truncated answer, while text cut with
   *  nothing shown is an answer that was entirely scaffolding. */
  shown = false;

  /** Returns the text safe to show now — often "". */
  push(delta: string): string {
    if (this.shut) return "";

    if (!this.open) {
      this.held += delta;
      if (this.held.length < LOOKAHEAD) return "";
      /* Enough to judge. A marker in the opening means the whole reply is
       * scaffolding, not an answer. */
      const at = markerAt(this.held);
      if (at !== -1) {
        this.shut = true;
        this.cut = true;
        this.held = "";
        return "";
      }
      this.open = true;
      const out = this.held;
      this.held = "";
      if (out) this.shown = true;
      return out;
    }

    /* Flowing. A marker appearing mid-answer truncates it there — the prose
     * before it was real, the scaffolding after it is not. */
    const at = markerAt(delta);
    if (at !== -1) {
      this.shut = true;
      this.cut = true;
      const out = delta.slice(0, at);
      if (out) this.shown = true;
      return out;
    }
    if (delta) this.shown = true;
    return delta;
  }

  /** Whatever is still held back when the stream ends. */
  flush(): string {
    if (this.shut || !this.held) return "";
    const at = markerAt(this.held);
    if (at !== -1) {
      this.cut = true;
      const out = this.held.slice(0, at);
      this.held = "";
      if (out) this.shown = true;
      return out;
    }
    const out = this.held;
    this.held = "";
    if (out) this.shown = true;
    return out;
  }
}
