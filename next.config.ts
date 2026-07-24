import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/labs/relationships",
        destination: "/relationships/graphs",
        permanent: true,
      },
      {
        source: "/labs/relationships/bubbles",
        destination: "/relationships/graphs?view=bubbles",
        permanent: true,
      },
      {
        source: "/labs/relationships/flow",
        destination: "/relationships/graphs?view=flow",
        permanent: true,
      },
      {
        source: "/labs/relationships/matrix",
        destination: "/relationships/graphs?view=matrix",
        permanent: true,
      },
      {
        source: "/labs/relationships/ego",
        destination: "/relationships/graphs?view=ego",
        permanent: true,
      },
      {
        source: "/labs/relationships/:path*",
        destination: "/relationships/graphs",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
