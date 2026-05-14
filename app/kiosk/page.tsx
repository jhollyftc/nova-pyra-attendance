"use client";

import PinPad from "@/components/kiosk/PinPad";

export default function KioskPage() {
  const teamName = process.env.NEXT_PUBLIC_TEAM_NAME ?? "Nova Pyra";

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
      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-8">
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
    </main>
  );
}
