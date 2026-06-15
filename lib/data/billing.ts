import { createClient } from "@/lib/supabase/server";
import { MONTHS } from "@/lib/constants";

// Billing (spec §11): monthly per-customer view aggregated from COMPLETED visits.
// Totals come from `price_snapshot` (the value stamped at completion), never the
// live service price, so past invoices never drift when prices change later.

export type InvoiceStatus = "open" | "sent" | "paid";

export interface BillingLine {
  serviceType: string;
  count: number;
  uniformPrice: number | null; // set only when every cut billed the same price
  total: number;
  dates: string[]; // "M/D" chips, chronological
}

export interface BillingAccount {
  customerId: string;
  customerName: string;
  lines: BillingLine[];
  total: number;
  status: InvoiceStatus;
}

export interface BillingData {
  month: string; // "YYYY-MM"
  monthLabel: string; // "June 2026"
  periodMonth: string; // "YYYY-MM-01" (invoices.period_month key)
  prevMonth: string; // "YYYY-MM"
  nextMonth: string; // "YYYY-MM"
  accounts: BillingAccount[];
  grandTotal: number;
  totalCuts: number;
  accountCount: number;
  openTotal: number;
  paidTotal: number;
}

// --- month helpers (UTC; see month-boundary note in getBillingData) ----------

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Normalize a `?month=` param to a valid "YYYY-MM", defaulting to the current month.
export function normalizeMonth(input?: string): string {
  if (input && MONTH_RE.test(input)) return input;
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function mdShort(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

type VisitRow = {
  customer_id: string;
  completed_at: string;
  price_snapshot: number | null;
  service_type_snapshot: string | null;
  customers: { name: string } | null;
};

export async function getBillingData(monthInput?: string): Promise<BillingData> {
  const supabase = await createClient();
  const month = normalizeMonth(monthInput);
  const periodMonth = `${month}-01`;
  const nextPeriod = `${shiftMonth(month, 1)}-01`;

  // Completed cuts in the month. NOTE: month boundaries use UTC. Crews mow during
  // daytime hours (well inside a single UTC day), so this matches the local date;
  // a cut logged late at night near a month edge is the only theoretical skew.
  const { data: vRows } = await supabase
    .from("visits")
    .select(
      "customer_id, completed_at, price_snapshot, service_type_snapshot, customers(name)",
    )
    .eq("status", "done")
    .gte("completed_at", periodMonth)
    .lt("completed_at", nextPeriod)
    .order("completed_at", { ascending: true });

  const visits = (vRows ?? []) as unknown as VisitRow[];

  // Invoice statuses for this period (one row per customer).
  const { data: invRows } = await supabase
    .from("invoices")
    .select("customer_id, status")
    .eq("period_month", periodMonth);
  const statusByCustomer = new Map<string, InvoiceStatus>(
    (invRows ?? []).map((r) => [
      r.customer_id as string,
      r.status as InvoiceStatus,
    ]),
  );

  // Group: customer → service type → line.
  type Acc = {
    customerId: string;
    customerName: string;
    lines: Map<string, { count: number; total: number; prices: Set<number>; dates: string[] }>;
    total: number;
  };
  const byCustomer = new Map<string, Acc>();

  for (const v of visits) {
    const acc =
      byCustomer.get(v.customer_id) ??
      ({
        customerId: v.customer_id,
        customerName: v.customers?.name ?? "—",
        lines: new Map(),
        total: 0,
      } satisfies Acc);

    const type = v.service_type_snapshot ?? "Mow";
    const line =
      acc.lines.get(type) ??
      { count: 0, total: 0, prices: new Set<number>(), dates: [] };

    const price = v.price_snapshot ?? 0;
    line.count += 1;
    line.total += price;
    if (v.price_snapshot != null) line.prices.add(v.price_snapshot);
    line.dates.push(mdShort(v.completed_at));

    acc.lines.set(type, line);
    acc.total += price;
    byCustomer.set(v.customer_id, acc);
  }

  const accounts: BillingAccount[] = [...byCustomer.values()]
    .map((a) => ({
      customerId: a.customerId,
      customerName: a.customerName,
      total: a.total,
      status: statusByCustomer.get(a.customerId) ?? "open",
      lines: [...a.lines.entries()].map(([serviceType, l]) => ({
        serviceType,
        count: l.count,
        uniformPrice: l.prices.size === 1 ? [...l.prices][0] : null,
        total: l.total,
        dates: l.dates,
      })),
    }))
    .sort((a, b) => a.customerName.localeCompare(b.customerName));

  const grandTotal = accounts.reduce((s, a) => s + a.total, 0);
  const paidTotal = accounts
    .filter((a) => a.status === "paid")
    .reduce((s, a) => s + a.total, 0);

  return {
    month,
    monthLabel: monthLabel(month),
    periodMonth,
    prevMonth: shiftMonth(month, -1),
    nextMonth: shiftMonth(month, 1),
    accounts,
    grandTotal,
    totalCuts: visits.length,
    accountCount: accounts.length,
    openTotal: grandTotal - paidTotal,
    paidTotal,
  };
}
