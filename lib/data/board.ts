import { createClient } from "@/lib/supabase/server";
import { currentCycleMonday, isServiceDue, cadenceUnset, toISODate } from "@/lib/cycle";
import type { Service, Customer, Visit, CrewNote } from "@/lib/types";

// One stop on the board: the service + its customer + the visit row that carries
// live status for the current cycle, plus the customer's crew-note thread.
export interface BoardItem {
  visit: Visit;
  service: Service;
  customer: Customer;
  performerName: string | null;
  cadenceUnset: boolean;
  notes: CrewNote[];
}

// A customer parked in the "On hold" tray (future hold_until) — kept off the
// route but shown so the crew knows it's intentional (spec §8, §9).
export interface HeldCustomer {
  customer: Customer;
  services: Service[];
}

export interface BoardData {
  cycleMonday: string;
  items: BoardItem[];
  held: HeldCustomer[];
}

type ServiceWithCustomer = Service & { customer: Customer | null };

// All data the Mow board needs for the current cycle. RLS lets any authed user
// read; the lazy pending-visit creation below also runs under the user's token
// (visits insert policy is `with check (true)` — spec §5).
//
// `isAdmin` gates money: crew never see revenue/pricing on the board, so for
// non-admins we strip every dollar field (service price + visit price_snapshot)
// out of the payload entirely — not just hide it in the UI.
export async function getBoardData(isAdmin: boolean): Promise<BoardData> {
  const supabase = await createClient();
  const cycleMonday = currentCycleMonday();
  const today = toISODate(new Date());

  const { data: svcRows } = await supabase
    .from("services")
    .select("*, customer:customers(*)")
    .eq("active", true)
    .order("sort_order");

  const services = (svcRows ?? []) as ServiceWithCustomer[];

  const held = new Map<string, HeldCustomer>();
  const due: { service: Service; customer: Customer }[] = [];

  for (const row of services) {
    const { customer, ...service } = row;
    if (!customer || !customer.active) continue;

    // A future hold_until parks the whole customer in the tray (spec §9).
    if (customer.hold_until && customer.hold_until > today) {
      const entry = held.get(customer.id) ?? { customer, services: [] };
      entry.services.push(service);
      held.set(customer.id, entry);
      continue;
    }

    if (!isServiceDue(service, cycleMonday)) continue;
    due.push({ service, customer });
  }

  // Lazily create a pending visit per due service for this cycle (spec §9). The
  // unique(service_id, service_date) constraint + ignoreDuplicates makes this
  // idempotent and race-safe across phones.
  if (due.length > 0) {
    await supabase.from("visits").upsert(
      due.map(({ service, customer }) => ({
        service_id: service.id,
        customer_id: customer.id,
        service_date: cycleMonday,
        status: "pending" as const,
      })),
      { onConflict: "service_id,service_date", ignoreDuplicates: true },
    );
  }

  const serviceIds = due.map((d) => d.service.id);
  let visits: Visit[] = [];
  if (serviceIds.length > 0) {
    const { data } = await supabase
      .from("visits")
      .select("*")
      .eq("service_date", cycleMonday)
      .in("service_id", serviceIds);
    visits = (data ?? []) as Visit[];
  }
  const visitByService = new Map(visits.map((v) => [v.service_id, v]));

  // Names for attribution (performed_by → profiles.full_name).
  const { data: profs } = await supabase.from("profiles").select("id, full_name");
  const nameById = new Map(
    (profs ?? []).map((p) => [p.id as string, p.full_name as string]),
  );

  // Crew-note threads for the customers on the board (spec §8). Append-only log,
  // oldest first; author names resolved from the profiles map above.
  const customerIds = [...new Set(due.map((d) => d.customer.id))];
  const notesByCustomer = new Map<string, CrewNote[]>();
  if (customerIds.length > 0) {
    const { data: noteRows } = await supabase
      .from("crew_notes")
      .select("*")
      .in("customer_id", customerIds)
      .order("created_at", { ascending: true });
    for (const n of (noteRows ?? []) as Omit<CrewNote, "authorName">[]) {
      const list = notesByCustomer.get(n.customer_id) ?? [];
      list.push({
        ...n,
        authorName: n.author_id ? nameById.get(n.author_id) ?? null : null,
      });
      notesByCustomer.set(n.customer_id, list);
    }
  }

  const items: BoardItem[] = [];
  for (const { service, customer } of due) {
    const visit = visitByService.get(service.id);
    if (!visit) continue; // exists after the upsert above
    items.push({
      visit: isAdmin ? visit : { ...visit, price_snapshot: null },
      service: isAdmin ? service : { ...service, price: null },
      customer,
      performerName: visit.performed_by
        ? nameById.get(visit.performed_by) ?? null
        : null,
      cadenceUnset: cadenceUnset(service),
      notes: notesByCustomer.get(customer.id) ?? [],
    });
  }

  const heldList = [...held.values()]
    .map((h) =>
      isAdmin
        ? h
        : { ...h, services: h.services.map((s) => ({ ...s, price: null })) },
    )
    .sort((a, b) => a.customer.name.localeCompare(b.customer.name));

  return { cycleMonday, items, held: heldList };
}
