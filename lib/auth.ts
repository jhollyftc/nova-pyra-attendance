import { SignJWT, jwtVerify } from "jose";

export const COOKIE_NAME = "admin_session";

function secret() {
  return new TextEncoder().encode(
    process.env.SESSION_SECRET ?? "fallback-dev-secret-set-SESSION_SECRET-in-env"
  );
}

export async function signSession(): Promise<string> {
  return new SignJWT({ admin: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
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
