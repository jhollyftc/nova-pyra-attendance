import { SignJWT, jwtVerify } from "jose";

export { COOKIE_NAME } from "@/lib/cookie";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set.");
  return new TextEncoder().encode(s);
}

export async function signSession(): Promise<string> {
  return new SignJWT({ viewer: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}
