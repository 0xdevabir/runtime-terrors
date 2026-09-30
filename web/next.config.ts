import type { NextConfig } from "next";

// Browser calls go to /api/* on this origin and are proxied to the FastAPI service,
// so the web app deploys without CORS setup. Override the target with API_URL.
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  compress: false, // keep Server-Sent Events from /api/ask unbuffered through the proxy
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
