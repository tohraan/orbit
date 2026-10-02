/* Any currency -> AED.
 *
 * Why a hard-coded table and not a rates API: this app has no outbound budget,
 * a live rate would make every render non-deterministic, and the one rate that
 * actually matters is not a rate at all -- the dirham is PEGGED to the US
 * dollar at 3.6725, and has been since 1997. That figure is exact. Everything
 * else here is an indicative mid-market rate from the date below, and the UI
 * says so rather than implying four-decimal precision it does not have.
 *
 * The index currently carries USD (202 figures), GBP (63) and EUR (14). The
 * rest are here so a new source does not render a blank where a number was. */

export const AED_PER = {
  AED: 1,
  USD: 3.6725,
  EUR: 4.30,
  GBP: 4.95,
  CHF: 4.60,
  CAD: 2.70,
  AUD: 2.42,
  JPY: 0.0244,
  SEK: 0.385,
  NOK: 0.345,
  DKK: 0.576,
  SGD: 2.85,
  INR: 0.0415,
  CNY: 0.515,
  KRW: 0.00268,
  NZD: 2.21,
  ZAR: 0.205,
  PLN: 1.01,
  CZK: 0.172,
  HUF: 0.0110,
  TRY: 0.0855,
  HKD: 0.472,
} as const;

/** Rates whose value is a currency peg, not a market quote. */
export const EXACT: ReadonlySet<string> = new Set(["AED", "USD"]);

export const RATES_AS_OF = "2026-10-01";

export type Currency = keyof typeof AED_PER;

export function supports(code: string | null | undefined): code is Currency {
  return !!code && Object.prototype.hasOwnProperty.call(AED_PER, code.toUpperCase());
}

/** Value in dirhams, or null when the currency is not in the table. */
export function toAed(value: number, code: string | null | undefined): number | null {
  if (!Number.isFinite(value) || !supports(code)) return null;
  return value * AED_PER[code!.toUpperCase() as Currency];
}

/** Rounded the way money is read: whole dirhams above 1000, two places below. */
export function formatAed(value: number): string {
  const digits = value >= 1000 ? 0 : 2;
  return `AED ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits })}`;
}

/** True when the number shown is a peg rather than a quote -- the UI hedges the rest. */
export function isExact(code: string | null | undefined): boolean {
  return !!code && EXACT.has(code.toUpperCase());
}
