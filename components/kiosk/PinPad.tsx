"use client";

import { useState, useCallback, useEffect } from "react";
import { Delete } from "lucide-react";
import { Button } from "@/components/ui/button";

const PIN_LENGTH = 4;
const RESULT_CLEAR_MS = 6000;
const IDLE_CLEAR_MS = 12000;

type Phase =
  | { name: "entering" }
  | { name: "loading" }
  | { name: "confirming"; studentName: string; action: "checkin" | "checkout" }
  | { name: "actioning"; studentName: string; action: "checkin" | "checkout" }
  | { name: "result"; success: boolean; message: string };

export default function PinPad() {
  const [pin, setPin] = useState("");
  const [phase, setPhase] = useState<Phase>({ name: "entering" });
  const [idleTimer, setIdleTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const resetToEntering = useCallback(() => {
    setPin("");
    setPhase({ name: "entering" });
  }, []);

  const resetIdle = useCallback(() => {
    setIdleTimer((prev) => {
      if (prev) clearTimeout(prev);
      return setTimeout(resetToEntering, IDLE_CLEAR_MS);
    });
  }, [resetToEntering]);

  useEffect(() => {
    return () => {
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [idleTimer]);

  const lookup = useCallback(async (enteredPin: string) => {
    setPhase({ name: "loading" });
    try {
      const res = await fetch("/api/kiosk/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: enteredPin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhase({ name: "result", success: false, message: data.message });
        setTimeout(resetToEntering, RESULT_CLEAR_MS);
      } else {
        setPhase({
          name: "confirming",
          studentName: data.studentName,
          action: data.action,
        });
        resetIdle();
      }
    } catch {
      setPhase({ name: "result", success: false, message: "Connection error. Try again." });
      setTimeout(resetToEntering, RESULT_CLEAR_MS);
    }
  }, [resetToEntering, resetIdle]);

  const pressDigit = useCallback(
    (d: string) => {
      if (phase.name !== "entering") return;
      const next = pin + d;
      setPin(next);
      resetIdle();
      if (next.length === PIN_LENGTH) {
        lookup(next);
      }
    },
    [pin, phase, lookup, resetIdle]
  );

  const backspace = useCallback(() => {
    if (phase.name !== "entering") return;
    setPin((p) => p.slice(0, -1));
    resetIdle();
  }, [phase, resetIdle]);

  const confirm = useCallback(async () => {
    if (phase.name !== "confirming") return;
    const { action, studentName } = phase;
    setPhase({ name: "actioning", studentName, action });

    try {
      const res = await fetch(`/api/kiosk/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      setPhase({ name: "result", success: res.ok, message: data.message });
      setTimeout(resetToEntering, RESULT_CLEAR_MS);
    } catch {
      setPhase({ name: "result", success: false, message: "Connection error. Try again." });
      setTimeout(resetToEntering, RESULT_CLEAR_MS);
    }
  }, [phase, pin, resetToEntering]);

  // ── Confirmation screen ───────────────────────────────────
  if (phase.name === "confirming" || phase.name === "actioning") {
    const isCheckout = phase.action === "checkout";
    const busy = phase.name === "actioning";
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-xs">
        <div className="text-center space-y-1">
          <p className="text-2xl font-bold">{phase.studentName}</p>
          <p className="text-muted-foreground">
            {isCheckout
              ? "You're currently checked in."
              : "You're not checked in yet."}
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full">
          <Button
            size="lg"
            className={`h-14 text-lg rounded-2xl ${
              isCheckout
                ? "bg-orange-500 hover:bg-orange-600 text-white"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"
            }`}
            onClick={confirm}
            disabled={busy}
          >
            {busy ? "…" : isCheckout ? "Check Out" : "Check In"}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-14 text-lg rounded-2xl border-2"
            onClick={resetToEntering}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ── Result screen ─────────────────────────────────────────
  if (phase.name === "result") {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-4 p-8 rounded-2xl min-h-48 w-full max-w-xs text-center ${
          phase.success
            ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
            : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
        }`}
      >
        <div className="text-5xl">{phase.success ? "✓" : "✗"}</div>
        <p className="text-lg font-medium leading-snug whitespace-pre-line">{phase.message}</p>
      </div>
    );
  }

  // ── PIN entry screen ──────────────────────────────────────
  const isLoading = phase.name === "loading";

  const dots = Array.from({ length: PIN_LENGTH }, (_, i) => (
    <div
      key={i}
      className={`w-5 h-5 rounded-full border-2 transition-all duration-150 ${
        i < pin.length
          ? "bg-foreground border-foreground"
          : "bg-transparent border-muted-foreground/40"
      }`}
    />
  ));

  const digitRows = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["", "0", "⌫"],
  ];

  return (
    <div className={`flex flex-col items-center gap-6 transition-opacity ${isLoading ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="flex gap-4 h-8 items-center">{dots}</div>
      <div className="grid grid-cols-3 gap-3">
        {digitRows.flat().map((key, idx) => {
          if (key === "") return <div key={idx} />;
          if (key === "⌫")
            return (
              <button
                key={idx}
                onClick={backspace}
                disabled={pin.length === 0}
                className="flex items-center justify-center w-20 h-20 rounded-2xl text-xl font-semibold bg-muted hover:bg-muted/70 disabled:opacity-30 active:scale-95 transition-all border-2 border-white/30"
              >
                <Delete className="w-5 h-5" />
              </button>
            );
          return (
            <button
              key={idx}
              onClick={() => pressDigit(key)}
              className="flex items-center justify-center w-20 h-20 rounded-2xl text-2xl font-semibold bg-muted hover:bg-muted/70 active:scale-95 transition-all select-none border-2 border-white/30"
            >
              {key}
            </button>
          );
        })}
      </div>
    </div>
  );
}
