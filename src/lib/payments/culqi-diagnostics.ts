import { createPublicKey, type KeyObject } from "node:crypto";

// Fixed to the inspected PR1 Preview. Never derive the allowed origin from headers.
export const CULQI_DIAGNOSTIC_ORIGIN = "https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const PREVIEW_BRANCH = "fix/culqi-payment-coordination-20261012";
const VERCEL_PROJECT = "prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0";
const SANDBOX_DATABASE_URL = "https://qaahskendqdkynwtylho.supabase.co";

type Environment = Record<string, string | undefined>;
export type CulqiDiagnosticPublicConfig = {
  publicKey: string | undefined;
  rsaId: string | undefined;
  rsaPublicKey: string | undefined;
  siteUrl: string | undefined;
  supabaseUrl: string | undefined;
};

function exactOrigin(value: string | undefined, expected: string): boolean {
  try {
    const url = new URL(value ?? "");
    return url.origin === expected && !url.username && !url.password
      && url.pathname === "/" && !url.search && !url.hash;
  } catch { return false; }
}

// Call only after requireAdmin(). This gate reads no Culqi keys or RSA material.
export function culqiDiagnosticScope(request: Request, env: Environment): Record<string, boolean> {
  return {
    vercelPreview: env.VERCEL === "1" && env.VERCEL_ENV === "preview"
      && (!env.VERCEL_TARGET_ENV || env.VERCEL_TARGET_ENV === "preview"),
    vercelProjectMatches: env.VERCEL_PROJECT_ID === VERCEL_PROJECT,
    sandboxBranchMatches: env.VERCEL_GIT_COMMIT_REF === PREVIEW_BRANCH
      && env.VERCEL_GIT_REPO_OWNER === "rikrodriguez" && env.VERCEL_GIT_REPO_SLUG === "bagelito-pe",
    branchOriginMatches: env.VERCEL_BRANCH_URL === new URL(CULQI_DIAGNOSTIC_ORIGIN).hostname,
    siteOriginMatches: exactOrigin(env.NEXT_PUBLIC_SITE_URL, CULQI_DIAGNOSTIC_ORIGIN),
    requestOriginMatches: new URL(request.url).origin === CULQI_DIAGNOSTIC_ORIGIN
      && request.headers.get("origin") === CULQI_DIAGNOSTIC_ORIGIN,
    sandboxDatabaseMatches: exactOrigin(env.NEXT_PUBLIC_SUPABASE_URL, SANDBOX_DATABASE_URL),
    sandboxMode: env.CULQI_MODE === "sandbox" && env.CULQI_LIVE_APPROVED !== "true",
    paymentsDisabled: env.CULQI_ENABLED === "false",
  };
}

// A normal GET navigation may omit Origin. It serves only a static form and
// never runs a diagnostic; POST continues to require the exact Origin header.
export function culqiDiagnosticFormScope(request: Request, env: Environment): Record<string, boolean> {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return {
    ...culqiDiagnosticScope(request, env),
    requestOriginMatches: request.method === "GET"
      && new URL(request.url).origin === CULQI_DIAGNOSTIC_ORIGIN
      && (origin === null || origin === CULQI_DIAGNOSTIC_ORIGIN)
      && (fetchSite === null || fetchSite === "none" || fetchSite === "same-origin"),
  };
}

function text(value: string | undefined, maxLength = 4096): string {
  return typeof value === "string" && value.length <= maxLength ? value.trim() : "";
}

function publicRsa(value: string | undefined) {
  const pem = text(value, 16384).replace(/\\n/g, "\n").trim();
  // createPublicKey also accepts private keys and certificates. Reject those before parsing.
  if (!/^-----BEGIN (PUBLIC KEY|RSA PUBLIC KEY)-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END \1-----$/.test(pem)) return null;
  try {
    const key = createPublicKey(pem);
    return key.asymmetricKeyType === "rsa" ? key : null;
  } catch { return null; }
}

// Only boolean observations leave this function. Modulus/key material stays in
// memory; independently derive its bit length to check Node's metadata.
export function inspectRsaSize(key: KeyObject | null): Record<string, boolean> {
  let metadataBits: number | null = null;
  let computedBits: number | null = null;
  if (key?.asymmetricKeyType === "rsa") {
    try {
      const value = key.asymmetricKeyDetails?.modulusLength;
      if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) metadataBits = value;
    } catch { /* An unavailable observation remains unknown, never a pass. */ }
    try {
      const jwk = key.export({ format: "jwk" });
      if (jwk.kty === "RSA" && typeof jwk.n === "string" && /^[A-Za-z0-9_-]+$/.test(jwk.n)) {
        const modulus = Buffer.from(jwk.n, "base64url");
        if (modulus.toString("base64url") === jwk.n) {
          const first = modulus.findIndex((byte) => byte !== 0);
          if (first !== -1) computedBits = (modulus.length - first - 1) * 8 + 32 - Math.clz32(modulus[first]);
        }
      }
    } catch { /* Invalid or unsupported export remains unknown. */ }
  }
  const consistent = metadataBits !== null && computedBits !== null && metadataBits === computedBits;
  return {
    rsaSizeMetadataAvailable: metadataBits !== null,
    rsaComputedSizeAvailable: computedBits !== null,
    rsaSizeMetadataMatchesComputed: consistent,
    rsaBelow2048Bits: consistent && computedBits! < 2048,
    rsaAtLeast2048Bits: consistent && computedBits! >= 2048,
    rsaSizeUnverified: !consistent,
  };
}

// Offline preflight only. No provider/client imports, network, DB, cookies or env writes.
export function diagnoseCulqiConfiguration(env: Environment, bundled: CulqiDiagnosticPublicConfig): Record<string, boolean> {
  const publicKey = text(env.NEXT_PUBLIC_CULQI_PUBLIC_KEY);
  const secretKey = text(env.CULQI_SECRET_KEY);
  const rsaId = text(env.NEXT_PUBLIC_CULQI_RSA_ID, 128);
  const rsaKey = publicRsa(env.NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY);
  const bundledRsa = publicRsa(bundled.rsaPublicKey);
  const rsaSize = inspectRsaSize(rsaKey);
  const checks = {
    providerIsCulqi: env.PAYMENT_PROVIDER === "culqi",
    publicTestKeyPresent: /^pk_test_[A-Za-z0-9]+$/.test(publicKey),
    secretTestKeyPresent: /^sk_test_[A-Za-z0-9]+$/.test(secretKey),
    rsaIdPresent: /^[A-Za-z0-9_-]+$/.test(rsaId),
    rsaPublicKeyParseable: rsaKey !== null,
    // Conservative LOCAL policy, not a documented Culqi size requirement.
    // Missing or inconsistent observations cannot satisfy this control.
    rsaAtLeast2048Bits: rsaSize.rsaAtLeast2048Bits,
    publicKeyMatchesBundle: Boolean(publicKey) && publicKey === text(bundled.publicKey),
    rsaIdMatchesBundle: Boolean(rsaId) && rsaId === text(bundled.rsaId, 128),
    rsaPublicKeyMatchesBundle: Boolean(rsaKey && bundledRsa
      && rsaKey.export({ type: "spki", format: "der" }).equals(bundledRsa.export({ type: "spki", format: "der" }))),
    siteOriginMatchesBundle: exactOrigin(bundled.siteUrl, CULQI_DIAGNOSTIC_ORIGIN)
      && exactOrigin(env.NEXT_PUBLIC_SITE_URL, CULQI_DIAGNOSTIC_ORIGIN),
    sandboxDatabaseMatchesBundle: exactOrigin(bundled.supabaseUrl, SANDBOX_DATABASE_URL)
      && exactOrigin(env.NEXT_PUBLIC_SUPABASE_URL, SANDBOX_DATABASE_URL),
  };
  return {
    ...checks,
    ...rsaSize,
    offlineConfigurationValid: Object.values(checks).every(Boolean),
    // Mirrors the existing checkout gate; RSA size is not used by that gate.
    checkoutBlockedByFeatureFlag: env.CULQI_ENABLED !== "true",
    // No provider verification is performed; parsing alone cannot prove compatibility.
    rsaCompatibilityUnverified: true,
    // An opaque RSA ID cannot be bound to a PEM offline. The owner must check CulqiPanel.
    rsaAssociationVerified: false,
  };
}
