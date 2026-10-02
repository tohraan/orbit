"use client";

/* The one place a figure is rendered, so the currency switch applies
 * everywhere at once.
 *
 * §105 is the constraint that shapes this: never visually imply data that does
 * not exist, and never claim precision you do not have. So:
 *   - no amount at all renders "Funding not specified", quietly, not a blank
 *   - a currency outside the rate table keeps its own figure and does not get
 *     a converted twin
 *   - a converted figure from an indicative rate is prefixed with "≈", and the
 *     USD peg is not, because 3.6725 is exact
 */

import s from "./opportunity.module.css";
import { RATES_AS_OF, formatAed, formatMoney, isExact, supports, toAed } from "@rof/core";
import type { Money as MoneyValue } from "@rof/core";
import { useCurrency } from "@/lib/store";

export function Money({
  value,
  fallback = "Funding not specified",
  size = "md",
}: {
  value: MoneyValue | null;
  fallback?: string;
  size?: "sm" | "md";
}) {
  const { currency } = useCurrency();

  if (!value) {
    return <span className={`${s.moneyAlt}`}>{fallback}</span>;
  }

  const source = formatMoney(value);
  const dirhams = supports(value.currency) ? toAed(value.value, value.currency) : null;
  const exact = isExact(value.currency);

  /* The source currency IS dirhams: there is no conversion to show, and
   * showing "AED 7,345 ≈ AED 7,345" would be absurd. */
  if (dirhams != null && value.currency?.toUpperCase() === "AED") {
    return <span className={s.money}><span className={s.moneyMain}>{source}</span></span>;
  }

  const showAed = currency === "aed" && dirhams != null;
  const main = showAed ? `${exact ? "" : "≈ "}${formatAed(dirhams!)}` : source;
  const alt = dirhams == null ? null : showAed ? source : `${exact ? "" : "≈ "}${formatAed(dirhams)}`;

  return (
    <span
      className={s.money}
      title={
        dirhams == null
          ? `${value.currency ?? "Amount"} is not in the conversion table`
          : exact
            ? "The dirham is pegged to the US dollar at 3.6725"
            : `Indicative rate, ${RATES_AS_OF}`
      }
    >
      <span className={s.moneyMain} style={size === "sm" ? { fontSize: "var(--text-body-sm)" } : undefined}>
        {main}
      </span>
      {alt ? <span className={s.moneyAlt}>{alt}</span> : null}
    </span>
  );
}
