"use client";

import { useState, useEffect } from "react";

type Entry = { name: string; hours: number };

const MEDALS = ["🥇", "🥈", "🥉"];
const MEDAL_STYLES = [
  "bg-yellow-500/20 text-yellow-300",
  "bg-gray-400/15 text-gray-300",
  "bg-orange-700/20 text-orange-300",
];

export default function Leaderboard() {
  const [students, setStudents] = useState<Entry[]>([]);
  const [seasonName, setSeasonName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/kiosk/leaderboard");
        if (res.ok) {
          const data = await res.json();
          setStudents(data.students ?? []);
          setSeasonName(data.seasonName ?? "");
        }
      } finally {
        setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-3 w-full max-w-xs">
      <div className="text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
          {seasonName || "Season"}
        </p>
        <h2 className="text-lg font-bold tracking-wide">Leaderboard</h2>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm text-center py-4">Loading…</p>
      ) : students.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-4">No hours logged yet</p>
      ) : (
        <div className="flex flex-col gap-2">
          {students.map((s, i) => (
            <div
              key={s.name}
              className={`flex items-center justify-between px-4 py-2.5 rounded-xl ${
                MEDAL_STYLES[i] ?? "bg-muted text-foreground"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className="text-lg w-6 text-center">
                  {MEDALS[i] ?? `${i + 1}`}
                </span>
                <span className="font-medium">{s.name}</span>
              </span>
              <span className="font-semibold tabular-nums text-sm">{s.hours}h</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
