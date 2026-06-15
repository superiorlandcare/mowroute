"use client";

import { useState } from "react";
import Link from "next/link";
import { Tractor, Settings, Receipt, LogOut, Pause } from "lucide-react";
import type { BoardRow, Customer } from "@/lib/types";
import { DAYS, DAY_FULL, STATUS_ORDER } from "@/lib/constants";
import { cycleLabel } from "@/lib/cycle";
import { signOut } from "./actions";
import { StopCard } from "./stop-card";

type Scope = "All" | (typeof DAYS)[number];

export function BoardClient({
  cycleDate,
  rows,
  held,
  performerNames,
  userName,
  isAdmin,
}: {
  cycleDate: string;
  rows: BoardRow[];
  held: Customer[];
  performerNames: Record<string, string>;
  userName: string;
  isAdmin: boolean;
}) {
  const [scope, setScope] = useState<Scope>("All");

  const inScope =
    scope === "All" ? rows : rows.filter((r) => r.service.day === scope);

  const done = inScope.filter((r) => r.visit.status === "done").length;
  const skipped = inScope.filter((r) => r.visit.status === "skipped").length;
  const total = inScope.length;
  const left = total - done - skipped;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const booked = inScope.reduce((sum, r) => sum + (r.service.price ?? 0), 0);

  const sortRows = (list: BoardRow[]) =>
    [...list].sort(
      (a, b) =>
        (STATUS_ORDER[a.visit.status] ?? 0) -
          (STATUS_ORDER[b.visit.status] ?? 0) ||
        a.service.sort_order - b.service.sort_order,
    );

  // Day counts for the chips (whole route, not the current scope).
  const dayCount = (d: string) =>
    rows.filter((r) => r.service.day === d).length;

  return (
    <div className="max-w-md mx-auto pb-28">
      {/* top bar */}
      <div className="bg-stone-900 text-white px-5 pt-6 pb-5 rounded-b-3xl shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Tractor className="w-5 h-5 text-green-400" />
            <span className="font-extrabold uppercase tracking-tight text-sm">
              Route Board
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <>
                <Link
                  href="/setup"
                  className="p-2 rounded-lg bg-stone-800 text-stone-300"
                  aria-label="Setup"
                >
                  <Settings className="w-4 h-4" />
                </Link>
                <Link
                  href="/billing"
                  className="p-2 rounded-lg bg-stone-800 text-stone-300"
                  aria-label="Billing"
                >
                  <Receipt className="w-4 h-4" />
                </Link>
              </>
            )}
            <form action={signOut}>
              <button
                type="submit"
                className="p-2 rounded-lg bg-stone-800 text-stone-300"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="font-mono text-5xl font-extrabold leading-none">
              {done}
              <span className="text-stone-500 text-3xl">/{total}</span>
            </div>
            <div className="text-stone-400 text-xs uppercase tracking-wide mt-1">
              {left} left
              {skipped > 0 && (
                <span className="text-amber-400"> · {skipped} skipped</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-bold text-green-400">
              {pct}%
            </div>
            <div className="font-mono text-sm text-stone-400 mt-1">
              ${booked} booked
            </div>
          </div>
        </div>

        {/* turf-stripe progress */}
        <div className="h-4 rounded-full bg-stone-800 overflow-hidden flex">
          {Array.from({ length: total }).map((_, i) => {
            let cls = "bg-transparent";
            if (i < done) cls = i % 2 ? "bg-green-500" : "bg-green-600";
            else if (i < done + skipped) cls = "bg-amber-400";
            return (
              <div
                key={i}
                className={`flex-1 border-r border-stone-900 transition-colors duration-300 ${cls}`}
              />
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-stone-400 uppercase">
          <span>{cycleLabel(cycleDate)}</span>
          <span>You: {userName}</span>
        </div>
      </div>

      {/* scope chips */}
      <div className="px-5 mt-4 grid grid-cols-6 gap-1.5">
        {(["All", ...DAYS] as Scope[]).map((d) => {
          const count = d === "All" ? rows.length : dayCount(d);
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

      {/* list */}
      <div className="px-5 mt-4">
        {scope === "All" ? (
          <div className="space-y-5">
            {DAYS.map((d) => {
              const items = sortRows(rows.filter((r) => r.service.day === d));
              if (!items.length) return null;
              return (
                <DayGroup
                  key={d}
                  label={DAY_FULL[d]}
                  items={items}
                  performerNames={performerNames}
                />
              );
            })}
            {(() => {
              const noDay = sortRows(rows.filter((r) => !r.service.day));
              return noDay.length ? (
                <DayGroup
                  label="Unscheduled"
                  items={noDay}
                  performerNames={performerNames}
                />
              ) : null;
            })()}
            {rows.length === 0 && <EmptyState />}
          </div>
        ) : (
          <div className="space-y-3">
            {sortRows(inScope).map((r) => (
              <StopCard
                key={r.visit.id}
                row={r}
                performerName={
                  r.visit.performed_by
                    ? (performerNames[r.visit.performed_by] ?? null)
                    : null
                }
              />
            ))}
            {inScope.length === 0 && (
              <div className="text-center text-stone-400 text-sm py-8">
                Nothing scheduled for {DAY_FULL[scope]}.
              </div>
            )}
          </div>
        )}

        {/* held tray */}
        {held.length > 0 && (
          <div className="mt-5 bg-stone-100 border border-dashed border-stone-300 rounded-xl p-3">
            <div className="text-xs font-bold uppercase tracking-wide text-stone-400 mb-1 flex items-center gap-1">
              <Pause className="w-3 h-3" /> On hold
            </div>
            {held.map((c) => (
              <div key={c.id} className="text-sm text-stone-500">
                <span className="font-semibold text-stone-700">{c.name}</span>
                <span className="font-mono"> — until {c.hold_until}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DayGroup({
  label,
  items,
  performerNames,
}: {
  label: string;
  items: BoardRow[];
  performerNames: Record<string, string>;
}) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wide text-stone-400 mb-2 px-1">
        {label}
      </div>
      <div className="space-y-3">
        {items.map((r) => (
          <StopCard
            key={r.visit.id}
            row={r}
            performerName={
              r.visit.performed_by
                ? (performerNames[r.visit.performed_by] ?? null)
                : null
            }
          />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center text-stone-400 text-sm py-10 bg-white rounded-2xl border border-stone-200">
      No stops on the route this week. Add customers + services in Setup.
    </div>
  );
}
