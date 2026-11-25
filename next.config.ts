import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { CONTENT_SECURITY_POLICY } from "./src/lib/csp";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
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
