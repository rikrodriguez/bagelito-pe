import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    deviceSizes: [360, 414, 640, 768, 1024, 1280, 1600],
    imageSizes: [32, 48, 64, 96, 128, 192, 256, 384, 512],
  },
};

export default nextConfig;
