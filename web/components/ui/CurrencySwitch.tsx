"use client";

/* The switch button the whole app's money reads from. Two states, not a
 * currency picker: a figure is shown either as the source stated it or
 * converted to dirhams, and §105 forbids implying a precision the rate
 * table does not have — hence the title text rather than four decimals. */

import s from "./currency.module.css";
import { RATES_AS_OF } from "@rof/core";
import { useCurrency } from "@/lib/data";

export function CurrencySwitch() {
  const { currency, setCurrency } = useCurrency();
  return (
    <div
      className={s.group}
      role="group"
      aria-label="Show amounts in"
      title={`Dirham conversions use the USD peg (3.6725) and indicative rates from ${RATES_AS_OF}`}
    >
      <button
        type="button"
        className={[s.opt, currency === "source" ? s.optActive : null].filter(Boolean).join(" ")}
        aria-pressed={currency === "source"}
        onClick={() => setCurrency("source")}
      >
        Source
      </button>
      <button
        type="button"
        className={[s.opt, currency === "aed" ? s.optActive : null].filter(Boolean).join(" ")}
        aria-pressed={currency === "aed"}
        onClick={() => setCurrency("aed")}
      >
        AED
      </button>
    </div>
  );
}
