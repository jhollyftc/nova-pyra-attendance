"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Delete, X, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

const PIN_LENGTH = 4;
const ERROR_CLEAR_MS = 500;
const RESULT_CLEAR_MS = 4000;
const IDLE_CLEAR_MS = 10000;

type Phase =
  | { name: "entering" }
  | { name: "loading" }
  | { name: "confirming"; studentName: string; action: "checkin" | "checkout" }
  | { name: "actioning"; studentName: string; action: "checkin" | "checkout" }
  | { name: "result"; success: boolean; action?: "checkin" | "checkout"; message: string; detail?: string; stats?: string };

export default function PinPad() {
  const [pin, setPin] = useState("");
  const [phase, setPhase] = useState<Phase>({ name: "entering" });
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterReleasedRef = useRef(true);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const resetToEntering = useCallback(() => {
    setPin("");
    setPhase({ name: "entering" });
  }, []);

  const clearIdle = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const resetIdle = useCallback(() => {
    clearIdle();
    idleTimerRef.current = setTimeout(resetToEntering, IDLE_CLEAR_MS);
  }, [resetToEntering, clearIdle]);

  const playError = useCallback(() => {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(100, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(150, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
    }, []);

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
        clearIdle();
        playError();
        setPhase({ name: "result", success: false, message: data.message });
        setTimeout(resetToEntering, ERROR_CLEAR_MS);
      } else {
        setPhase({
          name: "confirming",
          studentName: data.studentName,
          action: data.action,
        });
        resetIdle();
      }
    } catch {
      clearIdle();
      setPhase({ name: "result", success: false, message: "Connection error. Try again." });
      setTimeout(resetToEntering, RESULT_CLEAR_MS);
    }
  }, [resetToEntering, resetIdle, clearIdle, playError]);

const playClick = useCallback(() => {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 200;
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  }, []);

  const playSuccess = useCallback(() => {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(400, ctx.currentTime);
  osc.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
  osc.frequency.setValueAtTime(800, ctx.currentTime + 0.2);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.4);
}, []);

  const pressDigit = useCallback(
    (d: string) => {
      if (phase.name !== "entering") return;
      playClick();
      const next = pin + d;
      setPin(next);
      resetIdle();
      if (next.length === PIN_LENGTH) {
        lookup(next);
      }
    },
    [pin, phase, lookup, resetIdle, playClick]
  );

  const backspace = useCallback(() => {
    if (phase.name !== "entering") return;
    playClick();
    setPin((p) => p.slice(0, -1));
    resetIdle();
  }, [phase, resetIdle, playClick]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        pressDigit(e.key);
      } else if (e.code >= "Numpad0" && e.code <= "Numpad9") {
        pressDigit(e.key);
      } else if (e.key === "Backspace") {
        backspace();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pressDigit, backspace]);

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
      clearIdle();
      if (res.ok) playSuccess();
      setPhase({ name: "result", success: res.ok, action, message: data.message, detail: data.detail, stats: data.stats });
      if (!data.stats) {
        setTimeout(resetToEntering, RESULT_CLEAR_MS);
      }
    } catch {
      clearIdle();
      setPhase({ name: "result", success: false, message: "Connection error. Try again." });
      setTimeout(resetToEntering, RESULT_CLEAR_MS);
    }
  }, [phase, pin, resetToEntering, clearIdle, playSuccess]);

    useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && phase.name === "confirming") {
        enterReleasedRef.current = false;
        confirm();
      } else if (e.key === "Enter" && phase.name === "result" && phase.stats && enterReleasedRef.current) {
        resetToEntering();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Enter") enterReleasedRef.current = true;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [phase, confirm, resetToEntering]);

  // ── Confirmation screen ───────────────────────────────────
  if (phase.name === "confirming" || phase.name === "actioning") {
    const isCheckout = phase.action === "checkout";
    const busy = phase.name === "actioning";
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-xs">
        <div className="text-center space-y-1">
          <p className="text-4xl font-bold">{phase.studentName}</p>
          <p className="text-muted-foreground">
            {isCheckout
              ? "You're currently checked in."
              : "You're not checked in yet."}
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full">
          <Button
            type="button"
            size="lg"
            className={`h-14 text-lg rounded-2xl ${
              isCheckout
                ? "bg-[#0A4FB3] hover:bg-[#07326A] text-white"
                : "bg-[#1173F1] hover:bg-[#0A4FB3] text-white"
            }`}
            onClick={confirm}
            disabled={busy}
          >
            {busy ? "…" : isCheckout ? "Check Out" : "Check In"}
          </Button>
          <Button
            type="button"
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
    const isCheckout = phase.success && phase.action === "checkout";
    return (
      <div className="relative w-full max-w-xs">
        {phase.stats && (
          <button
            type="button"
            onClick={resetToEntering}
            className={`absolute -top-3 -right-3 z-10 flex items-center justify-center w-8 h-8 rounded-full transition-all ${
              isCheckout
                ? "bg-[#07326A] hover:bg-[#07326A]/80 text-white"
                : "bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
            }`}
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <div
          className={`flex flex-col items-center justify-center gap-3 p-8 rounded-2xl min-h-48 w-full text-center ${
            !phase.success ? "bg-red-950 text-red-200"
            : phase.action === "checkin" ? "bg-emerald-600 text-white"
            : "bg-[#E6E6E6] text-[#07326A]"
          }`}
        >
          <div>
            {!phase.success ? (
              <span className="text-5xl">✗</span>
            ) : phase.action === "checkin" ? (
              <LogIn className="w-12 h-12" />
            ) : (
              <LogOut className="w-12 h-12" />
            )}
          </div>
          <p className="text-2xl font-bold leading-tight">{phase.message}</p>
          {phase.detail && (
            <p className={`text-lg ${isCheckout ? "text-[#07326A]/70" : "text-white/80"}`}>{phase.detail}</p>
          )}
          {phase.stats && (
            <p className={`text-base font-semibold ${isCheckout ? "text-[#07326A]" : "text-white/90"}`}>{phase.stats}</p>
          )}
        </div>
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
      <p className="text-lg text-muted-foreground uppercase tracking-widest font-medium">
        Enter PIN
      </p>
      <div className="flex gap-4 h-2 items-center">{dots}</div>
      <div className="grid grid-cols-3 gap-3">
        {digitRows.flat().map((key, idx) => {
          if (key === "") return <div key={idx} />;
          if (key === "⌫")
            return (
              <button
                type="button"
                key={idx}
                onClick={backspace}
                disabled={pin.length === 0}
                className="flex items-center justify-center w-20 h-20 rounded-2xl text-xl font-semibold bg-muted hover:bg-muted/70 disabled:opacity-30 active:bg-[#FF0000]/90 transition-all border-2 border-white/30"
              >
                <Delete className="w-5 h-5" />
              </button>
            );
          return (
            <button
              type="button"
              key={idx}
              onClick={() => pressDigit(key)}
              className="flex items-center justify-center w-20 h-20 rounded-2xl text-2xl font-semibold bg-muted hover:bg-muted/70 active:bg-[#0088FF]/90 transition-all select-none border-2 border-white/30"
            >
              {key}
            </button>
          );
        })}
      </div>
    </div>
  );
}
