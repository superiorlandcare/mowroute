"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { geocodeAddress } from "@/lib/geocode";
import type { Day, Interval } from "@/lib/types";

export type ActionResult = { error?: string; ok?: boolean };

// Authorization gate for every mutation. RLS is the backstop, but we fail fast
// here with a clean message. Returns the Supabase server client when admin.
async function adminClient() {
  const { profile } = await getSessionProfile();
  if (profile?.role !== "admin") {
    return { error: "Not authorized." as string, supabase: null };
  }
  return { error: undefined, supabase: await createClient() };
}



// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export interface CustomerInput {
  id?: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  gate_code: string | null;
  notes: string | null;
  meet_first: boolean;
  hold_until: string | null;
  // Manual coordinate override (geocode escape hatch). When coords_manual is
  // true, lat/lng are used as-is and geocoding is skipped.
  coords_manual: boolean;
  lat: number | null;
  lng: number | null;
}

export async function saveCustomer(input: CustomerInput): Promise<ActionResult> {
  const { error, supabase } = await adminClient();
  if (error || !supabase) return { error };

  const name = input.name?.trim();
  if (!name) return { error: "Customer name is required." };

  // Two location paths:
  // 1. Manual override — admin pinned the spot by hand (ORS couldn't). Use the
  //    coords as-is and DON'T geocode, so a later edit never clobbers the pin.
  // 2. Auto — geocode on save (spec §10), keeping only a confident match;
  //    weak/empty results store null coords → the "Not geocoded" flag.
  let coords: { lat: number | null; lng: number | null; coords_manual: boolean };
  if (input.coords_manual) {
    const { lat, lng } = input;
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      Number.isNaN(lat) ||
      Number.isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return {
        error:
          "Manual location needs a valid latitude (−90…90) and longitude (−180…180).",
      };
    }
    coords = { lat, lng, coords_manual: true };
  } else {
    // Only a confident match is stored; weak/coarse coords stay null so the
    // customer gets the "Not geocoded" flag instead of a junk pin.
    const geo = await geocodeAddress(input.address, input.city, "OH");
    const trusted = geo.quality === "ok";
    coords = {
      lat: trusted ? geo.lat : null,
      lng: trusted ? geo.lng : null,
      coords_manual: false,
    };
  }

  const row = {
    name,
    address: input.address,
    city: input.city,
    phone: input.phone,
    gate_code: input.gate_code,
    notes: input.notes,
    meet_first: input.meet_first,
    hold_until: input.hold_until,
    ...coords,
  };

  const res = input.id
    ? await supabase.from("customers").update(row).eq("id", input.id)
    : await supabase.from("customers").insert(row);

  if (res.error) return { error: res.error.message };
  revalidatePath("/setup");
  return { ok: true };
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  const { error, supabase } = await adminClient();
  if (error || !supabase) return { error };

  // Cascades to services + visits (FK on delete cascade, spec §4).
  const res = await supabase.from("customers").delete().eq("id", id);
  if (res.error) return { error: res.error.message };
  revalidatePath("/setup");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export interface ServiceInput {
  id?: string;
  customer_id: string;
  service_type: string;
  price: number | null;
  day: Day | null;
  interval: Interval;
  anchor_date: string | null;
  service_minutes: number;
  window_start: string | null;
  window_end: string | null;
}

export async function saveService(input: ServiceInput): Promise<ActionResult> {
  const { error, supabase } = await adminClient();
  if (error || !supabase) return { error };

  if (!input.customer_id) return { error: "Missing customer." };
  const serviceType = input.service_type?.trim() || "Mow";

  const base = {
    customer_id: input.customer_id,
    service_type: serviceType,
    price: input.price,
    day: input.day,
    interval: input.interval,
    anchor_date: input.anchor_date,
    service_minutes: input.service_minutes,
    window_start: input.window_start,
    window_end: input.window_end,
  };

  if (input.id) {
    const res = await supabase.from("services").update(base).eq("id", input.id);
    if (res.error) return { error: res.error.message };
  } else {
    // Append to the end of the route order (spec §4 sort_order).
    const { data: maxRow } = await supabase
      .from("services")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sort_order = (maxRow?.sort_order ?? 0) + 1;

    const res = await supabase.from("services").insert({ ...base, sort_order });
    if (res.error) return { error: res.error.message };
  }

  revalidatePath("/setup");
  return { ok: true };
}

export async function deleteService(id: string): Promise<ActionResult> {
  const { error, supabase } = await adminClient();
  if (error || !supabase) return { error };

  const res = await supabase.from("services").delete().eq("id", id);
  if (res.error) return { error: res.error.message };
  revalidatePath("/setup");
  return { ok: true };
}

// Swap a service's sort_order with its neighbour within the same customer.
export async function reorderService(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const { error, supabase } = await adminClient();
  if (error || !supabase) return { error };

  const { data: service } = await supabase
    .from("services")
    .select("id, customer_id, sort_order")
    .eq("id", id)
    .single();
  if (!service) return { error: "Service not found." };

  const { data: siblings } = await supabase
    .from("services")
    .select("id, sort_order")
    .eq("customer_id", service.customer_id)
    .order("sort_order");

  const list = siblings ?? [];
  const idx = list.findIndex((s) => s.id === id);
  const swapWith = direction === "up" ? list[idx - 1] : list[idx + 1];
  if (idx === -1 || !swapWith) return { ok: true }; // already at the edge

  await Promise.all([
    supabase
      .from("services")
      .update({ sort_order: swapWith.sort_order })
      .eq("id", id),
    supabase
      .from("services")
      .update({ sort_order: service.sort_order })
      .eq("id", swapWith.id),
  ]);

  revalidatePath("/setup");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Crew accounts (service-role; no public signup — spec §3, §8)
// ---------------------------------------------------------------------------

export async function addCrew(input: {
  full_name: string;
  email: string;
  password: string;
}): Promise<ActionResult> {
  const { error } = await adminClient();
  if (error) return { error };

  const full_name = input.full_name?.trim();
  const email = input.email?.trim().toLowerCase();
  const password = input.password ?? "";
  if (!full_name || !email) return { error: "Name and email are required." };
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  }

  const { data, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (createErr) return { error: createErr.message };

  const { error: profileErr } = await admin.from("profiles").insert({
    id: data.user.id,
    full_name,
    role: "crew",
  });
  if (profileErr) return { error: profileErr.message };

  revalidatePath("/setup");
  return { ok: true };
}

export async function setProfileActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const { error, supabase } = await adminClient();
  if (error || !supabase) return { error };

  const res = await supabase.from("profiles").update({ active }).eq("id", id);
  if (res.error) return { error: res.error.message };
  revalidatePath("/setup");
  return { ok: true };
}
