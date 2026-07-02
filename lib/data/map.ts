import { createClient } from "@/lib/supabase/server";
import type { Day, Interval } from "@/lib/types";

// One property on the map: the customer + a light summary of its active
// services (type/day/cadence for badges — deliberately NO price fields, so the
// payload is crew-safe without any per-role stripping).
export interface MapService {
  id: string;
  service_type: string;
  day: Day | null;
  interval: Interval;
}

export interface MapCustomer {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  hold_until: string | null;
  services: MapService[];
}

// A saved start/end for a specific date, used to prefill the route builder so
// re-editing a day's route doesn't silently reset a custom start/end to the shop.
export interface MapRoutePlan {
  plan_date: string;
  start_lat: number | null;
  start_lng: number | null;
  start_label: string | null;
  end_lat: number | null;
  end_lng: number | null;
  end_label: string | null;
}

export async function getMapData(): Promise<{
  customers: MapCustomer[];
  plans: MapRoutePlan[];
}> {
  const supabase = await createClient();

  const [{ data }, plansRes] = await Promise.all([
    supabase
      .from("customers")
      .select(
        "id, name, address, city, lat, lng, hold_until, services(id, service_type, day, interval, active)",
      )
      .eq("active", true)
      .order("name"),
    // Tolerates migration 0004 not being run yet (error → no plans).
    supabase
      .from("route_plans")
      .select(
        "plan_date, start_lat, start_lng, start_label, end_lat, end_lng, end_label",
      ),
  ]);

  type Row = Omit<MapCustomer, "services"> & {
    services: (MapService & { active: boolean })[];
  };

  const customers = ((data ?? []) as Row[]).map((c) => ({
    ...c,
    services: (c.services ?? [])
      .filter((s) => s.active)
      .map(({ id, service_type, day, interval }) => ({
        id,
        service_type,
        day,
        interval,
      })),
  }));

  return { customers, plans: (plansRes.data ?? []) as MapRoutePlan[] };
}
