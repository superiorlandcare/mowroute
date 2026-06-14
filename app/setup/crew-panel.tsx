"use client";

import { useState, useTransition } from "react";
import { Users, UserPlus, Plus, ShieldCheck } from "lucide-react";
import type { Profile } from "@/lib/types";
import { addCrew, setProfileActive } from "./actions";

const inp =
  "w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-green-500";

export function CrewPanel({ profiles }: { profiles: Profile[] }) {
  const admins = profiles.filter((p) => p.role === "admin");
  const crew = profiles.filter((p) => p.role === "crew");

  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await addCrew({ full_name: fullName, email, password });
      if (res.error) {
        setError(res.error);
        return;
      }
      setFullName("");
      setEmail("");
      setPassword("");
      setOpen(false);
    });
  }

  function toggleActive(p: Profile) {
    startTransition(async () => {
      await setProfileActive(p.id, !p.active);
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-stone-400" />
          <span className="text-xs font-bold uppercase tracking-wide text-stone-400">
            Crew
          </span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-sm font-bold text-green-700"
        >
          <UserPlus className="w-4 h-4" /> Add
        </button>
      </div>

      <div className="space-y-2">
        {admins.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
              <span className="font-semibold truncate">{p.full_name}</span>
            </div>
            <span className="text-[10px] font-mono uppercase text-green-700 bg-green-100 px-2 py-0.5 rounded">
              admin
            </span>
          </div>
        ))}

        {crew.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2"
          >
            <span
              className={`font-semibold truncate ${
                p.active ? "" : "text-stone-400 line-through"
              }`}
            >
              {p.full_name}
            </span>
            <button
              onClick={() => toggleActive(p)}
              disabled={pending}
              className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-lg transition ${
                p.active
                  ? "bg-stone-100 text-stone-500"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {p.active ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        ))}

        {crew.length === 0 && (
          <div className="text-sm text-stone-400 px-1 py-1">
            No crew accounts yet.
          </div>
        )}
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-stone-200 space-y-2.5">
          <input
            className={inp}
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <input
            className={inp}
            type="email"
            autoCapitalize="none"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={inp}
            type="text"
            placeholder="Temporary password (min 6)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </div>
          )}
          <button
            onClick={submit}
            disabled={pending}
            className="w-full py-2.5 rounded-xl bg-stone-900 text-white font-bold uppercase tracking-wide text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {pending ? "Creating…" : "Create crew account"}
          </button>
          <p className="text-xs text-stone-400">
            Creates a login. Share the email + temporary password with the
            mower; they can change it later.
          </p>
        </div>
      )}
    </div>
  );
}
