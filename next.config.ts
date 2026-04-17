import type { NextConfig } from "next";

function deriveAllowedDevOrigins(): string[] {
  const origins = new Set<string>();
  const redirectUri = process.env.GITHUB_REDIRECT_URI;
  if (redirectUri) {
    try {
      origins.add(new URL(redirectUri).host);
    } catch {
      // ignore malformed URI
    }
  }
  // Comma-separated extra hosts: e.g. ALLOWED_DEV_ORIGINS=foo.ngrok.app,bar.local
  const extra = process.env.ALLOWED_DEV_ORIGINS;
  if (extra) {
    for (const host of extra.split(",").map((s) => s.trim()).filter(Boolean)) {
      origins.add(host);
    }
  }
  return [...origins];
}

const allowedDevOrigins = deriveAllowedDevOrigins();

const nextConfig: NextConfig = {
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
