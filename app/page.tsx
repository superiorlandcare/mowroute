import Link from "next/link";
import { Tractor, Settings, Receipt, LogOut, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { signOut } from "./actions";

// Phase 1 placeholder for the Mow board (`/`). The real route board is Phase 3.
// For now this confirms auth works and shows who you are + your role gating.
export default async function HomePage() {
  const { user, profile } = await requireUser();
  const isAdmin = profile?.role === "admin";
  const name = profile?.full_name ?? user.email ?? "there";

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <div className="max-w-md mx-auto pb-16">
        {/* Scoreboard-style header */}
        <div className="bg-stone-900 text-white px-5 pt-6 pb-5 rounded-b-3xl shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tractor className="w-5 h-5 text-green-400" />
              <span className="font-extrabold uppercase tracking-tight text-sm">
                MowRoute
              </span>
            </div>
            <span
              className={`text-[11px] font-mono uppercase px-2 py-0.5 rounded ${
                isAdmin
                  ? "bg-green-500/20 text-green-400"
                  : "bg-stone-700 text-stone-300"
              }`}
            >
              {profile?.role ?? "no profile"}
            </span>
          </div>
          <div className="mt-4">
            <div className="text-stone-400 text-xs uppercase tracking-wide">
              Signed in as
            </div>
            <div className="font-bold text-lg">{name}</div>
            <div className="font-mono text-xs text-stone-500">{user.email}</div>
          </div>
        </div>

        <div className="px-5 mt-5 space-y-4">
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <div className="flex items-center gap-2 text-green-700">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-sm font-bold uppercase tracking-wide">
                Phase 1 ready
              </span>
            </div>
            <p className="text-sm text-stone-500 mt-2">
              Foundation is in place: database schema, RLS, and authentication.
              The Mow board, Setup, and Billing screens come in the next phases.
            </p>
          </div>

          {/* Admin-only navigation — crew never see these links, and the pages
              themselves redirect crew away (defense in depth + RLS). */}
          {isAdmin && (
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/setup"
                className="bg-white rounded-2xl border border-stone-200 p-4 flex flex-col gap-2 active:scale-[0.99] transition"
              >
                <Settings className="w-5 h-5 text-stone-700" />
                <span className="font-bold uppercase tracking-wide text-sm">
                  Setup
                </span>
                <span className="text-xs text-stone-400">
                  Customers, services, crew
                </span>
              </Link>
              <Link
                href="/billing"
                className="bg-white rounded-2xl border border-stone-200 p-4 flex flex-col gap-2 active:scale-[0.99] transition"
              >
                <Receipt className="w-5 h-5 text-stone-700" />
                <span className="font-bold uppercase tracking-wide text-sm">
                  Billing
                </span>
                <span className="text-xs text-stone-400">
                  Monthly totals & status
                </span>
              </Link>
            </div>
          )}

          <form action={signOut}>
            <button
              type="submit"
              className="w-full py-3 rounded-2xl border border-stone-200 bg-white text-stone-600 font-bold uppercase tracking-wide text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
