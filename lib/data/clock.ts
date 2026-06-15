import { createClient } from "@/lib/supabase/server";
import type { TimeEntry } from "@/lib/types";

// One person currently clocked in (for the admin "who's on the clock" view).
export interface OnClock {
  profile_id: string;
  name: string;
  clock_in: string;
}

export interface ClockState {
  // The signed-in user's open shift, if any (clock_out is null).
  openEntry: Pick<TimeEntry, "id" | "clock_in"> | null;
  // Everyone currently on the clock — admin only (RLS limits crew to own rows).
  onClock: OnClock[];
}

// Clock bar + "who's on the clock" data (spec §8). Time tracking only — NOT the
// attribution source (per-login model; performed_by stays the signed-in user).
export async function getClockState(
  userId: string,
  isAdmin: boolean,
): Promise<ClockState> {
  const supabase = await createClient();

  const { data: open } = await supabase
    .from("time_entries")
    .select("id, clock_in")
    .eq("profile_id", userId)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();

  let onClock: OnClock[] = [];
  if (isAdmin) {
    // RLS lets admin read all time_entries; join names from profiles.
    const { data: rows } = await supabase
      .from("time_entries")
      .select("profile_id, clock_in, profiles(full_name)")
      .is("clock_out", null)
      .order("clock_in", { ascending: true });

    onClock = ((rows ?? []) as unknown as {
      profile_id: string;
      clock_in: string;
      profiles: { full_name: string } | null;
    }[]).map((r) => ({
      profile_id: r.profile_id,
      name: r.profiles?.full_name ?? "—",
      clock_in: r.clock_in,
    }));
  }

  return { openEntry: open ?? null, onClock };
}
