"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import type { InvoiceStatus } from "@/lib/data/billing";

export type ActionResult = { error?: string; ok?: boolean };

// Billing is admin-only (only Katy marks paid — spec §5, §11). Auth-guard here;
// RLS on `invoices` (insert/update require is_admin()) is the backstop.
async function adminClient() {
  const { profile } = await getSessionProfile();
  if (profile?.role !== "admin") {
    return { error: "Not authorized." as string, supabase: null };
  }
  return { error: undefined, supabase: await createClient() };
}

// Set a customer's monthly invoice status (Open → Invoice sent → Paid), keyed by
// customer + period_month (spec §11). Stamps sent_at / paid_at on transition.
export async function setInvoiceStatus(
  customerId: string,
  periodMonth: string, // "YYYY-MM-01"
  status: InvoiceStatus,
): Promise<ActionResult> {
  const { error, supabase } = await adminClient();
  if (error || !supabase) return { error };
  if (!customerId || !periodMonth) return { error: "Missing invoice key." };

  // Preserve an existing sent_at when advancing to paid.
  const { data: existing } = await supabase
    .from("invoices")
    .select("sent_at")
    .eq("customer_id", customerId)
    .eq("period_month", periodMonth)
    .maybeSingle();

  const now = new Date().toISOString();
  const row = {
    customer_id: customerId,
    period_month: periodMonth,
    status,
    sent_at:
      status === "sent" ? now : status === "paid" ? existing?.sent_at ?? now : null,
    paid_at: status === "paid" ? now : null,
  };

  const res = await supabase
    .from("invoices")
    .upsert(row, { onConflict: "customer_id,period_month" });

  if (res.error) return { error: res.error.message };
  revalidatePath("/billing");
  return { ok: true };
}
