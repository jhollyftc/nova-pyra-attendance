"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Calendar,
  ClipboardList,
  BarChart3,
  LogOut,
} from "lucide-react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/students", label: "Students", icon: Users },
  { href: "/admin/sessions", label: "Sessions", icon: Calendar },
  { href: "/admin/attendance", label: "Attendance", icon: ClipboardList },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/kiosk");
    router.refresh();
  };

  return (
    <nav className="w-full md:w-56 bg-muted/40 border-b md:border-b-0 md:border-r flex flex-row md:flex-col p-3 md:p-4 gap-1 md:gap-1 shrink-0">
      <div className="hidden md:block px-2 py-1 mb-2">
        <span className="text-sm font-semibold text-muted-foreground">
          Nova Pyra Admin
        </span>
      </div>
      <div className="flex flex-row md:flex-col flex-1 gap-1 overflow-x-auto md:overflow-visible">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
              pathname === href
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline">{label}</span>
          </Link>
        ))}
      </div>
      <button
        onClick={handleLogout}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap"
      >
        <LogOut className="w-4 h-4 shrink-0" />
        <span className="hidden md:inline">Log Out</span>
      </button>
    </nav>
  );
}
