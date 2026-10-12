import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hasStrongAdminPassword } from "./login-security";

export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;
export function isAdminSessionConfigured(password: string | undefined, secret: string | undefined): boolean {
  return hasStrongAdminPassword(password) && typeof secret === "string"
    && secret.trim().length >= 32 && secret.length <= 1024 && secret !== password;
}
function signature(body: string, password: string, secret: string, audience: string) {
  // Independent server secret prevents testing password guesses via forged
  // session cookies. Password rotation also invalidates existing sessions.
  const key = createHmac("sha256", secret).update(password).digest();
  return createHmac("sha256", key).update(`bagelito-admin:${audience}:${body}`).digest("base64url");
}
export function issueAdminSession(password: string | undefined, secret: string | undefined, audience: string, now = Date.now()): string {
  if (!isAdminSessionConfigured(password, secret) || !audience) return "";
  const issued = Math.floor(now / 1000);
  const body = `v1.${issued}.${issued + ADMIN_SESSION_SECONDS}.${randomBytes(24).toString("base64url")}`;
  return `${body}.${signature(body, password!, secret!, audience)}`;
}
export function verifyAdminSession(token: string, password: string | undefined, secret: string | undefined, audience: string, now = Date.now()): boolean {
  if (!isAdminSessionConfigured(password, secret) || !audience || token.length > 256) return false;
  const match = /^(v1\.([0-9]{10,11})\.([0-9]{10,11})\.[A-Za-z0-9_-]{32})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const issued = Number(match[2]);
  const expires = Number(match[3]);
  const seconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(issued) || !Number.isSafeInteger(expires) || issued > seconds
    || expires - issued !== ADMIN_SESSION_SECONDS || expires <= seconds) return false;
  const expected = Buffer.from(signature(match[1], password!, secret!, audience));
  const actual = Buffer.from(match[4]);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
