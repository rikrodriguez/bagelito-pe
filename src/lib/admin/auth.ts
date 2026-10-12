import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { hasStrongAdminPassword } from "./login-security";
import { issueAdminSession, verifyAdminSession, isAdminSessionConfigured } from "./session-security";

const COOKIE_NAME = "bagelito_admin";


function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || "";
}

export function getAdminCookieName() {
  return COOKIE_NAME;
}

export function createAdminToken() {
  return issueAdminSession(getAdminPassword(), process.env.ADMIN_SESSION_SECRET, process.env.NEXT_PUBLIC_SITE_URL ?? "");
}

export function verifyAdminPassword(input: string) {
  const password = getAdminPassword();
  if (!hasStrongAdminPassword(password) || !input || input.length > 1024) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(password);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function requireAdmin() {
  const password = getAdminPassword();
  if (!isAdminSessionConfigured(password, process.env.ADMIN_SESSION_SECRET)) redirect("/admin/login?error=unavailable");

  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value ?? "";
  if (!verifyAdminSession(value, password, process.env.ADMIN_SESSION_SECRET, process.env.NEXT_PUBLIC_SITE_URL ?? "")) redirect("/admin/login");
}
