export type PaymentProvider = "manual" | "culqi";
export type PaymentMode = "disabled" | "sandbox" | "live";

export type PaymentConfig = {
  mode: PaymentMode;
  enabled: boolean;
  provider: PaymentProvider;
  publicKey: string;
  rsaId: string;
  rsaPublicKey: string;
  hasSecretKey: boolean;
  currency: "PEN";
};

export type PublicPaymentConfig = {
  mode: PaymentMode;
  currency: "PEN";
  enabled: boolean;
  provider: PaymentProvider;
  publicKey: string;
  rsaId: string;
  rsaPublicKey: string;
};

function getConfiguredProvider(): PaymentProvider {
  return process.env.PAYMENT_PROVIDER === "culqi" ? "culqi" : "manual";
}

export function getPaymentConfig(): PaymentConfig {
  const provider = getConfiguredProvider();
  const publicKey = process.env.NEXT_PUBLIC_CULQI_PUBLIC_KEY?.trim() ?? "";
  const rsaId = process.env.NEXT_PUBLIC_CULQI_RSA_ID?.trim() ?? "";
  const rsaPublicKey = process.env.NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY?.trim() ?? "";
  const hasSecretKey = Boolean(process.env.CULQI_SECRET_KEY?.trim());
  const secretKey = process.env.CULQI_SECRET_KEY?.trim() ?? "";
  const mode: PaymentMode = process.env.CULQI_MODE === "sandbox"
    ? "sandbox"
    : process.env.CULQI_MODE === "live" ? "live" : "disabled";
  const matchingKeys = mode === "sandbox"
    ? publicKey.startsWith("pk_test_") && secretKey.startsWith("sk_test_")
    : mode === "live" && publicKey.startsWith("pk_live_") && secretKey.startsWith("sk_live_");
  let sandboxOriginAllowed = false;
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").hostname;
    const publicHosts = new Set(["bagelito.pe", "www.bagelito.pe", "bagelito-pe.vercel.app"]);
    sandboxOriginAllowed = !publicHosts.has(host) && (
      host === "localhost" || host === "127.0.0.1"
      || (process.env.VERCEL_ENV === "preview" && (
        host === process.env.VERCEL_URL || host === process.env.VERCEL_BRANCH_URL
      ))
    );
  } catch { /* Missing or invalid origins fail closed. */ }
  const modeAllowed = mode === "sandbox"
    ? process.env.VERCEL_ENV !== "production" && sandboxOriginAllowed
    : mode === "live" && process.env.CULQI_LIVE_APPROVED === "true";

  return {
    mode,
    enabled: provider === "culqi"
      && matchingKeys
      && modeAllowed
      && process.env.CULQI_ENABLED === "true"
      && Boolean(publicKey)
      && Boolean(rsaId)
      && Boolean(rsaPublicKey)
      && hasSecretKey,
    provider,
    publicKey,
    rsaId,
    rsaPublicKey,
    hasSecretKey,
    currency: "PEN",
  };
}

export function getPublicPaymentConfig(): PublicPaymentConfig {
  const {
    mode,
    currency,
    enabled,
    provider,
    publicKey,
    rsaId,
    rsaPublicKey,
  } = getPaymentConfig();

  return {
    mode,
    currency,
    // Closing intake must not turn off settlement or recovery for existing
    // server-owned sessions. Only the public checkout is a review preview.
    enabled: enabled && process.env.BAGELITO_MERCHANT_REVIEW_ONLY !== "true",
    provider,
    publicKey,
    rsaId,
    rsaPublicKey,
  };
}

export function getMissingCulqiEnv(): string[] {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_CULQI_PUBLIC_KEY?.trim()) missing.push("NEXT_PUBLIC_CULQI_PUBLIC_KEY");
  if (!process.env.NEXT_PUBLIC_CULQI_RSA_ID?.trim()) missing.push("NEXT_PUBLIC_CULQI_RSA_ID");
  if (!process.env.NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY?.trim()) missing.push("NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY");
  if (!process.env.CULQI_SECRET_KEY?.trim()) missing.push("CULQI_SECRET_KEY");
  return missing;
}

export function assertCulqiEnabled() {
  const config = getPaymentConfig();
  if (!config.enabled) {
    throw new Error("Culqi payments are not enabled yet.");
  }
  return config;
}

// The deployment flag alone is insufficient: a preview can have a public alias.
// Fence every sandbox API request to the explicitly configured review origin.
export function isCulqiRequestAllowed(request: Request): boolean {
  const config = getPaymentConfig();
  if (!config.enabled) return false;
  if (config.mode !== "sandbox") return true;
  try {
    return new URL(request.url).origin === new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").origin;
  } catch {
    return false;
  }
}
