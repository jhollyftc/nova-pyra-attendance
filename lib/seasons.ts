/** Earliest year to include in the season history list. */
export const TEAM_FOUNDING_YEAR = 2024;

export type SeasonInfo = {
  start: Date;
  end: Date;
  name: string;
  type: "competition" | "summer";
};

/**
 * Returns the season containing the given date.
 * Competition: Aug 1 – May 31. Summer: Jun 1 – Jul 31.
 */
export function getCurrentSeason(now = new Date()): SeasonInfo {
  const month = now.getMonth();
  const year = now.getFullYear();

  if (month >= 5 && month <= 6) {
    return {
      start: new Date(year, 5, 1),
      end: new Date(year, 6, 31, 23, 59, 59, 999),
      name: `Summer ${year}`,
      type: "summer",
    };
  }

  const startYear = month >= 7 ? year : year - 1;
  const endYear = startYear + 1;
  return {
    start: new Date(startYear, 7, 1),
    end: new Date(endYear, 4, 31, 23, 59, 59, 999),
    name: `${startYear}-${String(endYear).slice(2)} Season`,
    type: "competition",
  };
}

/**
 * Returns every season from fromYear up to and including the current one,
 * ordered newest first.
 *
 * Seasons alternate: competition (Aug–May) then summer (Jun–Jul).
 */
export function getAllSeasons(fromYear = TEAM_FOUNDING_YEAR): SeasonInfo[] {
  const now = new Date();
  const result: SeasonInfo[] = [];

  for (let year = fromYear; ; year++) {
    // Competition season: Aug year – May year+1
    const compStart = new Date(year, 7, 1);
    if (compStart > now) break;
    result.push({
      start: compStart,
      end: new Date(year + 1, 4, 31, 23, 59, 59, 999),
      name: `${year}-${String(year + 1).slice(2)} Season`,
      type: "competition",
    });

    // Summer season: Jun year+1 – Jul year+1
    const sumStart = new Date(year + 1, 5, 1);
    if (sumStart > now) break;
    result.push({
      start: sumStart,
      end: new Date(year + 1, 6, 31, 23, 59, 59, 999),
      name: `Summer ${year + 1}`,
      type: "summer",
    });
  }

  return result.reverse(); // newest first
}
