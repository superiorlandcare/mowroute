import Link from "next/link";
import { ChevronLeft, ChevronRight, Receipt } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getBillingData } from "@/lib/data/billing";
import { serviceStyle } from "@/lib/constants";
import { StatusControl } from "./status-control";

export const metadata = { title: "Billing · MowRoute" };

// Tint each customer card by invoice status (spec §11).
const CARD_TINT: Record<string, string> = {
  open: "bg-white border-stone-200",
  sent: "bg-amber-50 border-amber-200",
  paid: "bg-green-50 border-green-200",
};

// Admin-only (spec §11). Crew hitting this route are redirected to `/` by
// requireAdmin(); RLS on invoices is the backstop. Money lives here, but only
// admin can ever reach this screen or its data.
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireAdmin();
  const { month } = await searchParams;
  const b = await getBillingData(month);

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
            Billing
          </div>
        </div>

        <div className="px-5 mt-4 space-y-4">
          {/* Month nav */}
          <div className="flex items-center justify-between bg-white rounded-2xl border border-stone-200 p-2">
            <Link
              href={`/billing?month=${b.prevMonth}`}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-stone-500 hover:bg-stone-100"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div className="font-extrabold uppercase tracking-tight">
              {b.monthLabel}
            </div>
            <Link
              href={`/billing?month=${b.nextMonth}`}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-stone-500 hover:bg-stone-100"
              aria-label="Next month"
            >
              <ChevronRight className="w-5 h-5" />
            </Link>
          </div>

          {/* Header: total billed, cuts, accounts, Open vs Paid split */}
          <div className="bg-stone-900 text-white rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-stone-400 flex items-center gap-1">
                  <Receipt className="w-3.5 h-3.5" /> Billed this month
                </div>
                <div className="font-mono text-4xl font-extrabold mt-1">
                  ${b.grandTotal}
                </div>
              </div>
              <div className="text-right font-mono text-sm text-stone-400">
                {b.totalCuts} {b.totalCuts === 1 ? "cut" : "cuts"}
                <br />
                {b.accountCount} {b.accountCount === 1 ? "account" : "accounts"}
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <div className="flex-1 bg-stone-800 rounded-xl px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-amber-400 font-bold">
                  Open
                </div>
                <div className="font-mono font-bold">${b.openTotal}</div>
              </div>
              <div className="flex-1 bg-stone-800 rounded-xl px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-green-400 font-bold">
                  Paid
                </div>
                <div className="font-mono font-bold">${b.paidTotal}</div>
              </div>
            </div>
          </div>

          {/* One card per customer */}
          <div className="space-y-3">
            {b.accounts.map((a) => (
              <div
                key={a.customerId}
                className={`rounded-2xl border p-4 ${CARD_TINT[a.status]}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-bold">{a.customerName}</span>
                  <span className="font-mono font-bold text-lg shrink-0">
                    ${a.total}
                  </span>
                </div>

                {a.lines.map((l) => (
                  <div key={l.serviceType} className="mb-2">
                    <div className="flex items-center gap-2 text-sm">
                      {l.serviceType !== "Mow" ? (
                        <span
                          className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${serviceStyle(
                            l.serviceType,
                          )}`}
                        >
                          {l.serviceType}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
                          Mow
                        </span>
                      )}
                      <span className="font-mono text-stone-500">
                        {l.count} {l.count === 1 ? "cut" : "cuts"}
                        {l.uniformPrice != null && ` × $${l.uniformPrice}`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {l.dates.map((d, i) => (
                        <span
                          key={i}
                          className="font-mono text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}

                <StatusControl
                  customerId={a.customerId}
                  periodMonth={b.periodMonth}
                  status={a.status}
                />
              </div>
            ))}

            {b.accounts.length === 0 && (
              <div className="text-center text-stone-400 text-sm py-10 bg-white rounded-2xl border border-stone-200">
                No completed cuts in {b.monthLabel}.
              </div>
            )}
          </div>

          <p className="text-xs text-stone-400 text-center px-4">
            Cuts land here automatically from completed visits. Totals use the
            price captured at completion, so past months never change when prices
            do.
          </p>
        </div>
      </div>
    </div>
  );
}
