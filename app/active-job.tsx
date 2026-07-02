"use client";

// The running job's permanent home on the board: a sticky bar pinned to the
// top of the viewport while scrolling, expanding into a full-screen glanceable
// view. Built for the field — huge tap targets, high contrast, mono timers.
//
// UI only: Done goes through the existing completeVisit action, and elapsed
// time is always computed from the stored started_at timestamp (the `now` tick
// just re-renders), so the timer survives phone lock / PWA backgrounding.

import { useRef, useState, useTransition } from "react";
import {
  Check,
  ChevronDown,
  KeyRound,
  MapPin,
  Navigation,
  Phone,
} from "lucide-react";
import type { BoardItem } from "@/lib/data/board";
import { mapLinks } from "@/lib/map-links";
import { completeVisit } from "./board-actions";

// "12:05" for a running on-site timer; rolls to "1:02:05" past an hour.
export function fmtTimer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function ActiveJob({
  item,
  runningCount,
  upNext,
  now,
}: {
  item: BoardItem; // the most recently started in_progress visit
  runningCount: number; // all in_progress visits on the board
  upNext: BoardItem[]; // next 1–2 pending stops in the current route order
  now: number | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const { visit, customer } = item;
  const elapsed =
    now != null && visit.started_at
      ? fmtTimer(now - Date.parse(visit.started_at))
      : "–:––";

  const done = () =>
    startTransition(async () => {
      setExpanded(false);
      await completeVisit(visit.id);
    });

  return (
    <>
      {/* Sticky bar — pinned below the notch, above the scrolling list */}
      <div className="sticky top-[env(safe-area-inset-top,0px)] z-30 px-5 pt-2 pb-1">
        <div className="bg-green-600 rounded-2xl shadow-lg shadow-green-600/30 p-2.5 pl-4 flex items-center gap-3">
          <button
            onClick={() => setExpanded(true)}
            className="flex-1 min-w-0 flex items-center gap-3 text-left active:scale-[0.99] transition"
            aria-label="Open active job"
          >
            <span
              className="w-2.5 h-2.5 rounded-full bg-white animate-pulse shrink-0"
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block font-extrabold text-white leading-tight truncate">
                {customer.name}
              </span>
              <span
                className="block font-mono text-sm text-green-100"
                suppressHydrationWarning
              >
                {elapsed}
                {runningCount > 1 && ` · +${runningCount - 1} running`}
              </span>
            </span>
          </button>
          <button
            onClick={done}
            disabled={pending}
            className="h-14 px-5 rounded-xl bg-white text-green-700 font-extrabold uppercase tracking-wide flex items-center gap-1.5 shrink-0 active:scale-[0.97] transition disabled:opacity-60"
          >
            <Check className="w-5 h-5" strokeWidth={3} /> Done
          </button>
        </div>
      </div>

      {expanded && (
        <FullScreenJob
          item={item}
          upNext={upNext}
          elapsed={elapsed}
          pending={pending}
          onDone={done}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  );
}

function FullScreenJob({
  item,
  upNext,
  elapsed,
  pending,
  onDone,
  onClose,
}: {
  item: BoardItem;
  upNext: BoardItem[];
  elapsed: string;
  pending: boolean;
  onDone: () => void;
  onClose: () => void;
}) {
  const { customer } = item;
  const hasCoords = customer.lat != null && customer.lng != null;
  const links = hasCoords
    ? mapLinks(customer.lat as number, customer.lng as number)
    : null;

  // Swipe-down on the top region collapses back to the board.
  const [dragY, setDragY] = useState(0);
  const touchStartY = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    setDragY(Math.max(0, e.touches[0].clientY - touchStartY.current));
  };
  const onTouchEnd = () => {
    if (dragY > 100) onClose();
    touchStartY.current = null;
    setDragY(0);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900 text-white flex flex-col"
      style={{
        transform: dragY ? `translateY(${dragY}px)` : undefined,
        transition: dragY ? "none" : "transform 200ms ease-out",
      }}
    >
      {/* Drag/close header */}
      <div
        className="pt-[max(0.5rem,env(safe-area-inset-top))] px-4 pb-2 touch-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="w-12 h-1.5 rounded-full bg-stone-700 mx-auto" aria-hidden />
        <div className="flex items-center justify-between mt-2">
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            On the job
          </span>
          <button
            onClick={onClose}
            aria-label="Back to board"
            className="w-12 h-12 rounded-2xl bg-stone-800 flex items-center justify-center text-stone-300"
          >
            <ChevronDown className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Huge glanceable timer + who/where */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0">
        <div
          className="font-mono font-extrabold leading-none text-[clamp(4rem,22vw,6.5rem)] tabular-nums"
          suppressHydrationWarning
        >
          {elapsed}
        </div>
        <div className="text-2xl font-extrabold text-center mt-4 leading-tight">
          {customer.name}
        </div>
        {(customer.address || customer.city) && (
          <div className="flex items-center gap-1.5 text-stone-400 mt-1.5 text-center">
            <MapPin className="w-4 h-4 shrink-0" />
            <span>
              {customer.address ?? ""}
              {customer.city ? `${customer.address ? ", " : ""}${customer.city}` : ""}
            </span>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-2 mt-3">
          {customer.meet_first && (
            <span className="inline-flex items-center gap-1 bg-amber-400 text-stone-900 text-sm font-bold px-3 py-1.5 rounded-lg">
              <Phone className="w-4 h-4" /> Text Katy first
            </span>
          )}
          {customer.gate_code && (
            <span className="inline-flex items-center gap-1 bg-stone-800 text-amber-300 text-sm font-mono font-bold px-3 py-1.5 rounded-lg">
              <KeyRound className="w-4 h-4" /> {customer.gate_code}
            </span>
          )}
        </div>
      </div>

      {/* Actions + up next */}
      <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-3">
        {links && (
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["Google", links.google],
                ["Apple", links.apple],
                ["Waze", links.waze],
              ] as const
            ).map(([label, href]) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 py-4 rounded-2xl bg-stone-800 text-blue-400 font-bold active:scale-[0.97] transition"
              >
                <Navigation className="w-4 h-4" /> {label}
              </a>
            ))}
          </div>
        )}

        <button
          onClick={onDone}
          disabled={pending}
          className="w-full py-5 rounded-2xl bg-green-600 text-white text-xl font-extrabold uppercase tracking-wide flex items-center justify-center gap-2 active:scale-[0.99] transition disabled:opacity-60"
        >
          <Check className="w-6 h-6" strokeWidth={3} />
          {pending ? "Saving…" : "Done"}
        </button>

        {upNext.length > 0 && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-stone-500 mb-1.5">
              Up next
            </div>
            <div className="space-y-1.5">
              {upNext.map((n) => (
                <div
                  key={n.visit.id}
                  className="bg-stone-800 rounded-xl px-3.5 py-2.5 flex items-center gap-2"
                >
                  <span className="font-semibold truncate">
                    {n.customer.name}
                  </span>
                  <span className="text-sm text-stone-400 truncate">
                    {n.customer.address ?? ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
