"use client";

import { useState, useTransition } from "react";
import {
  Check,
  SkipForward,
  Navigation,
  Undo2,
  MapPin,
  KeyRound,
  Phone,
  Repeat,
  AlertTriangle,
  Dog,
  ExternalLink,
} from "lucide-react";
import type { BoardRow } from "@/lib/types";
import { serviceStyle, money, SKIP_REASONS } from "@/lib/constants";
import { mapLinks } from "@/lib/maps";
import { completeVisit, skipVisit, undoVisit } from "./board-actions";

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function StopCard({
  row,
  performerName,
}: {
  row: BoardRow;
  performerName: string | null;
}) {
  const { visit, service, customer } = row;
  const done = visit.status === "done";
  const skipped = visit.status === "skipped";
  const [navOpen, setNavOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const links = mapLinks(customer);

  const tint = done
    ? "bg-green-50 border-green-300"
    : skipped
      ? "bg-amber-50 border-amber-300"
      : "bg-white border-stone-200";

  function onTapBody() {
    if (pending) return;
    startTransition(async () => {
      if (done) await undoVisit(visit.id);
      else await completeVisit(visit.id);
    });
  }

  function onSkip(reason: string) {
    setSkipOpen(false);
    startTransition(async () => {
      await skipVisit(visit.id, reason);
    });
  }

  function onUndo() {
    startTransition(async () => {
      await undoVisit(visit.id);
    });
  }

  return (
    <div className={`rounded-2xl border p-4 transition ${tint}`}>
      <div className="flex items-start gap-3">
        <button
          onClick={onTapBody}
          disabled={pending}
          className="flex items-start gap-3 flex-1 min-w-0 text-left active:scale-[0.98] transition"
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
              <span className="font-mono text-sm font-bold text-stone-700">
                {money(service.price)}
              </span>
            </div>

            <div className="flex items-center gap-1 text-sm text-stone-500 mt-0.5">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {customer.address}
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
                {customer.gate_code && (
                  <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs font-mono font-semibold px-2 py-0.5 rounded">
                    <KeyRound className="w-3 h-3" /> {customer.gate_code}
                  </span>
                )}
                {customer.notes && (
                  <span className="inline-flex items-center gap-1 bg-stone-100 text-stone-600 text-xs px-2 py-0.5 rounded">
                    {/dog/i.test(customer.notes) ? (
                      <Dog className="w-3 h-3" />
                    ) : (
                      <AlertTriangle className="w-3 h-3" />
                    )}
                    {customer.notes}
                  </span>
                )}
              </div>
            )}

            {done && (
              <div
                className="text-xs font-mono text-green-700 mt-1.5"
                suppressHydrationWarning
              >
                ✓ {performerName ?? "—"}
                {visit.completed_at ? ` · ${fmtTime(visit.completed_at)}` : ""}
              </div>
            )}
            {skipped && (
              <div
                className="text-xs font-mono text-amber-700 mt-1.5"
                suppressHydrationWarning
              >
                Skipped — {visit.skip_reason} · {performerName ?? "—"}
                {visit.completed_at ? ` · ${fmtTime(visit.completed_at)}` : ""}
              </div>
            )}
          </div>
        </button>

        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={() => {
              setNavOpen((v) => !v);
              setSkipOpen(false);
            }}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
              navOpen ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600"
            }`}
            aria-label="Directions"
          >
            <Navigation className="w-5 h-5" />
          </button>

          {done || skipped ? (
            <button
              onClick={onUndo}
              disabled={pending}
              className="w-10 h-10 rounded-xl flex items-center justify-center bg-stone-100 text-stone-500"
              aria-label="Undo"
            >
              <Undo2 className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={() => {
                setSkipOpen((v) => !v);
                setNavOpen(false);
              }}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
                skipOpen ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-600"
              }`}
              aria-label="Skip"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {navOpen && (
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-stone-200">
          <NavLink href={links.waze} label="Waze" />
          <NavLink href={links.google} label="Google" />
          <NavLink href={links.apple} label="Apple" />
        </div>
      )}

      {skipOpen && (
        <div className="mt-3 pt-3 border-t border-stone-200">
          <div className="text-xs font-bold uppercase tracking-wide text-amber-600 mb-2">
            Why skip?
          </div>
          <div className="flex flex-wrap gap-2">
            {SKIP_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => onSkip(r)}
                className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 text-sm font-semibold active:scale-95 transition"
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

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-stone-100 text-stone-700 text-sm font-bold active:scale-[0.97] transition"
    >
      {label} <ExternalLink className="w-3.5 h-3.5 opacity-60" />
    </a>
  );
}
