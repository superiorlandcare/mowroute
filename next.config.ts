import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Run the middleware on the Node.js runtime. The auth middleware uses
    // @supabase/ssr -> @supabase/supabase-js, which references Node APIs
    // (process.version) that the Edge runtime rejects as a hard build error.
    // `nodeMiddleware` is enabled at runtime but not yet in the public types,
    // so we cast to satisfy the typecheck.
    nodeMiddleware: true,
  } as NextConfig["experimental"],
};

export default nextConfig;
