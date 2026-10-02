"use client";

/* A single-event .ics for one deadline.
 *
 * The off-by-one that this kind of code always has: an all-day VEVENT's DTEND
 * is EXCLUSIVE, so it must be the day AFTER the deadline, and both dates have
 * to be built from local calendar components. Using toISOString() converts
 * local midnight to UTC and hands back the previous day for every viewer east
 * of Greenwich — which is every intended viewer, since the campus is in Dubai.
 */

function stamp(iso: string, addDays = 0): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + addDays);
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  return `${d.getFullYear()}${mm < 10 ? "0" : ""}${mm}${dd < 10 ? "0" : ""}${dd}`;
}

/* RFC 5545: escape the delimiters, and fold lines at 75 octets. Most readers
 * tolerate long lines; Outlook is the one that does not. */
const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (line: string): string =>
  line.length <= 75 ? line : line.slice(0, 75) + "\r\n " + fold(line.slice(75)).replace(/^ /, "");

export function deadlineIcs(o: {
  id: number;
  title: string;
  deadline: string | null;
  url: string;
  sourceName: string;
}): string | null {
  if (!o.deadline) return null;
  const now = new Date();
  const utc = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}T${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}Z`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Orbit//BITS Pilani Dubai//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:orbit-${o.id}@bits-dubai`,
    `DTSTAMP:${utc}`,
    `DTSTART;VALUE=DATE:${stamp(o.deadline)}`,
    /* Exclusive end, hence +1. */
    `DTEND;VALUE=DATE:${stamp(o.deadline, 1)}`,
    fold(`SUMMARY:${esc(`Deadline — ${o.title}`)}`),
    fold(`DESCRIPTION:${esc(`Closes today. Published by ${o.sourceName}.\n${o.url}`)}`),
    fold(`URL:${esc(o.url)}`),
    "BEGIN:VALARM",
    "TRIGGER:-P3D",
    "ACTION:DISPLAY",
    "DESCRIPTION:Closes in 3 days",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Hands the file to the browser. No network, no server round trip. */
export function downloadIcs(o: Parameters<typeof deadlineIcs>[0]): boolean {
  const body = deadlineIcs(o);
  if (!body) return false;
  const blob = new Blob([body], { type: "text/calendar;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${o.title.replace(/[^\w\s-]/g, "").trim().slice(0, 60) || "deadline"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  /* Revoke on the next tick: revoking synchronously races the download in
   * Safari. */
  setTimeout(() => URL.revokeObjectURL(href), 0);
  return true;
}
