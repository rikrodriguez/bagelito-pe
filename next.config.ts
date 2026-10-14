import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  env: {
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
