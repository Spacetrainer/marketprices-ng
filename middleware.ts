import type { NextRequest } from "next/server";
import { updateAdminSession } from "./lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateAdminSession(request);
}

export const config = {
  // Scoped to /admin only. The public site has no session to refresh and must not pay for
  // an auth round-trip on every request (P12.5: no admin data touches a public page).
  matcher: ["/admin/:path*"],
};
