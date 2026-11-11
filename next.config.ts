import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The organiser dashboard is live data; keep the classic dynamic rendering model.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
