import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

function webhookBuildIdentity() {
  // Fingerprint selected source bytes, not the compiled binary. No environment
  // files, keys or runtime aliases are read. Git commands never invoke a shell.
  const paths = [
    "src/app/api/webhooks/culqi/route.ts", "src/lib/payments/culqi.ts",
    "src/lib/payments/verification.ts", "src/lib/payments/config.ts",
    "src/lib/payments/culqi-event-currency-evidence.ts", "next.config.ts",
  ];
  const unavailable = { schema: 1, commit: null, sourceDigest: null, sourceMatchesCommit: null };
  try {
    const sources = paths.map((path) => ({ path, bytes: readFileSync(path) }));
    const hash = createHash("sha256");
    for (const { path, bytes } of sources) hash.update(path).update("\0").update(bytes).update("\0");
    const sourceDigest = hash.digest("hex");
    try {
      const commit = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8", timeout: 1000, stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (!/^[a-f0-9]{40}$/.test(commit)) return { ...unavailable, sourceDigest };
      const sourceMatchesCommit = sources.every(({ path, bytes }) => bytes.equals(execFileSync("git", ["show", `${commit}:${path}`], {
        timeout: 1000, maxBuffer: 1048576, stdio: ["ignore", "pipe", "ignore"],
      })));
      return { schema: 1, commit, sourceDigest, sourceMatchesCommit };
    } catch { return { ...unavailable, sourceDigest }; }
  } catch { return unavailable; }
}

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  env: {
    // Compiled once with the artifact; never substitute a runtime branch/SHA.
    CULQI_WEBHOOK_BUILD_IDENTITY: JSON.stringify(webhookBuildIdentity()),
    // Only already-public configuration; never include server secrets. Always
    // inline a snapshot, even when absent at build, to avoid runtime self-comparison.
    CULQI_DIAGNOSTIC_BUILD_PUBLIC_CONFIG: JSON.stringify({
      publicKey: process.env.NEXT_PUBLIC_CULQI_PUBLIC_KEY ?? "",
      rsaId: process.env.NEXT_PUBLIC_CULQI_RSA_ID ?? "",
      rsaPublicKey: process.env.NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY ?? "",
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    }),
  },
  images: {
    deviceSizes: [360, 414, 640, 768, 1024, 1280, 1600],
    imageSizes: [32, 48, 64, 96, 128, 192, 256, 384, 512],
    qualities: [70, 72, 74, 76],
  },
};

export default nextConfig;
