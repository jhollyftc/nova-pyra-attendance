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
  const existing = new Set(
    (db.prepare("SELECT pin FROM students WHERE pin IS NOT NULL").all() as { pin: string }[])
      .map((r) => r.pin)
  );

  let pin: string;
  let attempts = 0;
  do {
    pin = String(Math.floor(1000 + Math.random() * 9000));
    attempts++;
  } while (existing.has(pin) && attempts < 9000);

  if (existing.has(pin)) {
    return NextResponse.json({ message: "No available PINs." }, { status: 500 });
  }

  return NextResponse.json({ pin });
}
