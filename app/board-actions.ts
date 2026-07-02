"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { isServiceDue, parseISODate, toISODate } from "@/lib/cycle";
import { optimizeRoute, type OptimizeStop } from "@/lib/optimize";
import { DAYS } from "@/lib/constants";

export type ActionResult = { error?: string; ok?: boolean };

// Every board mutation is auth-guarded here (fail fast with a clean message);
// RLS is the backstop (spec §5). Attribution is automatic — the signed-in user
// is stamped as performed_by. Per-login model: each mower works from their own
// phone + login, so the clock bar is shift time-tracking only and does NOT
// override attribution (a deliberate deviation from §8's shared-device wording).
async function authedClient() {
  const { user, profile } = await getSessionProfile();
  if (!user || !profile) {
    return { error: "Not signed in." as string, supabase: null, uid: null };
  }
  return { error: undefined, supabase: await createClient(), uid: profile.id };
}

// Admin-only gate for the optimize action (spec §5: only admin reorders).
async function adminClient() {
  const { profile } = await getSessionProfile();
  if (profile?.role !== "admin") {
    return { error: "Not authorized." as string, supabase: null };
  }
  return { error: undefined, supabase: await createClient() };
}

// Tap → done. Snapshots the price + type at completion so billing history never
// drifts when prices are later edited (spec §9). duration_minutes is filled in
// only if a start was recorded (Start→Done timing arrives in Phase 5).
export async function completeVisit(visitId: string): Promise<ActionResult> {
  const { error, supabase, uid } = await authedClient();
  if (error || !supabase) return { error };

  const { data: visit } = await supabase
    .from("visits")
    .select("service_id, started_at")
    .eq("id", visitId)
    .single();
  if (!visit) return { error: "Visit not found." };

  const { data: service } = await supabase
    .from("services")
    .select("price, service_type")
    .eq("id", visit.service_id)
    .single();

  const now = new Date().toISOString();
  const duration = visit.started_at
    ? Math.max(1, Math.round((Date.parse(now) - Date.parse(visit.started_at)) / 60000))
    : null;

  const res = await supabase
    .from("visits")
    .update({
      status: "done",
      completed_at: now,
      performed_by: uid,
      price_snapshot: service?.price ?? null,
      service_type_snapshot: service?.service_type ?? null,
      duration_minutes: duration,
      skip_reason: null,
    })
    .eq("id", visitId);

  if (res.error) return { error: res.error.message };
  revalidatePath("/");
  return { ok: true };
}

// Skip with a reason + attribution. completed_at carries the action time for
// display; billing only ever counts status='done', so a skipped row is ignored.
export async function skipVisit(
  visitId: string,
  reason: string,
): Promise<ActionResult> {
  const { error, supabase, uid } = await authedClient();
  if (error || !supabase) return { error };

  const res = await supabase
    .from("visits")
    .update({
      status: "skipped",
      skip_reason: reason || "Other",
      completed_at: new Date().toISOString(),
      performed_by: uid,
      price_snapshot: null,
      service_type_snapshot: null,
      duration_minutes: null,
    })
    .eq("id", visitId);

  if (res.error) return { error: res.error.message };
  revalidatePath("/");
  return { ok: true };
}

// Undo a done/skip back to pending, clearing all stamps (incl. the snapshot, so
// no stale billing record lingers).
export async function undoVisit(visitId: string): Promise<ActionResult> {
  const { error, supabase } = await authedClient();
  if (error || !supabase) return { error };

  const res = await supabase
    .from("visits")
    .update({
      status: "pending",
      completed_at: null,
      started_at: null,
      skip_reason: null,
      duration_minutes: null,
      price_snapshot: null,
      service_type_snapshot: null,
      performed_by: null,
    })
    .eq("id", visitId);

  if (res.error) return { error: res.error.message };
  revalidatePath("/");
  return { ok: true };
}

// Start ▶ — arrive on site. Sets started_at + status in_progress so the card
// shows a live timer (spec §8). Optional: a card can still go straight to Done.
// No-op unless the visit is currently pending.
export async function startVisit(visitId: string): Promise<ActionResult> {
  const { error, supabase } = await authedClient();
  if (error || !supabase) return { error };

  const res = await supabase
    .from("visits")
    .update({ status: "in_progress", started_at: new Date().toISOString() })
    .eq("id", visitId)
    .eq("status", "pending");

  if (res.error) return { error: res.error.message };
  revalidatePath("/");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Clock in / out — shift time tracking (spec §8). Writes time_entries for the
// signed-in user only (RLS: profile_id = auth.uid()).
// ---------------------------------------------------------------------------

export async function clockIn(): Promise<ActionResult> {
  const { error, supabase, uid } = await authedClient();
  if (error || !supabase || !uid) return { error };

  // Idempotent: if already on the clock, do nothing.
  const { data: open } = await supabase
    .from("time_entries")
    .select("id")
    .eq("profile_id", uid)
    .is("clock_out", null)
    .maybeSingle();
  if (open) return { ok: true };

  const res = await supabase.from("time_entries").insert({ profile_id: uid });
  if (res.error) return { error: res.error.message };
  revalidatePath("/");
  return { ok: true };
}

export async function clockOut(): Promise<ActionResult> {
  const { error, supabase, uid } = await authedClient();
  if (error || !supabase || !uid) return { error };

  const res = await supabase
    .from("time_entries")
    .update({ clock_out: new Date().toISOString() })
    .eq("profile_id", uid)
    .is("clock_out", null);

  if (res.error) return { error: res.error.message };
  revalidatePath("/");
  return { ok: true };
}

// Add a crew note to a customer's append-only field log (spec §8). RLS requires
// author_id = auth.uid(); visible to all, updates live (crew_notes realtime).
export async function addCrewNote(
  customerId: string,
  body: string,
): Promise<ActionResult> {
  const { error, supabase, uid } = await authedClient();
  if (error || !supabase || !uid) return { error };

  const text = body.trim();
  if (!text) return { error: "Note can't be empty." };
  if (!customerId) return { error: "Missing customer." };

  const res = await supabase
    .from("crew_notes")
    .insert({ customer_id: customerId, author_id: uid, body: text });

  if (res.error) return { error: res.error.message };
  revalidatePath("/");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Optimize route (spec §10) — admin-only. Reorders ONE soft day's stops into an
// efficient driving order via ORS /optimization (VROOM), writing services.
// sort_order so the board re-sorts. Manual drag in Setup still overrides after.
// Un-geocoded stops are excluded and left in place; the shop is start+end.
// ---------------------------------------------------------------------------

export type OptimizeResultSummary = {
  error?: string;
  ok?: boolean;
  optimized?: number; // stops placed into an order
  skipped?: number; // excluded — no usable coords
  unassigned?: number; // geocoded but ORS couldn't fit (e.g. infeasible window)
};

type DayServiceRow = {
  id: string;
  sort_order: number;
  service_minutes: number;
  window_start: string | null;
  window_end: string | null;
  interval: string;
  anchor_date: string | null;
  customers: {
    active: boolean;
    hold_until: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
};

export async function optimizeDay(
  day: string,
  cycleMonday: string,
): Promise<OptimizeResultSummary> {
  const { error, supabase } = await adminClient();
  if (error || !supabase) return { error };
  if (!DAYS.includes(day as (typeof DAYS)[number])) {
    return { error: "Optimize works on a single focused day." };
  }

  const today = toISODate(new Date());

  const { data: rows } = await supabase
    .from("services")
    .select(
      "id, sort_order, service_minutes, window_start, window_end, interval, anchor_date, customers(active, hold_until, lat, lng)",
    )
    .eq("active", true)
    .eq("day", day);

  const services = (rows ?? []) as unknown as DayServiceRow[];

  // This day's stops that actually belong on the current cycle's route.
  const onRoute = services.filter((s) => {
    const c = s.customers;
    if (!c || !c.active) return false;
    if (c.hold_until && c.hold_until > today) return false; // held
    return isServiceDue(
      { interval: s.interval as never, anchor_date: s.anchor_date },
      cycleMonday,
    );
  });

  const geocoded = onRoute.filter(
    (s) => s.customers?.lat != null && s.customers?.lng != null,
  );
  const skipped = onRoute.length - geocoded.length;

  if (geocoded.length === 0) {
    return {
      error: "No geocoded stops to optimize on this day.",
      optimized: 0,
      skipped,
    };
  }

  const stops: OptimizeStop[] = geocoded.map((s) => ({
    serviceId: s.id,
    lng: s.customers!.lng as number,
    lat: s.customers!.lat as number,
    serviceMinutes: s.service_minutes,
    windowStart: s.window_start,
    windowEnd: s.window_end,
  }));

  // The concrete date of this soft day within the current cycle.
  const dayDate = parseISODate(cycleMonday);
  dayDate.setDate(dayDate.getDate() + DAYS.indexOf(day as (typeof DAYS)[number]));
  const dayISO = toISODate(dayDate);

  // A route plan saved for that date (map builder) overrides the env depot as
  // the route's start/end — routes don't always start/end at the shop.
  const { data: plan } = await supabase
    .from("route_plans")
    .select("start_lat, start_lng, end_lat, end_lng")
    .eq("plan_date", dayISO)
    .maybeSingle();
  const endpoints = {
    start:
      plan?.start_lat != null && plan?.start_lng != null
        ? { lat: plan.start_lat as number, lng: plan.start_lng as number }
        : null,
    end:
      plan?.end_lat != null && plan?.end_lng != null
        ? { lat: plan.end_lat as number, lng: plan.end_lng as number }
        : null,
  };

  const outcome = await optimizeRoute(stops, dayISO, endpoints);
  if (!outcome.ok) return { error: outcome.error, skipped };

  const ordered = outcome.result.orderedServiceIds;

  // Permute only the assigned stops among their OWN existing sort_order slots, so
  // un-geocoded/unassigned stops and other days keep their positions.
  const slotById = new Map(geocoded.map((s) => [s.id, s.sort_order]));
  const slots = ordered
    .map((id) => slotById.get(id))
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);

  const updates = ordered.map((id, i) =>
    supabase.from("services").update({ sort_order: slots[i] }).eq("id", id),
  );
  const results = await Promise.all(updates);
  const writeErr = results.find((r) => r.error);
  if (writeErr?.error) return { error: writeErr.error.message };

  revalidatePath("/");
  return {
    ok: true,
    optimized: ordered.length,
    skipped,
    unassigned: outcome.result.unassignedServiceIds.length,
  };
}
