import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

// Current authenticated user + their profile row (role lives here, per spec §3).
export async function getSessionProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null as Profile | null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return { user, profile: (profile as Profile) ?? null };
}

// Require any signed-in user; otherwise bounce to /login.
export async function requireUser() {
  const session = await getSessionProfile();
  if (!session.user) redirect("/login");
  return session;
}

// Require an admin (Katy). Crew are sent back to the Mow board.
export async function requireAdmin() {
  const session = await getSessionProfile();
  if (!session.user) redirect("/login");
  if (session.profile?.role !== "admin") redirect("/");
  return session;
}
