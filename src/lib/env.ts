export function missingEnv(names: readonly string[]): string[] {
  return names.filter((name) => !process.env[name]);
}

export function getMissingReservationEnv(): string[] {
  return missingEnv([
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_YAPE_NUMBER",
    "NEXT_PUBLIC_PLIN_NUMBER",
    "NEXT_PUBLIC_PAYMENT_HOLDER",
  ]);
}

export function getMissingAdminEnv(): string[] {
  return missingEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_PASSWORD"]);
}

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://bagelito-pe.vercel.app";
}
