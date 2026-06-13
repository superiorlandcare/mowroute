import Link from "next/link";
import { ChevronLeft, Settings } from "lucide-react";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Setup · MowRoute" };

// Admin-only. Crew hitting this route are redirected to `/` by requireAdmin().
// The screen itself (customers + services CRUD) is built in Phase 2.
export default async function SetupPage() {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <div className="max-w-md mx-auto px-5 py-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm font-bold text-stone-500"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </Link>
        <div className="bg-white rounded-2xl border border-stone-200 p-6 mt-4 text-center">
          <Settings className="w-8 h-8 text-stone-400 mx-auto" />
          <div className="font-extrabold uppercase tracking-tight mt-3">
            Setup
          </div>
          <p className="text-sm text-stone-500 mt-2">
            Customers, services, and crew management arrive in Phase 2.
          </p>
        </div>
      </div>
    </div>
  );
}
