import { requireUser } from "@/lib/auth";
import { getBoard } from "@/lib/data/board";
import { BoardClient } from "./board-client";

// The Mow board (spec §7/§8): the whole route for the current week, grouped by
// soft day labels. Any signed-in user (crew or admin) works it.
export default async function HomePage() {
  const { user, profile } = await requireUser();
  const { cycleDate, rows, held, performerNames } = await getBoard();

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <BoardClient
        cycleDate={cycleDate}
        rows={rows}
        held={held}
        performerNames={performerNames}
        userName={profile?.full_name ?? user.email ?? "—"}
        isAdmin={profile?.role === "admin"}
      />
    </div>
  );
}
