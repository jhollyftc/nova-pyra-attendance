"use client";

import { useRouter } from "next/navigation";

export default function SeasonPicker({
  seasons,
  current,
}: {
  seasons: string[];
  current: string;
}) {
  const router = useRouter();
  return (
    <select
      value={current}
      onChange={(e) => router.push(`/?season=${encodeURIComponent(e.target.value)}`)}
      aria-label="Season"
    >
      {seasons.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}
