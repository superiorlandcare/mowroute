"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { geocodeAddress, type GeocodeQuality } from "@/lib/geocode";
import { mondayOf, parseISODate, toISODate } from "@/lib/cycle";
import { pickRouteServices, assignSortSlots } from "@/lib/route-plan";
import { DAYS } from "@/lib/constants";
import type { Day, Interval } from "@/lib/types";

// Map features are admin tools (route planning + pin placement), same gate as
// Setup. RLS is the backstop.
async function adminClient() {
  const { profile } = await getSessionProfile();
  if (profile?.role !== "admin") {
    return { error: "Not authorized." as string, supabase: null, uid: null };
  }
  return { error: undefined, supabase: await createClient(), uid: profile.id };
}

// ---------------------------------------------------------------------------
// Geocode preview — a STARTING GUESS for a draggable pin, never stored as-is.
// Unlike geocode-on-save this happily returns a low-confidence match: the
// admin is looking at a map and will drag the pin to the truth.
// ---------------------------------------------------------------------------

export type GeocodePreview = {
  error?: string;
  lat?: number;
  lng?: number;
  quality?: GeocodeQuality;
};

export async function previewGeocode(
  address: string,
  city: string | null,
): Promise<GeocodePreview> {
  const { error } = await adminClient();
  if (error) return { error };
  if (!address?.trim()) return { error: "Enter an address first." };

  const geo = await geocodeAddress(address, city, "OH");
  if (geo.lat == null || geo.lng == null) {
    return { error: "Couldn't find that address — drop the pin by hand." };
  }
  return { lat: geo.lat, lng: geo.lng, quality: geo.quality };
}

// ---------------------------------------------------------------------------
// Create a route from the map's tap-to-select flow.
//
// "Route" in this app's data model (spec §9) = pending visits for a cycle +
// services.sort_order. So building a route for a date means:
//   1. a pending visit per chosen service for that date's cycle (idempotent —
//      exactly how the board lazily creates them),
//   2. the chosen services' soft `day` label retagged to that weekday so the
//      board groups them where they were planned,
//   3. tap order written into sort_order (permuting only the chosen services'
//      own slots, like optimizeDay),
//   4. the custom start/end saved to route_plans for the optimizer.
// ---------------------------------------------------------------------------

export interface RouteEndpointInput {
  lat: number;
  lng: number;
  label: string | null;
}

export interface CreateMapRouteInput {
  date: string; // YYYY-MM-DD — "today" by default in the UI
  customerIds: string[]; // in tap order
  start: RouteEndpointInput | null;
  end: RouteEndpointInput | null;
}

export type CreateMapRouteResult = {
  error?: string;
  ok?: boolean;
  stops?: number; // services put on the route
  created?: number; // new pending visits (rest already existed this cycle)
  skippedCustomers?: string[]; // held/inactive/service-less — not added
};

type PickableService = {
  id: string;
  customer_id: string;
  service_type: string;
  interval: Interval;
  anchor_date: string | null;
  sort_order: number;
};

function validEndpoint(e: RouteEndpointInput | null): boolean {
  if (e == null) return true;
  return (
    typeof e.lat === "number" &&
    typeof e.lng === "number" &&
    Number.isFinite(e.lat) &&
    Number.isFinite(e.lng) &&
    e.lat >= -90 &&
    e.lat <= 90 &&
    e.lng >= -180 &&
    e.lng <= 180
  );
}

export async function createMapRoute(
  input: CreateMapRouteInput,
): Promise<CreateMapRouteResult> {
  const { error, supabase, uid } = await adminClient();
  if (error || !supabase) return { error };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "")) {
    return { error: "Pick a date for the route." };
  }
  const customerIds = [...new Set(input.customerIds ?? [])];
  if (customerIds.length === 0) {
    return { error: "Tap at least one property first." };
  }
  if (!validEndpoint(input.start) || !validEndpoint(input.end)) {
    return { error: "Start/end location has invalid coordinates." };
  }

  const planDate = parseISODate(input.date);
  const cycleMonday = toISODate(mondayOf(planDate));
  // Soft day label for that date; weekend routes just skip the retag (the
  // services.day check constraint is Mon–Fri).
  const dayLabel: Day | null = DAYS[(planDate.getDay() + 6) % 7] ?? null;

  // Save the plan (start/end) first — it's the cheapest write and fails fast
  // with a clear message if migration 0004 hasn't been run yet.
  const planRes = await supabase.from("route_plans").upsert(
    {
      plan_date: input.date,
      start_lat: input.start?.lat ?? null,
      start_lng: input.start?.lng ?? null,
      start_label: input.start?.label ?? null,
      end_lat: input.end?.lat ?? null,
      end_lng: input.end?.lng ?? null,
      end_label: input.end?.label ?? null,
      created_by: uid,
    },
    { onConflict: "plan_date" },
  );
  if (planRes.error) {
    return {
      error: `Couldn't save the route plan: ${planRes.error.message}. (Has migration 0004_route_plans.sql been run?)`,
    };
  }

  // Which customers can actually be routed: active and not on hold past the
  // plan date (a held customer would be invisible on the board anyway).
  const { data: custRows, error: custErr } = await supabase
    .from("customers")
    .select("id, name, active, hold_until")
    .in("id", customerIds);
  if (custErr) return { error: custErr.message };

  const customerById = new Map((custRows ?? []).map((c) => [c.id, c]));
  const skippedCustomers: string[] = [];
  const routableIds = customerIds.filter((id) => {
    const c = customerById.get(id);
    if (!c) return false;
    if (!c.active || (c.hold_until && c.hold_until > input.date)) {
      skippedCustomers.push(c.name);
      return false;
    }
    return true;
  });
  if (routableIds.length === 0) {
    return { error: "None of the selected properties can be routed (on hold or inactive).", skippedCustomers };
  }

  const { data: svcRows, error: svcErr } = await supabase
    .from("services")
    .select("id, customer_id, service_type, interval, anchor_date, sort_order")
    .in("customer_id", routableIds)
    .eq("active", true)
    .order("sort_order");
  if (svcErr) return { error: svcErr.message };

  const servicesByCustomer = new Map<string, PickableService[]>();
  for (const s of (svcRows ?? []) as PickableService[]) {
    const list = servicesByCustomer.get(s.customer_id) ?? [];
    list.push(s);
    servicesByCustomer.set(s.customer_id, list);
  }

  // Chosen services in tap order (each customer's picks keep their own
  // relative sort_order).
  const chosen: PickableService[] = [];
  for (const id of routableIds) {
    const services = servicesByCustomer.get(id) ?? [];
    if (services.length === 0) {
      skippedCustomers.push(customerById.get(id)?.name ?? "Unknown");
      continue;
    }
    chosen.push(...pickRouteServices(services, cycleMonday));
  }
  if (chosen.length === 0) {
    return { error: "The selected properties have no active services to route.", skippedCustomers };
  }

  // Pending visits for that date's cycle — identical shape + idempotence to
  // the board's lazy creation (unique(service_id, service_date) is the guard).
  const { data: inserted, error: visitErr } = await supabase
    .from("visits")
    .upsert(
      chosen.map((s) => ({
        service_id: s.id,
        customer_id: s.customer_id,
        service_date: cycleMonday,
        status: "pending" as const,
      })),
      { onConflict: "service_id,service_date", ignoreDuplicates: true },
    )
    .select("service_id");
  if (visitErr) return { error: visitErr.message };

  // Retag the soft day + write tap order into the chosen services' own slots.
  const slotById = new Map(chosen.map((s) => [s.id, s.sort_order]));
  const newSlots = assignSortSlots(
    chosen.map((s) => s.id),
    slotById,
  );
  const updates = chosen.map((s) =>
    supabase
      .from("services")
      .update({
        sort_order: newSlots.get(s.id) ?? s.sort_order,
        ...(dayLabel ? { day: dayLabel } : {}),
      })
      .eq("id", s.id),
  );
  const results = await Promise.all(updates);
  const writeErr = results.find((r) => r.error);
  if (writeErr?.error) return { error: writeErr.error.message };

  revalidatePath("/");
  revalidatePath("/map");
  return {
    ok: true,
    stops: chosen.length,
    created: (inserted ?? []).length,
    skippedCustomers,
  };
}
