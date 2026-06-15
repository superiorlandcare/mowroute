// OpenRouteService /optimization (VROOM) client — server-only (spec §10).
// Single-vehicle TSP with optional time windows. Degrades gracefully: any
// failure (no key, unreachable, ORS error, no usable stops) returns an error
// the caller surfaces, never throwing. ORS uses [lng, lat] (spec §10 gotcha).

export interface OptimizeStop {
  serviceId: string;
  lng: number;
  lat: number;
  serviceMinutes: number;
  windowStart: string | null; // "HH:MM[:SS]"
  windowEnd: string | null;
}

export interface OptimizeResult {
  orderedServiceIds: string[]; // assigned stops, in optimized visiting order
  unassignedServiceIds: string[]; // ORS couldn't fit (e.g. infeasible window)
}

export type OptimizeOutcome =
  | { ok: true; result: OptimizeResult }
  | { ok: false; error: string };

// Epoch seconds for a "HH:MM[:SS]" wall-clock time on a given YYYY-MM-DD.
// Built in UTC; the vehicle window and job windows use the same construction, so
// VROOM's relative comparisons stay consistent regardless of server timezone.
function epochOn(dayISO: string, hms: string): number {
  const [y, m, d] = dayISO.split("-").map(Number);
  const [hh, mm = 0, ss = 0] = hms.split(":").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d, hh, mm, ss) / 1000);
}

export async function optimizeRoute(
  stops: OptimizeStop[],
  dayISO: string,
): Promise<OptimizeOutcome> {
  const key = process.env.ORS_API_KEY;
  if (!key) return { ok: false, error: "Route optimization isn't configured (no ORS key)." };
  if (stops.length === 0) {
    return { ok: false, error: "No geocoded stops to optimize." };
  }

  // Depot: shop is both start and end of every route (env-configured). If unset,
  // fall back to an open TSP (no fixed start/end) so the button still works.
  const depotLat = Number(process.env.DEPOT_LAT);
  const depotLng = Number(process.env.DEPOT_LNG);
  const hasDepot = Number.isFinite(depotLat) && Number.isFinite(depotLng);

  const workStart = process.env.WORKDAY_START; // "HH:MM"
  const workEnd = process.env.WORKDAY_END;
  const hasWorkday = !!workStart && !!workEnd;

  // VROOM ids must be positive integers; map them back to service uuids.
  const idToService = new Map<number, string>();
  const jobs = stops.map((s, idx) => {
    const id = idx + 1;
    idToService.set(id, s.serviceId);
    const job: Record<string, unknown> = {
      id,
      location: [s.lng, s.lat],
      service: Math.max(0, Math.round(s.serviceMinutes * 60)),
    };
    if (s.windowStart && s.windowEnd) {
      job.time_windows = [
        [epochOn(dayISO, s.windowStart), epochOn(dayISO, s.windowEnd)],
      ];
    }
    return job;
  });

  const vehicle: Record<string, unknown> = { id: 1, profile: "driving-car" };
  if (hasDepot) {
    vehicle.start = [depotLng, depotLat];
    vehicle.end = [depotLng, depotLat];
  }
  if (hasWorkday) {
    vehicle.time_window = [
      epochOn(dayISO, workStart as string),
      epochOn(dayISO, workEnd as string),
    ];
  }

  try {
    const res = await fetch("https://api.openrouteservice.org/optimization", {
      method: "POST",
      headers: {
        Authorization: key,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ jobs, vehicles: [vehicle] }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      return { ok: false, error: `Optimizer error (HTTP ${res.status}).` };
    }

    const data = await res.json();
    const steps: { type?: string; id?: number }[] = data?.routes?.[0]?.steps ?? [];
    const orderedServiceIds = steps
      .filter((s) => s.type === "job" && typeof s.id === "number")
      .map((s) => idToService.get(s.id as number))
      .filter((v): v is string => !!v);

    const unassignedServiceIds = ((data?.unassigned ?? []) as { id?: number }[])
      .map((u) => (typeof u.id === "number" ? idToService.get(u.id) : undefined))
      .filter((v): v is string => !!v);

    if (orderedServiceIds.length === 0) {
      return { ok: false, error: "Optimizer returned no route." };
    }

    return { ok: true, result: { orderedServiceIds, unassignedServiceIds } };
  } catch {
    return { ok: false, error: "Couldn't reach the route optimizer. Try again." };
  }
}
