"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, Phone, Pause } from "lucide-react";
import type { Customer } from "@/lib/types";
import { saveCustomer, type CustomerInput } from "./actions";

const inp =
  "w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-green-500";

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

export function CustomerForm({
  initial,
  onClose,
}: {
  initial: Customer | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [city, setCity] = useState(initial?.city ?? "Painesville");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [gate, setGate] = useState(initial?.gate_code ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [meetFirst, setMeetFirst] = useState(initial?.meet_first ?? false);
  const [hold, setHold] = useState(initial?.hold_until ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    const payload: CustomerInput = {
      id: initial?.id,
      name: name.trim(),
      address: address.trim() || null,
      city: city.trim() || null,
      phone: phone.trim() || null,
      gate_code: gate.trim() || null,
      notes: notes.trim() || null,
      meet_first: meetFirst,
      hold_until: hold || null,
    };
    startTransition(async () => {
      const res = await saveCustomer(payload);
      if (res.error) {
        setError(res.error);
        return;
      }
      onClose();
    });
  }

  const valid = name.trim().length > 0;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <button onClick={onClose} className="text-stone-400">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="font-extrabold uppercase tracking-tight">
            {initial ? "Edit customer" : "New customer"}
          </span>
          <span className="w-6" />
        </div>

        <Field label="Name">
          <input
            className={inp}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jesse Carlson"
          />
        </Field>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <Field label="Address">
              <input
                className={inp}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="11660 Jamie Dr"
              />
            </Field>
          </div>
          <Field label="City">
            <input
              className={inp}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Concord"
            />
          </Field>
        </div>

        <Field label="Phone (optional)">
          <input
            className={inp}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(440) 555-0142"
          />
        </Field>

        <Field label="Gate code (optional)">
          <input
            className={inp}
            value={gate}
            onChange={(e) => setGate(e.target.value)}
            placeholder="2480"
          />
        </Field>

        <Field label="Standing instructions (optional)">
          <textarea
            rows={2}
            className={inp}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Blow off deck each time; weedwhack ditch…"
          />
        </Field>

        <Field label="Hold until (optional)">
          <div className="flex items-center gap-2">
            <Pause className="w-4 h-4 text-stone-400 shrink-0" />
            <input
              type="date"
              className={inp}
              value={hold}
              onChange={(e) => setHold(e.target.value)}
            />
          </div>
        </Field>

        <button
          onClick={() => setMeetFirst((v) => !v)}
          className={`w-full mb-3 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${
            meetFirst ? "bg-amber-200 text-amber-900" : "bg-stone-100 text-stone-500"
          }`}
        >
          <Phone className="w-4 h-4" /> Text Katy before first cut
        </button>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
            {error}
          </div>
        )}

        <button
          disabled={!valid || pending}
          onClick={submit}
          className={`w-full py-3 rounded-xl font-bold uppercase tracking-wide ${
            valid && !pending
              ? "bg-green-600 text-white"
              : "bg-stone-100 text-stone-300"
          }`}
        >
          {pending
            ? "Saving…"
            : initial
              ? "Save changes"
              : "Add customer"}
        </button>
        <p className="text-xs text-stone-400 text-center mt-3">
          Saving geocodes the address for route optimization.
        </p>
      </div>
    </div>
  );
}
