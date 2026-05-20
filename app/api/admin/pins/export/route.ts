import { NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { cookies } from "next/headers";

export async function GET() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token || !await verifyToken(token)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT display_name, first_name, last_name, role, pin
       FROM students
       WHERE active_status = 1
       ORDER BY role ASC, COALESCE(display_name, first_name || ' ' || last_name) ASC`
    )
    .all() as {
      display_name: string | null;
      first_name: string;
      last_name: string;
      role: string | null;
      pin: string | null;
    }[];

  const lines = [
    ["Name", "Member Type", "PIN"],
    ...rows.map((r) => [
      r.display_name ?? `${r.first_name} ${r.last_name}`,
      r.role ?? "",
      r.pin ?? "(not set)",
    ]),
  ];

  const csv = lines.map((row) => row.map((v) => `"${v}"`).join(",")).join("\r\n");
  const date = new Date().toISOString().split("T")[0];

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="nova-pyra-pins-${date}.csv"`,
    },
  });
}
