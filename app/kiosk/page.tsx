"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import PinPad from "@/components/kiosk/PinPad";
import Leaderboard from "@/components/kiosk/Leaderboard";

export default function KioskPage() {
  const teamName = process.env.NEXT_PUBLIC_TEAM_NAME ?? "Nova Pyra";
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center bg-background p-6 overflow-hidden">
      <img
        src="/Logo_Animated_Loop.gif"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none select-none"
      />

      {/* Leaderboard toggle */}
      <button
        type="button"
        onClick={() => setShowLeaderboard((v) => !v)}
        className={`absolute top-5 right-5 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
          showLeaderboard
            ? "bg-[#1173F1] text-white"
            : "bg-muted text-muted-foreground hover:text-foreground"
        }`}
        aria-label="Toggle leaderboard"
      >
        <Trophy className="w-4 h-4" />
        <span>Leaders</span>
      </button>

      {/* Main content */}
      <div
        className={`relative z-10 w-full flex items-center justify-center gap-12 transition-all duration-300 ${
          showLeaderboard ? "max-w-3xl" : "max-w-sm"
        }`}
      >
        {/* Leaderboard panel */}
        {showLeaderboard && (
          <div className="flex-1">
            <Leaderboard />
          </div>
        )}

        {/* PIN pad */}
        <div className="flex flex-col items-center gap-8 w-full max-w-sm shrink-0">
          <div className="text-center">
            <h1 className="text-6xl font-bold tracking-tight">{teamName}</h1>
            <p className="mt-2 text-muted-foreground text-2xl">{today}</p>
          </div>

          <div className="flex flex-col items-center gap-3 w-full">
            <PinPad />
          </div>

          <a
            href="/admin"
            className="text-lg text-muted-foreground/60 hover:text-muted-foreground transition-colors mt-4"
          >
            Admin
          </a>
        </div>
      </div>
    </main>
  );
}
