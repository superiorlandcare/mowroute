import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getSetupData } from "@/lib/data/setup";
import { SetupClient } from "./setup-client";

export const metadata = { title: "Setup · MowRoute" };

// Admin-only. Crew hitting this route are redirected to `/` by requireAdmin().
export default async function SetupPage() {
  await requireAdmin();
  const { customers, profiles } = await getSetupData();

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <div className="max-w-md mx-auto pb-24">
        <div className="bg-stone-900 text-white px-5 pt-6 pb-5 rounded-b-3xl shadow-lg">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm font-bold text-stone-400"
          >
            <ChevronLeft className="w-4 h-4" /> Board
          </Link>
          <div className="mt-2 font-extrabold uppercase tracking-tight text-xl">
            Setup
          </div>
          <p className="text-stone-400 text-sm mt-1">
            Customers, services, and crew.
          </p>
        </div>

        <SetupClient customers={customers} profiles={profiles} />
      </div>
    </div>
  );
}
