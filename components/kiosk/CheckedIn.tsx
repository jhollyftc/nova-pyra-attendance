"use client";

import { useState, useEffect } from "react";

type Entry = { name: string; checkInTime: string };

export default function CheckedIn({ refreshKey }: { refreshKey?: number }) {
  const [students, setStudents] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/kiosk/checked-in");
        if (res.ok) {
          const data = await res.json();
          setStudents(data.students ?? []);
        }
      } finally {
        setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [refreshKey]);

  return (
    <div className="flex flex-col gap-3 w-full max-w-xs">
      <div className="text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
          Currently
        </p>
        <h2 className="text-lg font-bold tracking-wide">Checked In</h2>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm text-center py-4">Loading…</p>
      ) : students.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-4">No one checked in</p>
      ) : (
        <div className="flex flex-col gap-2">
          {students.map((s) => {
            const sinceMs = Date.now() - new Date(s.checkInTime).getTime();
            const totalMins = Math.floor(sinceMs / 60000);
            const hours = Math.floor(totalMins / 60);
            const mins = totalMins % 60;
            const duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
            return (
              <div
                key={s.name}
                className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-emerald-600/20 text-emerald-300"
              >
                <span className="font-medium">{s.name}</span>
                <span className="text-sm tabular-nums text-emerald-400/80">{duration}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
