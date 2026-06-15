import { requireUser } from "@/lib/auth";
import { getBoardData } from "@/lib/data/board";
import { BoardClient } from "./board-client";

export const metadata = { title: "Board · MowRoute" };

// The Mow board (spec §7) — the default screen for everyone. Crew and admin both
// see and work the route; admin also gets Setup/Billing nav. Auth is enforced
// here (unauth → /login) with RLS as the backstop.
export default async function HomePage() {
  const { user, profile } = await requireUser();
  const isAdmin = profile?.role === "admin";
  const name = profile?.full_name ?? user.email ?? "there";
  const data = await getBoardData();

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <div className="max-w-md mx-auto pb-28">
        <BoardClient
          data={data}
          isAdmin={isAdmin}
          userName={name}
          role={profile?.role ?? "no profile"}
        />
      </div>
    </div>
  );
}
