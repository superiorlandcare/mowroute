"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";

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
