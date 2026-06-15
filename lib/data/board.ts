import { createClient } from "@/lib/supabase/server";
import { currentCycleDate, isServiceDue, isHeld, todayDate } from "@/lib/cycle";
import type { BoardRow, Customer, Service, Visit } from "@/lib/types";

export interface BoardData {
  cycleDate: string;
  rows: BoardRow[];
  held: Customer[];
  performerNames: Record<string, string>;
}

// Builds the current cycle's board: lazily creates the pending visits that are
// due this week (spec §9), then returns them joined to service + customer.
export async function getBoard(): Promise<BoardData> {
  const supabase = await createClient();
  const cycleDate = currentCycleDate();
  const today = todayDate();

  // 1. All active services + their customer, to decide what's due this cycle.
  const { data: serviceRows } = await supabase
    .from("services")
    .select("*, customer:customers(*)")
    .eq("active", true);

  type ServiceWithCustomer = Service & { customer: Customer | null };
  const services = (serviceRows ?? []) as ServiceWithCustomer[];

  // 2. Lazily create any missing pending visits for due, non-held services.
  const toCreate = services
    .filter(
      (s) =>
        s.customer &&
        s.customer.active &&
        !isHeld(s.customer, today) &&
        isServiceDue(s, cycleDate),
    )
    .map((s) => ({
      service_id: s.id,
      customer_id: s.customer_id,
      service_date: cycleDate,
      status: "pending" as const,
    }));

  if (toCreate.length > 0) {
    // ON CONFLICT DO NOTHING against unique(service_id, service_date): only the
    // genuinely missing visits are inserted; existing ones are untouched.
    await supabase
      .from("visits")
      .upsert(toCreate, {
        onConflict: "service_id,service_date",
        ignoreDuplicates: true,
      });
  }

  // 3. Fetch this cycle's visits joined to service + customer.
  const { data: visitRows } = await supabase
    .from("visits")
    .select("*, service:services(*), customer:customers(*)")
    .eq("service_date", cycleDate);

  type JoinedVisit = Visit & {
    service: Service | null;
    customer: Customer | null;
  };

  const rows: BoardRow[] = ((visitRows ?? []) as JoinedVisit[])
    .filter(
      (v) =>
        v.service &&
        v.service.active &&
        v.customer &&
        v.customer.active &&
        !isHeld(v.customer, today),
    )
    .map((v) => {
      const { service, customer, ...visit } = v;
      return { visit: visit as Visit, service: service!, customer: customer! };
    });

  // 4. Held customers (future hold_until) for the "On hold" tray.
  const { data: heldRows } = await supabase
    .from("customers")
    .select("*")
    .eq("active", true)
    .gt("hold_until", today)
    .order("name");
  const held = (heldRows ?? []) as Customer[];

  // 5. Attribution names (performed_by → full_name).
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, full_name");
  const performerNames: Record<string, string> = {};
  for (const p of profileRows ?? []) {
    performerNames[p.id as string] = p.full_name as string;
  }

  return { cycleDate, rows, held, performerNames };
}
