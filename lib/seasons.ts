export type SeasonInfo = {
  start: Date;
  name: string;
  type: "competition" | "summer";
};

/**
 * Returns the season that contains the given date.
 *
 * Competition season: August 1 – May 31
 *   e.g. Aug 2025 – May 2026 → "2025-26 Season"
 *
 * Summer season: June 1 – July 31
 *   e.g. Jun 2026 – Jul 2026 → "Summer 2026"
 */
export function getCurrentSeason(now = new Date()): SeasonInfo {
  const month = now.getMonth(); // 0 = Jan … 11 = Dec
  const year = now.getFullYear();

  if (month >= 5 && month <= 6) {
    // June–July → Summer season
    return {
      start: new Date(year, 5, 1),
      name: `Summer ${year}`,
      type: "summer",
    };
  }

  // August–May → Competition season
  const startYear = month >= 7 ? year : year - 1;
  const endYear = startYear + 1;
  return {
    start: new Date(startYear, 7, 1),
    name: `${startYear}-${String(endYear).slice(2)} Season`,
    type: "competition",
  };
}
