import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Node.js runtime: the Supabase client pulls in Node APIs that the Edge
  // runtime rejects. Enabled via experimental.nodeMiddleware in next.config.ts.
  runtime: "nodejs",
  matcher: [
    /*
     * Match every path except:
     * - _next/static, _next/image (build assets)
     * - favicon.ico and common static image/asset extensions
     * Auth checks still apply to all app + data routes.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
