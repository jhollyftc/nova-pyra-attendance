/**
 * Build-day arithmetic: when one attendance day ends and the next begins.
 *
 * Kept free of database imports so the boundary rules can be exercised
 * directly, including the hours around the cutover and across DST.
 */

/**
 * Hour (local time) at which one build day ends and the next begins.
 *
 * Not midnight: a build night that runs past 12 AM belongs to the day it
 * started on, so splitting at midnight would cut a real session in two and
 * leave a stray few-minute session on the following day's report.
 */
export const DAY_BOUNDARY_HOUR = 4;

/** Local YYYY-MM-DD. Deliberately not `toISOString()`, which yields the UTC date. */
export function localDateStr(d: Date): string {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

/** The build day a moment belongs to. Anything before the boundary counts as the previous day. */
export function buildDate(now: Date = new Date()): string {
  const d = new Date(now);
  if (d.getHours() < DAY_BOUNDARY_HOUR) d.setDate(d.getDate() - 1);
  return localDateStr(d);
}

/** The instant a build day ends: the boundary hour on the following calendar day. */
export function buildDayEnd(sessionDate: string): Date {
  const [y, m, d] = sessionDate.split("-").map(Number);
  // Day overflow (e.g. Jan 32) is normalised by the Date constructor.
  return new Date(y, m - 1, d + 1, DAY_BOUNDARY_HOUR, 0, 0, 0);
}

/** Human-readable default name for a build day's session. */
export function sessionNameFor(sessionDate: string): string {
  const [y, m, d] = sessionDate.split("-").map(Number);
  return (
    "Build Session — " +
    new Date(y, m - 1, d).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
  );
}

/** Formats a moment for an `<input type="datetime-local">`, which expects local time. */
export function toDateTimeLocal(d: Date): string {
  return (
    localDateStr(d) +
    "T" +
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
}
