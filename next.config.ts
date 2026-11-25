import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { AVATAR_HOST } from "./src/features/auth/domain/avatar";
import { CONTENT_SECURITY_POLICY } from "./src/lib/csp";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  // GitHub avatars reach the browser through this instance, so the Content-Security-Policy stays same-origin. No redirect is followed off that host.
  images: { remotePatterns: [{ protocol: "https", hostname: AVATAR_HOST, pathname: "/u/**" }], maximumRedirects: 0 },
  // Development needs eval for hot reload, so the policy only applies to a production build.
  async headers() {
    return process.env.NODE_ENV === "production" ? [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY }] }] : [];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
