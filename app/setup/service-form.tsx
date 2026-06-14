"use client";

import { useState, useTransition } from "react";
import { ChevronLeft } from "lucide-react";
import type { Service, Day, Interval } from "@/lib/types";
import { DAYS, INTERVALS, SERVICE_TYPES } from "@/lib/constants";
import { saveService, type ServiceInput } from "./actions";

const inp =
  "w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-green-500";
const chip = (active: boolean) =>
  `px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
    active ? "bg-green-600 text-white" : "bg-stone-100 text-stone-500"
  }`;

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-bold uppercase tracking-wide text-stone-400 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

export function ServiceForm({
  initial,
  customerId,
  customerName,
  onClose,
}: {
  initial: Service | null;
  customerId: string;
  customerName: string;
  onClose: () => void;
}) {
  const [type, setType] = useState(initial?.service_type ?? "Mow");
  const [price, setPrice] = useState(
    initial?.price != null ? String(initial.price) : "",
  );
  const [day, setDay] = useState<Day | null>(initial?.day ?? null);
  const [interval, setInterval] = useState<Interval>(
    initial?.interval ?? "Weekly",
  );
  const [minutes, setMinutes] = useState(
    String(initial?.service_minutes ?? 30),
  );
  const [anchor, setAnchor] = useState(initial?.anchor_date ?? "");
  const [winStart, setWinStart] = useState(initial?.window_start ?? "");
  const [winEnd, setWinEnd] = useState(initial?.window_end ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isCustomType = !SERVICE_TYPES.includes(
    type as (typeof SERVICE_TYPES)[number],
  );

  function submit() {
    setError(null);
    const payload: ServiceInput = {
      id: initial?.id,
      customer_id: customerId,
      service_type: type.trim() || "Mow",
      price: price === "" ? null : Number(price),
      day,
      interval,
      anchor_date: interval === "Weekly" ? null : anchor || null,
      service_minutes: Number(minutes) || 30,
      window_start: winStart || null,
      window_end: winEnd || null,
    };
    startTransition(async () => {
      const res = await saveService(payload);
      if (res.error) {
        setError(res.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <button onClick={onClose} className="text-stone-400">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="font-extrabold uppercase tracking-tight">
            {initial ? "Edit service" : "New service"}
          </span>
          <span className="w-6" />
        </div>
        <p className="text-center text-sm text-stone-400 mb-4">{customerName}</p>

        <Field label="Service type">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {SERVICE_TYPES.map((t) => (
              <button key={t} onClick={() => setType(t)} className={chip(type === t)}>
                {t}
              </button>
            ))}
            <button
              onClick={() => setType(isCustomType ? type : "")}
              className={chip(isCustomType)}
            >
              Custom
            </button>
          </div>
          {isCustomType && (
            <input
              className={inp}
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="Service type"
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Price ($)">
            <input
              type="number"
              inputMode="decimal"
              className={inp}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="95"
            />
          </Field>
          <Field label="Est. minutes">
            <input
              type="number"
              inputMode="numeric"
              className={inp}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="30"
            />
          </Field>
        </div>

        <Field label="Service day">
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => (
              <button
                key={d}
                onClick={() => setDay(day === d ? null : d)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                  day === d ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-500"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Frequency">
          <div className="flex flex-wrap gap-1.5">
            {INTERVALS.map((o) => (
              <button
                key={o}
                onClick={() => setInterval(o)}
                className={chip(interval === o)}
              >
                {o}
              </button>
            ))}
          </div>
        </Field>

        {interval !== "Weekly" && (
          <Field label="Cadence anchor date (optional)">
            <input
              type="date"
              className={inp}
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Field label="Window start (optional)">
            <input
              type="time"
              className={inp}
              value={winStart}
              onChange={(e) => setWinStart(e.target.value)}
            />
          </Field>
          <Field label="Window end (optional)">
            <input
              type="time"
              className={inp}
              value={winEnd}
              onChange={(e) => setWinEnd(e.target.value)}
            />
          </Field>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
            {error}
          </div>
        )}

        <button
          disabled={pending}
          onClick={submit}
          className="w-full py-3 rounded-xl font-bold uppercase tracking-wide bg-green-600 text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : initial ? "Save changes" : "Add service"}
        </button>
      </div>
    </div>
  );
}
