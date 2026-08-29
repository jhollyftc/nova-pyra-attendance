"use client";

import { useState, useEffect, useRef } from "react";
import { toDateTimeLocal } from "@/lib/buildDay";

type Entry = { name: string; role: string; checkInTime: string; attendanceId: string };

function clockLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Minutes the chosen check-out time would credit, or null if it is unusable. */
function creditedMinutes(checkInTime: string, checkOutTime: string): number | null {
  if (!checkOutTime) return null;
  const out = new Date(checkOutTime);
  if (Number.isNaN(out.getTime())) return null;
  return Math.round((out.getTime() - new Date(checkInTime).getTime()) / 60000);
}

function creditLabel(checkInTime: string, checkOutTime: string) {
  const mins = creditedMinutes(checkInTime, checkOutTime);
  if (mins === null) return "Enter a valid time.";
  if (mins <= 0) return "Check-out must be after check-in.";
  const h = Math.floor(mins / 60);
  return `Credits ${h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`}.`;
}

function elapsedLabel(checkInTime: string) {
  const totalMins = Math.floor((Date.now() - new Date(checkInTime).getTime()) / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function Group({
  label, entries, rowClass, timeClass, onCheckout,
}: {
  label: string;
  entries: Entry[];
  rowClass: string;
  timeClass: string;
  onCheckout: (e: Entry) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium px-1">{label}</p>
      {entries.map((s) => (
        <button
          type="button"
          key={s.attendanceId}
          onClick={() => onCheckout(s)}
          className={`flex items-center justify-between px-4 py-2.5 rounded-xl transition-colors w-full text-left ${rowClass}`}
        >
          <span className="font-medium">{s.name}</span>
          <span className={`text-sm tabular-nums ${timeClass}`}>{elapsedLabel(s.checkInTime)}</span>
        </button>
      ))}
    </div>
  );
}

type DialogState =
  | { open: false }
  | {
      open: true;
      entry: Entry;
      password: string;
      checkOutTime: string;
      submitting: boolean;
      error: string | null;
    };

export default function CheckedIn({ refreshKey }: { refreshKey?: number }) {
  const [students, setStudents] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DialogState>({ open: false });
  const passwordRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [refreshKey]);

  const openDialog = (entry: Entry) => {
    // Prefilled with now; editable because an open record usually means the
    // member left without tapping out.
    setDialog({
      open: true,
      entry,
      password: "",
      checkOutTime: toDateTimeLocal(new Date()),
      submitting: false,
      error: null,
    });
    setTimeout(() => passwordRef.current?.focus(), 50);
  };

  const closeDialog = () => setDialog({ open: false });

  const handleCheckout = async () => {
    if (!dialog.open) return;
    // Reachable by Enter in the password field, which bypasses the disabled
    // button, so the time is re-checked here before it is formatted.
    const mins = creditedMinutes(dialog.entry.checkInTime, dialog.checkOutTime);
    if (mins === null || mins <= 0) {
      setDialog({ ...dialog, error: creditLabel(dialog.entry.checkInTime, dialog.checkOutTime) });
      return;
    }
    setDialog({ ...dialog, submitting: true, error: null });

    const res = await fetch("/api/kiosk/admin-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attendanceId: dialog.entry.attendanceId,
        password: dialog.password,
        checkOutTime: new Date(dialog.checkOutTime).toISOString(),
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setDialog({ ...dialog, submitting: false, error: data.message });
    } else {
      closeDialog();
      load();
    }
  };

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
        <div className="flex flex-col gap-3">
          <Group
            label="Adults"
            entries={students.filter((s) => s.role !== "Student")}
            rowClass="bg-[#E6E6E6]/30 text-[#E6E6E6] hover:bg-[#E6E6E6]/40"
            timeClass="text-[#E6E6E6]/65"
            onCheckout={openDialog}
          />
          <Group
            label="Students"
            entries={students.filter((s) => s.role === "Student")}
            rowClass="bg-[#1173F1]/35 text-white hover:bg-[#1173F1]/45"
            timeClass="text-blue-200/80"
            onCheckout={openDialog}
          />
        </div>
      )}

      {/* Admin checkout dialog */}
      {dialog.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="bg-background border border-border rounded-2xl p-6 w-full max-w-xs shadow-xl space-y-4">
            <div>
              <p className="text-lg font-bold">Check out {dialog.entry.name}?</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Checked in at {clockLabel(dialog.entry.checkInTime)}.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
                Check-out time
              </label>
              <input
                type="datetime-local"
                value={dialog.checkOutTime}
                min={toDateTimeLocal(new Date(dialog.entry.checkInTime))}
                onChange={(e) => setDialog({ ...dialog, checkOutTime: e.target.value, error: null })}
                onKeyDown={(e) => { if (e.key === "Escape") closeDialog(); }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                disabled={dialog.submitting}
              />
              <p className="text-xs text-muted-foreground">
                {creditLabel(dialog.entry.checkInTime, dialog.checkOutTime)}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
                Admin password
              </label>
              <input
                ref={passwordRef}
                type="password"
                placeholder="Admin password"
                value={dialog.password}
                onChange={(e) => setDialog({ ...dialog, password: e.target.value, error: null })}
                onKeyDown={(e) => { if (e.key === "Enter") handleCheckout(); if (e.key === "Escape") closeDialog(); }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                disabled={dialog.submitting}
              />
            </div>

            {dialog.error && (
              <p className="text-sm text-red-400">{dialog.error}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeDialog}
                disabled={dialog.submitting}
                className="flex-1 h-9 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCheckout}
                disabled={
                  dialog.submitting ||
                  !dialog.password ||
                  (creditedMinutes(dialog.entry.checkInTime, dialog.checkOutTime) ?? 0) <= 0
                }
                className="flex-1 h-9 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {dialog.submitting ? "…" : "Check Out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
