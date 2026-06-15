"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

// Any signed-in user (crew or admin) works the board. performed_by is the
// logged-in user — attribution is automatic (spec §1). RLS is the backstop.
async function actor() {
  const { user, profile } = await getSessionProfile();
  if (!user || !profile) {
    return { error: "Not signed in." as string, profileId: null, supabase: null };
  }
  return {
    error: undefined,
    profileId: profile.id,
    supabase: await createClient(),
  };
}

export async function completeVisit(visitId: string): Promise<ActionResult> {
  const { error, profileId, supabase } = await actor();
  if (error || !supabase) return { error };

  // Snapshot price + type at completion so billing history never drifts (§9).
  const { data: visit } = await supabase
    .from("visits")
    .select("service_id")
    .eq("id", visitId)
    .single();
  if (!visit) return { error: "Visit not found." };

  const { data: service } = await supabase
    .from("services")
    .select("price, service_type")
    .eq("id", visit.service_id)
    .single();

  const res = await supabase
    .from("visits")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
      performed_by: profileId,
      price_snapshot: service?.price ?? null,
      service_type_snapshot: service?.service_type ?? null,
    })
    .eq("id", visitId);

  if (res.error) return { error: res.error.message };
  revalidatePath("/");
  return { ok: true };
}

export async function skipVisit(
  visitId: string,
  reason: string,
): Promise<ActionResult> {
  const { error, profileId, supabase } = await actor();
  if (error || !supabase) return { error };

  const res = await supabase
    .from("visits")
    .update({
      status: "skipped",
      skip_reason: reason,
      completed_at: new Date().toISOString(),
      performed_by: profileId,
    })
    .eq("id", visitId);

  if (res.error) return { error: res.error.message };
  revalidatePath("/");
  return { ok: true };
}

// Undo a done/skipped visit back to pending. The row persists (never deleted by
// crew, spec §5/§9) — we just clear the operational + billing fields.
export async function undoVisit(visitId: string): Promise<ActionResult> {
  const { error, supabase } = await actor();
  if (error || !supabase) return { error };

  const res = await supabase
    .from("visits")
    .update({
      status: "pending",
      skip_reason: null,
      started_at: null,
      completed_at: null,
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
