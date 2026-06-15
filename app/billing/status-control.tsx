"use client";

import { useTransition } from "react";
import type { InvoiceStatus } from "@/lib/data/billing";
import { setInvoiceStatus } from "./actions";

const STATES: { k: InvoiceStatus; label: string; active: string }[] = [
  { k: "open", label: "Open", active: "bg-stone-200 text-stone-700" },
  { k: "sent", label: "Invoice sent", active: "bg-amber-100 text-amber-700" },
  { k: "paid", label: "Paid", active: "bg-green-100 text-green-700" },
];

export function StatusControl({
  customerId,
  periodMonth,
  status,
}: {
  customerId: string;
  periodMonth: string;
  status: InvoiceStatus;
}) {
  const [pending, startTransition] = useTransition();

  const set = (next: InvoiceStatus) => {
    if (next === status) return;
    startTransition(async () => {
      await setInvoiceStatus(customerId, periodMonth, next);
    });
  };

  return (
    <div className="grid grid-cols-3 gap-1.5 mt-3 pt-3 border-t border-stone-200/70">
      {STATES.map((s) => (
        <button
          key={s.k}
          onClick={() => set(s.k)}
          disabled={pending}
          className={`py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-50 ${
            status === s.k
              ? `${s.active} ring-2 ring-offset-1 ring-stone-300`
              : "bg-stone-100 text-stone-400"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
