"use client";

/* §81: one Save implementation and one Compare implementation for the whole
 * app, so the icon, the state and the behaviour cannot drift between Explore,
 * Saved, the detail page and the deadline list. */

import s from "../ui/ui.module.css";
import { Icon } from "../ui/Icon";
import { useToast } from "../feedback/Toast";
import { Select } from "../ui/Field";
import { MAX_COMPARE, STATUSES, STATUS_LABELS, useCompare, useSaved, useTracker, type Status } from "@/lib/store";

/* §78: the saved state is a FILLED bookmark — a state change, not a second
 * icon style (§59). aria-pressed carries the same information for anyone not
 * looking at the glyph (§108). */
export function SaveButton({
  id,
  title,
  labelled,
}: {
  id: number;
  title?: string;
  labelled?: boolean;
}) {
  const { isSaved, toggle, ready } = useSaved();
  const toast = useToast();
  const on = isSaved(id);

  const click = () => {
    const added = toggle(id);
    toast(added ? "Opportunity saved" : "Removed from saved opportunities");
  };

  if (labelled) {
    return (
      <button
        type="button"
        className={[s.btn, s.secondary, s.sm].join(" ")}
        aria-pressed={on}
        onClick={click}
        disabled={!ready}
      >
        <Icon name={on ? "bookmark-filled" : "bookmark"} size={15} />
        {on ? "Saved" : "Save"}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={[s.btn, s.ghost, s.iconOnly].join(" ")}
      aria-pressed={on}
      aria-label={on ? `Remove ${title ?? "this opportunity"} from saved` : `Save ${title ?? "this opportunity"}`}
      title={on ? "Saved" : "Save"}
      onClick={click}
      disabled={!ready}
      style={on ? { color: "var(--ink-saved)" } : undefined}
    >
      <Icon name={on ? "bookmark-filled" : "bookmark"} size={17} />
    </button>
  );
}

/* §37: every card carries a visible Compare control, the card picks up a
 * stronger border when selected, and the count lives in the tray. The limit is
 * two; useCompare() displaces the oldest rather than refusing the click, and
 * the toast says which one went. */
export function CompareButton({ id, title }: { id: number; title?: string }) {
  const { isCompared, toggle, ready } = useCompare();
  const toast = useToast();
  const on = isCompared(id);

  return (
    <button
      type="button"
      className={[s.btn, on ? s.primary : s.secondary, s.sm].join(" ")}
      aria-pressed={on}
      aria-label={on ? `Remove ${title ?? "this opportunity"} from comparison` : `Compare ${title ?? "this opportunity"}`}
      onClick={() => {
        const r = toggle(id);
        if (!r.added) toast("Removed from comparison");
        else if (r.displaced) toast(`Added to comparison — only ${MAX_COMPARE} fit, so the first one came out`);
        else toast("Added to comparison");
      }}
      disabled={!ready}
    >
      <Icon name={on ? "check" : "compare"} size={15} />
      {on ? "Comparing" : "Compare"}
    </button>
  );
}

/* §53: the status model, and §53 again — the status is visually secondary to
 * the opportunity. So this is a plain select, not six coloured buttons. */
export function TrackControl({ id }: { id: number }) {
  const { statusOf, set, remove, ready } = useTracker();
  const toast = useToast();
  const current = statusOf(id);

  return (
    <span style={{ minWidth: 150, display: "inline-block" }}>
      <Select
        size="sm"
        value={current ?? ""}
        ariaLabel="Application status"
        options={[
          { value: "", label: "Not tracked" },
          ...STATUSES.map((st) => ({ value: st, label: STATUS_LABELS[st] })),
        ]}
        onChange={(v) => {
          if (!v) {
            remove(id);
            toast("Removed from applications");
          } else {
            set(id, v as Status);
            toast("Application status updated");
          }
        }}
      />
    </span>
  );
}
