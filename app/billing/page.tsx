import Link from "next/link";
import { ChevronLeft, Receipt } from "lucide-react";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Billing · MowRoute" };

// Admin-only. Crew hitting this route are redirected to `/` by requireAdmin().
// The monthly billing view is built in Phase 6.
export default async function BillingPage() {
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
          <Receipt className="w-8 h-8 text-stone-400 mx-auto" />
          <div className="font-extrabold uppercase tracking-tight mt-3">
            Billing
          </div>
          <p className="text-sm text-stone-500 mt-2">
            Monthly per-customer totals and Open/Sent/Paid status arrive in
            Phase 6.
          </p>
        </div>
      </div>
    </div>
  );
}
