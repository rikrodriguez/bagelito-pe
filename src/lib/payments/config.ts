export type PaymentProvider = "manual" | "culqi";

export type PaymentConfig = {
  enabled: boolean;
  provider: PaymentProvider;
  publicKey: string;
  rsaId: string;
  rsaPublicKey: string;
  hasSecretKey: boolean;
  currency: "PEN";
};

export type PublicPaymentConfig = {
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

  return {
    enabled: provider === "culqi"
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
    currency,
    enabled,
    provider,
    publicKey,
    rsaId,
    rsaPublicKey,
  } = getPaymentConfig();

  return {
    currency,
    enabled,
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
