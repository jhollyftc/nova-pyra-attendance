"use client";

import { useState, useEffect } from "react";

type Entry = { name: string; hours: number };

// 3-stop gradient: silver → #1173F1 → #0A4FB3
const SILVER:    [number, number, number] = [230, 230, 230];
const MID_BLUE:  [number, number, number] = [17,  115, 241];
const DARK_BLUE: [number, number, number] = [10,   79, 179];
const NAVY_TEXT: [number, number, number] = [7,    50, 106];
const WHITE:     [number, number, number] = [255, 255, 255];

function lerp(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function bgLuminance(rgb: [number, number, number]): number {
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

function gradientStyle(index: number, total: number): React.CSSProperties {
  const t = total > 1 ? index / (total - 1) : 0;
  const half = t <= 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const bg   = t <= 0.5 ? lerp(SILVER, MID_BLUE, half) : lerp(MID_BLUE, DARK_BLUE, half);
  // Pick whichever text color gives higher contrast against this background
  const lum  = bgLuminance(bg);
  const text = lum > 0.4 ? NAVY_TEXT : WHITE;
  return {
    backgroundColor: `rgb(${bg[0]},${bg[1]},${bg[2]})`,
    color: `rgb(${text[0]},${text[1]},${text[2]})`,
  };
}

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
              style={gradientStyle(i, students.length)}
              className="flex items-center justify-between px-4 py-2.5 rounded-xl"
            >
              <span className="flex items-center gap-2.5">
                <span className="text-sm font-bold w-5 text-center opacity-70">{i + 1}</span>
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
