import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "bagelito_admin";
const TOKEN_SUBJECT = "bagelito-admin-session";

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || "";
}

export function getAdminCookieName() {
  return COOKIE_NAME;
}

export function createAdminToken() {
  const password = getAdminPassword();
  if (!password) return "";
  return createHmac("sha256", password).update(TOKEN_SUBJECT).digest("hex");
}

export function verifyAdminPassword(input: string) {
  const password = getAdminPassword();
  if (!password || !input) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(password);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function requireAdmin() {
  const password = getAdminPassword();
  if (!password) redirect("/admin/login?error=missing-password");

  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value ?? "";
  const expected = createAdminToken();

  if (!value || value !== expected) redirect("/admin/login");
}
