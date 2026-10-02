"use client";

/* What stands in for the listing's detail panels when nobody is signed in.
 *
 * The design rule here is honesty about the trade, in both directions. It
 * names the sections this listing ACTUALLY has — checked against the record,
 * not a generic list — so a student is never signed up for eligibility criteria
 * that were never scraped. And it keeps the official source link in the open,
 * because the information belongs to the publisher and gating someone away
 * from a public page we did not write would be indefensible.
 */

import s from "../../app/opportunity/detail.module.css";
import g from "./detailgate.module.css";
import { Icon, type IconName } from "../ui/Icon";
import { ExternalButton } from "../ui/Button";
import { useGate } from "@/lib/gate";

export function DetailGate({
  hasEligibility,
  hasBenefits,
  hasHowTo,
  hasDocuments,
  applyHref,
}: {
  hasEligibility: boolean;
  hasBenefits: boolean;
  hasHowTo: boolean;
  hasDocuments: boolean;
  applyHref: string;
}) {
  const gate = useGate();

  const rows: { icon: IconName; label: string; blurb: string }[] = [];
  if (hasEligibility)
    rows.push({ icon: "check", label: "Eligibility", blurb: "Who can apply, with the figures lifted out of the prose" });
  if (hasBenefits)
    rows.push({ icon: "coins", label: "What it covers", blurb: "Tuition, stipend, travel — whatever the source stated" });
  if (hasHowTo) rows.push({ icon: "arrow-right", label: "How to apply", blurb: "The steps, in order" });
  if (hasDocuments)
    rows.push({ icon: "upload", label: "Documents needed", blurb: "What to have ready before you start" });

  return (
    <section className={s.panel}>
      <div className={g.head}>
        <span className={g.mark} aria-hidden="true">
          <Icon name="user" size={18} />
        </span>
        <div>
          <h2 className={s.panelTitle}>Sign in to read the full listing</h2>
          <p className="t-body-sm c-secondary">
            Free, and it takes a minute with your campus email.
          </p>
        </div>
      </div>

      {rows.length ? (
        <>
          <p className="t-meta c-muted">This listing has:</p>
          <ul className={g.list}>
            {rows.map((r) => (
              <li className={g.row} key={r.label}>
                <span className={g.rowIcon} aria-hidden="true">
                  <Icon name={r.icon} size={14} />
                </span>
                <span className={g.rowBody}>
                  <span className={g.rowLabel}>{r.label}</span>
                  <span className={g.rowBlurb}>{r.blurb}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        /* Nothing was scraped beyond the summary. Saying so is better than
           implying there is a reward behind the gate that does not exist. */
        <p className="t-body-sm c-secondary">
          Only a summary was captured for this one — the official page has the rest either way.
        </p>
      )}

      <div className={g.actions}>
        <button type="button" className={g.primary} onClick={() => gate.open("detail")}>
          Sign in
        </button>
        {/* The source is public. Gating a student away from someone else's
            page would be dishonest, so this stays available to everyone. */}
        <ExternalButton href={applyHref} variant="secondary">
          Open the official listing
        </ExternalButton>
      </div>
    </section>
  );
}
