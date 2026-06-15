"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Tractor,
  Check,
  SkipForward,
  Undo2,
  MapPin,
  Phone,
  Repeat,
  KeyRound,
  AlertTriangle,
  Pause,
  Settings,
  Receipt,
  LogOut,
} from "lucide-react";
import type { BoardData, BoardItem } from "@/lib/data/board";
import type { Day } from "@/lib/types";
import {
  DAYS,
  DAY_FULL,
  SKIP_REASONS,
  serviceStyle,
  money,
} from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { completeVisit, skipVisit, undoVisit } from "./board-actions";
import { signOut } from "./actions";

type Scope = "All" | Day;

// Status order on the list: pending → in-progress → skipped → done (spec §8).
const STATUS_ORDER: Record<string, number> = {
  pending: 0,
  in_progress: 1,
  skipped: 2,
  done: 3,
};

export function BoardClient({
  data,
  isAdmin,
  userName,
  role,
}: {
  data: BoardData;
  isAdmin: boolean;
  userName: string;
  role: string;
}) {
  const [scope, setScope] = useState<Scope>("All");
  const [hideDone, setHideDone] = useState(false);
  const [live, setLive] = useState(false);
  const router = useRouter();

  const { items, held, cycleMonday } = data;

  // Realtime (spec §6): subscribe to this cycle's `visits` so a complete/skip on
  // one phone shows up on every other within a moment. We use each change only
  // as a trigger to re-fetch the board via the server (router.refresh) — never
  // reading the row payload — so the refreshed data still goes through
  // getBoardData and stays dollar-stripped for crew (role gating intact).
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250); // coalesce bursts
    };

    const channel = supabase
      .channel(`board-visits-${cycleMonday}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "visits",
          filter: `service_date=eq.${cycleMonday}`,
        },
        refresh,
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [cycleMonday, router]);

  // Day focus is a soft filter — "All" shows the whole route grouped by day.
  const inScope = useMemo(
    () => (scope === "All" ? items : items.filter((i) => i.service.day === scope)),
    [items, scope],
  );

  const doneCount = inScope.filter((i) => i.visit.status === "done").length;
  const skippedCount = inScope.filter((i) => i.visit.status === "skipped").length;
  const total = inScope.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const booked = inScope.reduce((sum, i) => sum + (i.service.price ?? 0), 0);

  // Counts per day chip (whole route, unfiltered).
  const dayCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of DAYS) c[d] = items.filter((i) => i.service.day === d).length;
    return c;
  }, [items]);

  const sorted = [...inScope].sort(
    (a, b) =>
      (STATUS_ORDER[a.visit.status] ?? 0) - (STATUS_ORDER[b.visit.status] ?? 0),
  );
  const visible = hideDone
    ? sorted.filter((i) => i.visit.status !== "done")
    : sorted;

  return (
    <>
      {/* Top bar: who's working + admin nav + sign out */}
      <div className="px-5 pt-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tractor className="w-5 h-5 text-green-600" />
          <span className="font-extrabold uppercase tracking-tight text-sm">
            MowRoute
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Link
                href="/setup"
                className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-stone-600"
                aria-label="Setup"
              >
                <Settings className="w-4 h-4" />
              </Link>
              <Link
                href="/billing"
                className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-stone-600"
                aria-label="Billing"
              >
                <Receipt className="w-4 h-4" />
              </Link>
            </>
          )}
          <form action={signOut}>
            <button
              type="submit"
              className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-stone-600"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Scoreboard (spec §8): done/total, percent, $ booked, turf-stripe bar */}
      <div className="px-5 mt-3">
        <div className="bg-stone-900 text-white px-5 pt-5 pb-5 rounded-3xl shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <span className="font-extrabold uppercase tracking-tight text-sm">
              Route Board
            </span>
            <span className="text-[11px] font-mono text-stone-400 uppercase flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  live ? "bg-green-400 animate-pulse" : "bg-stone-600"
                }`}
                aria-hidden
              />
              <span className="sr-only">{live ? "Live" : "Offline"}</span>
              {scope === "All" ? "Whole route" : DAY_FULL[scope]}
            </span>
          </div>
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className="font-mono text-5xl font-extrabold leading-none">
                {doneCount}
                <span className="text-stone-500 text-3xl">/{total}</span>
              </div>
              <div className="text-stone-400 text-xs uppercase tracking-wide mt-1">
                {total - doneCount - skippedCount} left
                {skippedCount > 0 && (
                  <span className="text-amber-400"> · {skippedCount} skipped</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-2xl font-bold text-green-400">
                {pct}%
              </div>
              {/* Revenue is admin-only — crew never see dollars on the board */}
              {isAdmin && (
                <div className="font-mono text-sm text-stone-400 mt-1">
                  ${booked} booked
                </div>
              )}
            </div>
          </div>
          <div className="h-4 rounded-full bg-stone-800 overflow-hidden flex">
            {Array.from({ length: total }).map((_, i) => {
              let cls = "bg-transparent";
              if (i < doneCount) cls = i % 2 ? "bg-green-500" : "bg-green-600";
              else if (i < doneCount + skippedCount) cls = "bg-amber-400";
              return (
                <div
                  key={i}
                  className={`flex-1 border-r border-stone-900 transition-colors duration-300 ${cls}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Soft day focus: whole route by default, optional single-day focus */}
      <div className="px-5 mt-4 grid grid-cols-6 gap-1.5">
        {(["All", ...DAYS] as Scope[]).map((d) => {
          const count = d === "All" ? items.length : dayCounts[d];
          return (
            <button
              key={d}
              onClick={() => setScope(d)}
              className={`py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition ${
                scope === d
                  ? "bg-stone-900 text-white"
                  : "bg-white text-stone-500 border border-stone-200"
              }`}
            >
              {d}
              <div className="font-mono text-[10px] text-stone-400">{count}</div>
            </button>
          );
        })}
      </div>

      <div className="px-5 mt-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-stone-500">
          Working as <span className="text-stone-800">{userName}</span>
          <span className="font-mono text-[11px] text-stone-400 uppercase">
            {" "}
            · {role}
          </span>
        </span>
        <button
          onClick={() => setHideDone((v) => !v)}
          className="text-sm font-semibold text-green-700"
        >
          {hideDone ? "Show done" : "Hide done"}
        </button>
      </div>

      {/* The route list */}
      <div className="px-5 mt-3">
        {scope === "All" ? (
          <div className="space-y-5">
            {DAYS.map((d) => {
              const group = visible.filter((i) => i.service.day === d);
              if (!group.length) return null;
              return (
                <div key={d}>
                  <div className="text-xs font-bold uppercase tracking-wide text-stone-400 mb-2 px-1">
                    {DAY_FULL[d]}
                  </div>
                  <div className="space-y-3">
                    {group.map((i) => (
                      <StopCard key={i.visit.id} item={i} isAdmin={isAdmin} />
                    ))}
                  </div>
                </div>
              );
            })}
            {/* Services with no soft day still belong on the route */}
            {(() => {
              const group = visible.filter((i) => !i.service.day);
              if (!group.length) return null;
              return (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-stone-400 mb-2 px-1">
                    Unscheduled
                  </div>
                  <div className="space-y-3">
                    {group.map((i) => (
                      <StopCard key={i.visit.id} item={i} isAdmin={isAdmin} />
                    ))}
                  </div>
                </div>
              );
            })()}
            {total === 0 && (
              <div className="text-center text-stone-400 text-sm py-8">
                No stops due this cycle.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((i) => (
              <StopCard key={i.visit.id} item={i} isAdmin={isAdmin} />
            ))}
            {total === 0 && (
              <div className="text-center text-stone-400 text-sm py-8">
                Nothing due on {DAY_FULL[scope]}.
              </div>
            )}
          </div>
        )}

        {held.length > 0 && (
          <div className="mt-5 bg-stone-100 border border-dashed border-stone-300 rounded-xl p-3">
            <div className="text-xs font-bold uppercase tracking-wide text-stone-400 mb-1.5 flex items-center gap-1">
              <Pause className="w-3 h-3" /> On hold
            </div>
            <div className="space-y-1">
              {held.map((h) => (
                <div key={h.customer.id} className="text-sm text-stone-500">
                  <span className="font-semibold text-stone-700">
                    {h.customer.name}
                  </span>{" "}
                  — until{" "}
                  <span className="font-mono">{h.customer.hold_until}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function StopCard({ item, isAdmin }: { item: BoardItem; isAdmin: boolean }) {
  const { visit, service, customer, performerName, cadenceUnset } = item;
  const done = visit.status === "done";
  const skipped = visit.status === "skipped";

  const [skipOpen, setSkipOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const tint = done
    ? "bg-green-50 border-green-300"
    : skipped
      ? "bg-amber-50 border-amber-300"
      : "bg-white border-stone-200";

  const onComplete = () =>
    startTransition(async () => {
      await completeVisit(visit.id);
    });
  const onSkip = (reason: string) =>
    startTransition(async () => {
      setSkipOpen(false);
      await skipVisit(visit.id, reason);
    });
  const onUndo = () =>
    startTransition(async () => {
      await undoVisit(visit.id);
    });

  return (
    <div className={`rounded-2xl border p-4 transition ${tint}`}>
      <div className="flex items-start gap-3">
        <button
          onClick={done || skipped ? undefined : onComplete}
          disabled={pending || done || skipped}
          className="flex items-start gap-3 flex-1 min-w-0 text-left active:scale-[0.98] transition disabled:active:scale-100"
        >
          <div
            className={`mt-0.5 w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition ${
              done
                ? "bg-green-600 text-white"
                : skipped
                  ? "bg-amber-400 text-white"
                  : "border-2 border-stone-300 text-transparent"
            }`}
          >
            {skipped ? (
              <SkipForward className="w-4 h-4" strokeWidth={3} />
            ) : (
              <Check className="w-5 h-5" strokeWidth={3} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`font-bold leading-tight ${
                  done
                    ? "text-green-800"
                    : skipped
                      ? "text-amber-900"
                      : "text-stone-900"
                }`}
              >
                {customer.name}
              </span>
              {service.service_type !== "Mow" && (
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${serviceStyle(
                    service.service_type,
                  )}`}
                >
                  {service.service_type}
                </span>
              )}
              {/* Price is admin-only — crew never see dollars on the board */}
              {isAdmin && (
                <span className="font-mono text-sm font-bold text-stone-700">
                  {money(service.price)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-sm text-stone-500 mt-0.5">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {customer.address ?? "No address"}
                {customer.city ? `, ${customer.city}` : ""}
              </span>
            </div>

            {!done && !skipped && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {customer.meet_first && (
                  <span className="inline-flex items-center gap-1 bg-amber-200 text-amber-900 text-xs font-bold px-2 py-0.5 rounded">
                    <Phone className="w-3 h-3" /> Text Katy first
                  </span>
                )}
                {service.interval !== "Weekly" && (
                  <span className="inline-flex items-center gap-1 bg-stone-100 text-stone-500 text-xs px-2 py-0.5 rounded">
                    <Repeat className="w-3 h-3" /> {service.interval}
                  </span>
                )}
                {cadenceUnset && (
                  <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 text-xs font-semibold px-2 py-0.5 rounded">
                    <AlertTriangle className="w-3 h-3" /> Cadence not set
                  </span>
                )}
                {customer.gate_code && (
                  <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs font-mono font-semibold px-2 py-0.5 rounded">
                    <KeyRound className="w-3 h-3" /> {customer.gate_code}
                  </span>
                )}
                {customer.notes && (
                  <span className="inline-flex items-center gap-1 bg-stone-100 text-stone-600 text-xs px-2 py-0.5 rounded">
                    <AlertTriangle className="w-3 h-3" /> {customer.notes}
                  </span>
                )}
              </div>
            )}

            {done && (
              <div className="text-xs font-mono text-green-700 mt-1.5">
                ✓ {performerName ?? "—"}
                {visit.completed_at && (
                  <>
                    {" · "}
                    <Time iso={visit.completed_at} />
                  </>
                )}
              </div>
            )}
            {skipped && (
              <div className="text-xs font-mono text-amber-700 mt-1.5">
                Skipped — {visit.skip_reason} · {performerName ?? "—"}
                {visit.completed_at && (
                  <>
                    {" · "}
                    <Time iso={visit.completed_at} />
                  </>
                )}
              </div>
            )}
          </div>
        </button>

        <div className="flex flex-col gap-2 shrink-0">
          {skipped || done ? (
            <button
              onClick={onUndo}
              disabled={pending}
              className="w-10 h-10 rounded-xl flex items-center justify-center bg-stone-100 text-stone-500 disabled:opacity-50"
              aria-label="Undo"
            >
              <Undo2 className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={() => setSkipOpen((v) => !v)}
              disabled={pending}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition disabled:opacity-50 ${
                skipOpen ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-600"
              }`}
              aria-label="Skip"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {skipOpen && !done && !skipped && (
        <div className="mt-3 pt-3 border-t border-stone-200">
          <div className="text-xs font-bold uppercase tracking-wide text-amber-600 mb-2">
            Why skip?
          </div>
          <div className="flex flex-wrap gap-2">
            {SKIP_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => onSkip(r)}
                disabled={pending}
                className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 text-sm font-semibold active:scale-95 transition disabled:opacity-50"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Render a local time only after mount to avoid SSR/client timezone mismatch.
function Time({ iso }: { iso: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    setText(
      new Date(iso).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      }),
    );
  }, [iso]);
  return <span suppressHydrationWarning>{text}</span>;
}
