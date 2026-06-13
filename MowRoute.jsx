import React, { useState, useEffect, useCallback } from "react";
import {
  Check, Clock, MapPin, Plus, Trash2, Pencil, KeyRound, Dog, AlertTriangle,
  RotateCcw, Users, Tractor, X, ChevronLeft, Navigation, ExternalLink,
  SkipForward, Undo2, StickyNote, Phone, Repeat, Pause, Scissors, Receipt, ChevronLeft as ChevL, ChevronRight, Play
} from "lucide-react";

const KEY = "mowops-state-v5";
const hasStore = typeof window !== "undefined" && window.storage;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DAY_FULL = { All: "Whole route", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SKIP_REASONS = ["Locked gate", "Dog out", "Too wet", "Customer asked", "Equipment issue", "Other"];

// ---- seed: real customers from the 2026 route, reshaped into the new model ----
const SEED = {
  stops: [
    // --- Monday: apartments cluster (Painesville) ---
    { id: "s1", customer: "Apartments", address: "251 Walnut Ave", city: "Painesville", service: "Mow", price: null, phone: "", gate: "", note: "", day: "Mon", interval: "Weekly", meetFirst: false, hold: null },
    { id: "s2", customer: "Apartments", address: "45 High St", city: "Painesville", service: "Mow", price: null, phone: "", gate: "", note: "", day: "Mon", interval: "Weekly", meetFirst: false, hold: null },
    { id: "s3", customer: "Johnny (Paninis)", address: "7005 Sturbridge Dr", city: "Painesville", service: "Mow", price: 65, phone: "", gate: "", note: "", day: "Mon", interval: "Weekly", meetFirst: false, hold: null },
    { id: "s4", customer: "Jerry Birk", address: "8789 Dusty Ln", city: "Painesville", service: "Mow", price: 60, phone: "", gate: "", note: "Free cuts in May; check coming for wk of June 22", day: "Mon", interval: "Weekly", meetFirst: false, hold: "On hold until week of June 22" },

    // --- Tuesday: Danvers + Mentor ---
    { id: "s5", customer: "Mary Ann Morec", address: "10231 Danvers Dr", city: "Painesville", service: "Mow", price: 55, phone: "", gate: "", note: "", day: "Tue", interval: "Weekly", meetFirst: false, hold: null },
    { id: "s6", customer: "Bill Bremwour", address: "10247 Danvers Dr", city: "Painesville", service: "Mow", price: 55, phone: "", gate: "", note: "Wants it cut very short — couldn't tell last time", day: "Tue", interval: "Weekly", meetFirst: false, hold: null },
    { id: "s7", customer: "Gregory Pike", address: "7611 Allegheny Dr", city: "Mentor", service: "Mow", price: 48, phone: "", gate: "", note: "", day: "Tue", interval: "Biweekly", meetFirst: false, hold: null },
    { id: "s8", customer: "Chris Martin", address: "9486 Hoose Rd", city: "Mentor", service: "Mow", price: 60, phone: "", gate: "", note: "Ruts from wet ground — take turns slower, mow diagonal lines", day: "Tue", interval: "Biweekly", meetFirst: false, hold: null },
    { id: "s9", customer: "Bill Querry", address: "8495 Warren Rd", city: "Painesville", service: "Mow", price: 100, phone: "", gate: "", note: "Mow field + front/back/sides of driveway. Weedwhack ditch each time", day: "Tue", interval: "Biweekly", meetFirst: true, hold: null },

    // --- Wednesday: Chardon ---
    { id: "s10", customer: "Jennifer Henson", address: "10645 Fincherie Dr", city: "Chardon", service: "Mow", price: 115, phone: "", gate: "", note: "", day: "Wed", interval: "Weekly", meetFirst: false, hold: null },
    { id: "s11", customer: "Ron Hale", address: "145 North St", city: "Chardon", service: "Mow", price: 40, phone: "", gate: "", note: "", day: "Wed", interval: "Weekly", meetFirst: false, hold: null },
    { id: "s12", customer: "Cady Just", address: "12248 Scarlett Way", city: "Painesville", service: "Mow", price: 67, phone: "", gate: "", note: "", day: "Wed", interval: "Weekly", meetFirst: false, hold: null },

    // --- Thursday: Concord Hambden + multi-service ---
    { id: "s13", customer: "Kathleen Pierce", address: "11786 Concord Hambden Rd", city: "Painesville", service: "Mow", price: 65, phone: "", gate: "", note: "", day: "Thu", interval: "Weekly", meetFirst: false, hold: null },
    { id: "s14", customer: "Leah Stevenson", address: "11741 Concord Hambden Rd", city: "Painesville", service: "Mow", price: 65, phone: "", gate: "", note: "", day: "Thu", interval: "Weekly", meetFirst: false, hold: null },
    { id: "s15", customer: "Jesse Carlson", address: "11660 Jamie Dr", city: "Concord", service: "Mow", price: 95, phone: "", gate: "", note: "", day: "Thu", interval: "Weekly", meetFirst: false, hold: null },
    { id: "s16", customer: "Jesse Carlson", address: "11660 Jamie Dr", city: "Concord", service: "Ditch cut", price: 145, phone: "", gate: "", note: "First cut when weeds top 2 ft, then once a month", day: "Thu", interval: "Monthly", meetFirst: false, hold: null },
    { id: "s17", customer: "Kelly Hrabak", address: "7641 Kenneth Dr", city: "Painesville", service: "Mow", price: 55, phone: "", gate: "", note: "Weedwhack backyard", day: "Thu", interval: "Weekly", meetFirst: false, hold: null },
    { id: "s18", customer: "Kelly Hrabak", address: "7641 Kenneth Dr", city: "Painesville", service: "Treatment", price: 0, phone: "", gate: "", note: "Dandelion treatment — every other month", day: "Thu", interval: "Every other month", meetFirst: false, hold: null },
  ],
  crew: [
    { id: "c1", name: "Jake" },
    { id: "c2", name: "Marco" },
  ],
  billing: makeBilling(),
  invoices: {},
};

// seed a few months of completed cuts so Katy's monthly billing view is populated
function makeBilling() {
  const at = (y, m, d) => new Date(y, m - 1, d, 14, 0).getTime();
  const recs = [];
  let n = 0;
  const log = (stopId, customer, service, price, dates) =>
    dates.forEach((dt) => recs.push({ id: `b${n++}`, stopId, customer, service, price, at: at(...dt), by: n % 2 ? "Jake" : "Marco" }));

  const WK_MAY = [[2026, 5, 5], [2026, 5, 12], [2026, 5, 19], [2026, 5, 26]];
  const WK_JUN = [[2026, 6, 2], [2026, 6, 9]];
  const BW_MAY = [[2026, 5, 5], [2026, 5, 19]];
  const BW_JUN = [[2026, 6, 2]];

  // weekly mows
  log("s5", "Mary Ann Morec", "Mow", 55, [...WK_MAY, ...WK_JUN]);
  log("s6", "Bill Bremwour", "Mow", 55, [...WK_MAY, ...WK_JUN]);
  log("s3", "Johnny (Paninis)", "Mow", 65, [...WK_MAY, ...WK_JUN]);
  log("s10", "Jennifer Henson", "Mow", 115, [...WK_MAY, ...WK_JUN]);
  log("s13", "Kathleen Pierce", "Mow", 65, [...WK_MAY, ...WK_JUN]);
  log("s14", "Leah Stevenson", "Mow", 65, [...WK_MAY, ...WK_JUN]);
  log("s15", "Jesse Carlson", "Mow", 95, [...WK_MAY, ...WK_JUN]);
  log("s17", "Kelly Hrabak", "Mow", 55, [...WK_MAY, ...WK_JUN]);
  // biweekly mows
  log("s7", "Gregory Pike", "Mow", 48, [...BW_MAY, ...BW_JUN]);
  log("s8", "Chris Martin", "Mow", 60, [...BW_MAY, ...BW_JUN]);
  // monthly ditch cut
  log("s16", "Jesse Carlson", "Ditch cut", 145, [[2026, 5, 15], [2026, 6, 10]]);
  return recs;
}

function uid() { return Math.random().toString(36).slice(2, 9); }
function fmtTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function fmtElapsed(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
function sameMonth(ts, y, m) { const d = new Date(ts); return d.getFullYear() === y && d.getMonth() === m; }
function mdShort(ts) { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; }
function fmtClock(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
function fmtMin(ms) { return `${Math.max(1, Math.round(ms / 60000))} min`; }
function mapLinks(address, city) {
  const q = encodeURIComponent([address, city, "OH"].filter(Boolean).join(", "));
  return {
    waze: `https://www.waze.com/ul?q=${q}&navigate=yes`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    apple: `https://maps.apple.com/?daddr=${q}`,
  };
}
function money(p) { return p == null ? "—" : `$${p}`; }

const SERVICE_STYLE = {
  "Mow": "bg-green-100 text-green-700",
  "Ditch cut": "bg-orange-100 text-orange-700",
  "Treatment": "bg-violet-100 text-violet-700",
};

export default function MowRoute() {
  const [loading, setLoading] = useState(true);
  const [stops, setStops] = useState([]);
  const [crew, setCrew] = useState([]);
  const [view, setView] = useState("mower");
  const [day, setDay] = useState("All");
  const [activeMowerId, setActiveMowerId] = useState(null);
  const [clockInAt, setClockInAt] = useState(null);
  const [hideDone, setHideDone] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [newCrew, setNewCrew] = useState("");
  const [billing, setBilling] = useState([]);
  const [invoices, setInvoices] = useState({});

  useEffect(() => {
    (async () => {
      let data = null;
      if (hasStore) {
        try { const r = await window.storage.get(KEY, true); if (r && r.value) data = JSON.parse(r.value); } catch (e) {}
      }
      if (!data) data = SEED;
      setStops(data.stops || SEED.stops);
      setCrew(data.crew || SEED.crew);
      setBilling(data.billing || SEED.billing);
      setInvoices(data.invoices || {});
      setLoading(false);
    })();
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const persist = useCallback(async (s, c, b, inv) => {
    if (!hasStore) return;
    try { await window.storage.set(KEY, JSON.stringify({ stops: s, crew: c, billing: b, invoices: inv }), true); } catch (e) { console.error(e); }
  }, []);
  const update = useCallback((s, c, b, inv) => {
    const ns = s ?? stops, nc = c ?? crew, nb = b ?? billing, ni = inv ?? invoices;
    setStops(ns); setCrew(nc); setBilling(nb); setInvoices(ni);
    persist(ns, nc, nb, ni);
  }, [persist, stops, crew, billing, invoices]);

  const activeMower = crew.find((c) => c.id === activeMowerId);

  // whole route by default; a day can be focused
  const isAll = day === "All";
  const dayStops = stops.filter((s) => !s.hold && (isAll || s.day === day));
  const heldToday = stops.filter((s) => s.hold && (isAll || s.day === day));
  const doneCount = dayStops.filter((s) => s.status === "done").length;
  const skippedCount = dayStops.filter((s) => s.status === "skipped").length;
  const total = dayStops.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const revenue = dayStops.reduce((sum, s) => sum + (s.price || 0), 0);

  function startStop(id) {
    update(stops.map((s) => s.id === id && s.status === "pending" && !s.startedAt ? { ...s, startedAt: Date.now() } : s), crew);
  }
  function toggleDone(id) {
    const stop = stops.find((s) => s.id === id);
    if (!stop) return;
    const nowTs = Date.now();
    if (stop.status === "done") {
      // un-complete: clear timing + drop the most recent ledger entry for this stop
      const newStops = stops.map((s) => s.id === id ? { ...s, status: "pending", by: null, at: null, reason: null, startedAt: null } : s);
      const last = billing.filter((b) => b.stopId === id).sort((a, b) => b.at - a.at)[0];
      const newBilling = last ? billing.filter((b) => b.id !== last.id) : billing;
      update(newStops, crew, newBilling);
    } else {
      // complete: stamp end time, compute duration if started, write the billing record
      const who = activeMower ? activeMower.name : "—";
      const durationMs = stop.startedAt ? nowTs - stop.startedAt : null;
      const newStops = stops.map((s) => s.id === id ? { ...s, status: "done", by: who, at: nowTs, reason: null } : s);
      const rec = { id: uid(), stopId: stop.id, customer: stop.customer, service: stop.service, price: stop.price, at: nowTs, by: who, durationMs };
      update(newStops, crew, [...billing, rec]);
    }
  }
  function setInvoiceStatus(key, status) {
    update(stops, crew, billing, { ...invoices, [key]: status });
  }
  function skipStop(id, reason) {
    update(stops.map((s) => s.id === id ? { ...s, status: "skipped", by: activeMower ? activeMower.name : "—", at: Date.now(), reason } : s), crew);
  }
  function undoStatus(id) {
    update(stops.map((s) => s.id === id ? { ...s, status: "pending", by: null, at: null, reason: null } : s), crew);
  }
  function addCrewNote(id, text) {
    const note = { id: uid(), text, by: activeMower ? activeMower.name : "—", at: Date.now() };
    update(stops.map((s) => s.id === id ? { ...s, crewNotes: [...(s.crewNotes || []), note] } : s), crew);
  }
  function resetDay() {
    const inScope = (s) => !s.hold && (day === "All" || s.day === day);
    update(stops.map((s) => inScope(s) ? { ...s, status: "pending", by: null, at: null, reason: null } : s), crew);
  }
  function saveStop(form) {
    let next;
    if (form.id) next = stops.map((s) => s.id === form.id ? { ...s, ...form } : s);
    else next = [...stops, { ...form, id: uid(), status: "pending", by: null, at: null }];
    update(next, crew);
    setShowForm(false); setEditing(null);
  }
  function deleteStop(id) { update(stops.filter((s) => s.id !== id), crew); }
  function addCrew() {
    const name = newCrew.trim(); if (!name) return;
    update(stops, [...crew, { id: uid(), name }]); setNewCrew("");
  }
  function removeCrew(id) {
    if (activeMowerId === id) { setActiveMowerId(null); setClockInAt(null); }
    update(stops, crew.filter((c) => c.id !== id));
  }

  if (loading) {
    return <div className="min-h-screen bg-stone-100 flex items-center justify-center"><div className="text-stone-500 font-mono text-sm">Loading route…</div></div>;
  }

  const order = { pending: 0, skipped: 1, done: 2 };
  const sorted = [...dayStops].sort((a, b) => (order[a.status] || 0) - (order[b.status] || 0));
  const visible = hideDone ? sorted.filter((s) => s.status !== "done") : sorted;

  // counts per day for the selector
  const dayCounts = Object.fromEntries(DAYS.map((d) => [d, stops.filter((s) => s.day === d && !s.hold).length]));
  const allCount = stops.filter((s) => !s.hold).length;

  return (
    <div className="min-h-screen bg-stone-100 font-sans text-stone-900">
      <div className="max-w-md mx-auto pb-28">

        {/* scoreboard */}
        <div className="bg-stone-900 text-white px-5 pt-6 pb-5 rounded-b-3xl shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Tractor className="w-5 h-5 text-green-400" />
              <span className="font-extrabold uppercase tracking-tight text-sm">Route Board</span>
            </div>
            <div className="text-[11px] font-mono text-stone-400 uppercase">{DAY_FULL[day]}</div>
          </div>
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className="font-mono text-5xl font-extrabold leading-none">{doneCount}<span className="text-stone-500 text-3xl">/{total}</span></div>
              <div className="text-stone-400 text-xs uppercase tracking-wide mt-1">
                {total - doneCount - skippedCount} left
                {skippedCount > 0 && <span className="text-amber-400"> · {skippedCount} skipped</span>}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-2xl font-bold text-green-400">{pct}%</div>
              <div className="font-mono text-sm text-stone-400 mt-1">${revenue} booked</div>
            </div>
          </div>
          <div className="h-4 rounded-full bg-stone-800 overflow-hidden flex">
            {Array.from({ length: total }).map((_, i) => {
              let cls = "bg-transparent";
              if (i < doneCount) cls = i % 2 ? "bg-green-500" : "bg-green-600";
              else if (i < doneCount + skippedCount) cls = "bg-amber-400";
              return <div key={i} className={`flex-1 border-r border-stone-900 transition-colors duration-300 ${cls}`} />;
            })}
          </div>
        </div>

        {/* scope selector: whole route by default, optional day focus (Mow view only) */}
        {view === "mower" && (
          <div className="px-5 mt-4 grid grid-cols-6 gap-1.5">
            {["All", ...DAYS].map((d) => {
              const c = d === "All" ? allCount : dayCounts[d];
              return (
                <button key={d} onClick={() => setDay(d)}
                  className={`py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition ${day === d ? "bg-stone-900 text-white" : "bg-white text-stone-500 border border-stone-200"}`}>
                  {d}
                  <div className="font-mono text-[10px] text-stone-400">{c}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* view toggle */}
        <div className="px-5 mt-3 flex gap-2">
          <button onClick={() => setView("mower")} className={`flex-1 py-2 rounded-xl text-sm font-bold uppercase tracking-wide transition ${view === "mower" ? "bg-green-600 text-white shadow" : "bg-white text-stone-500 border border-stone-200"}`}>Mow</button>
          <button onClick={() => setView("admin")} className={`flex-1 py-2 rounded-xl text-sm font-bold uppercase tracking-wide transition ${view === "admin" ? "bg-stone-900 text-white shadow" : "bg-white text-stone-500 border border-stone-200"}`}>Setup</button>
          <button onClick={() => setView("billing")} className={`flex-1 py-2 rounded-xl text-sm font-bold uppercase tracking-wide transition ${view === "billing" ? "bg-stone-900 text-white shadow" : "bg-white text-stone-500 border border-stone-200"}`}>Billing</button>
        </div>

        {view === "mower" ? (
          <MowerView {...{ crew, activeMowerId, setActiveMowerId, clockInAt, setClockInAt, now, visible, isAll, hideDone, setHideDone, doneCount, skippedCount, total, heldToday, toggleDone, startStop, skipStop, undoStatus, addCrewNote }} />
        ) : view === "admin" ? (
          <AdminView {...{ stops, crew, day, newCrew, setNewCrew, addCrew, removeCrew, onAdd: () => { setEditing(null); setShowForm(true); }, onEdit: (s) => { setEditing(s); setShowForm(true); }, onDelete: deleteStop, resetDay }} />
        ) : (
          <BillingView billing={billing} invoices={invoices} onSetStatus={setInvoiceStatus} />
        )}
      </div>

      {showForm && <StopForm initial={editing} defaultDay={day} onCancel={() => { setShowForm(false); setEditing(null); }} onSave={saveStop} />}
    </div>
  );
}

function MowerView({ crew, activeMowerId, setActiveMowerId, clockInAt, setClockInAt, now, visible, isAll, hideDone, setHideDone, doneCount, skippedCount, total, heldToday, toggleDone, startStop, skipStop, undoStatus, addCrewNote }) {
  const activeMower = crew.find((c) => c.id === activeMowerId);
  const card = (s) => <StopCard key={s.id} s={s} now={now} onTap={() => toggleDone(s.id)} onStart={() => startStop(s.id)} onSkip={(r) => skipStop(s.id, r)} onUndo={() => undoStatus(s.id)} onAddNote={(t) => addCrewNote(s.id, t)} />;
  return (
    <div className="px-5 mt-4">
      <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-4">
        {!clockInAt ? (
          <>
            <div className="text-xs font-bold uppercase tracking-wide text-stone-400 mb-2">Who's mowing?</div>
            <div className="flex flex-wrap gap-2 mb-3">
              {crew.map((c) => (
                <button key={c.id} onClick={() => setActiveMowerId(c.id)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${activeMowerId === c.id ? "bg-green-600 text-white" : "bg-stone-100 text-stone-600"}`}>{c.name}</button>
              ))}
            </div>
            <button disabled={!activeMowerId} onClick={() => setClockInAt(Date.now())} className={`w-full py-3 rounded-xl font-bold uppercase tracking-wide flex items-center justify-center gap-2 ${activeMowerId ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-300"}`}><Clock className="w-4 h-4" /> Clock in</button>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-green-600">On the clock</div>
              <div className="font-bold text-lg">{activeMower ? activeMower.name : "—"}</div>
              <div className="font-mono text-sm text-stone-500">{fmtElapsed(now - clockInAt)} elapsed</div>
            </div>
            <button onClick={() => setClockInAt(null)} className="px-4 py-2 rounded-xl bg-amber-400 text-stone-900 font-bold text-sm">Clock out</button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-sm font-semibold text-stone-500">{doneCount} done · {total - doneCount - skippedCount} left{skippedCount > 0 && <span className="text-amber-600"> · {skippedCount} skipped</span>}</span>
        <button onClick={() => setHideDone((v) => !v)} className="text-sm font-semibold text-green-700">{hideDone ? "Show done" : "Hide done"}</button>
      </div>

      {isAll ? (
        <div className="space-y-5">
          {DAYS.map((d) => {
            const items = visible.filter((s) => s.day === d);
            if (!items.length) return null;
            return (
              <div key={d}>
                <div className="text-xs font-bold uppercase tracking-wide text-stone-400 mb-2 px-1">{DAY_FULL[d]}</div>
                <div className="space-y-3">{items.map(card)}</div>
              </div>
            );
          })}
          {total === 0 && <div className="text-center text-stone-400 text-sm py-8">No stops on the route yet.</div>}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(card)}
          {total === 0 && <div className="text-center text-stone-400 text-sm py-8">No stops scheduled this day.</div>}
        </div>
      )}

      {heldToday.length > 0 && (
        <div className="mt-4 bg-stone-100 border border-dashed border-stone-300 rounded-xl p-3">
          <div className="text-xs font-bold uppercase tracking-wide text-stone-400 mb-1 flex items-center gap-1"><Pause className="w-3 h-3" /> On hold</div>
          {heldToday.map((s) => (
            <div key={s.id} className="text-sm text-stone-500"><span className="font-semibold text-stone-700">{s.customer}</span> — {s.hold}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function StopCard({ s, now, onTap, onStart, onSkip, onUndo, onAddNote }) {
  const done = s.status === "done", skipped = s.status === "skipped";
  const running = !done && !skipped && !!s.startedAt;
  const [navOpen, setNavOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const links = mapLinks(s.address, s.city);
  const crewNotes = s.crewNotes || [];
  const submitNote = () => { const t = draft.trim(); if (!t) return; onAddNote(t); setDraft(""); };
  const tint = done ? "bg-green-50 border-green-300" : skipped ? "bg-amber-50 border-amber-300" : running ? "bg-green-50 border-green-400" : "bg-white border-stone-200";

  return (
    <div className={`rounded-2xl border p-4 transition ${tint}`}>
      <div className="flex items-start gap-3">
        <button onClick={onTap} className="flex items-start gap-3 flex-1 min-w-0 text-left active:scale-[0.98] transition">
          <div className={`mt-0.5 w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition ${done ? "bg-green-600 text-white" : skipped ? "bg-amber-400 text-white" : running ? "border-2 border-green-500 text-green-600" : "border-2 border-stone-300 text-transparent"}`}>
            {skipped ? <SkipForward className="w-4 h-4" strokeWidth={3} /> : <Check className="w-5 h-5" strokeWidth={3} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-bold leading-tight ${done ? "text-green-800" : skipped ? "text-amber-900" : "text-stone-900"}`}>{s.customer}</span>
              {s.service !== "Mow" && <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${SERVICE_STYLE[s.service] || "bg-stone-100 text-stone-600"}`}>{s.service}</span>}
              <span className="font-mono text-sm font-bold text-stone-700">{money(s.price)}</span>
            </div>
            <div className="flex items-center gap-1 text-sm text-stone-500 mt-0.5">
              <MapPin className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{s.address}{s.city ? `, ${s.city}` : ""}</span>
            </div>
            {!done && !skipped && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {running && <span className="inline-flex items-center gap-1 bg-green-600 text-white text-xs font-mono font-bold px-2 py-0.5 rounded"><Clock className="w-3 h-3" /> {fmtClock(now - s.startedAt)}</span>}
                {s.meetFirst && <span className="inline-flex items-center gap-1 bg-amber-200 text-amber-900 text-xs font-bold px-2 py-0.5 rounded"><Phone className="w-3 h-3" /> Text Katy first</span>}
                {s.interval !== "Weekly" && <span className="inline-flex items-center gap-1 bg-stone-100 text-stone-500 text-xs px-2 py-0.5 rounded"><Repeat className="w-3 h-3" /> {s.interval}</span>}
                {s.gate && <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs font-mono font-semibold px-2 py-0.5 rounded"><KeyRound className="w-3 h-3" /> {s.gate}</span>}
                {s.note && <span className="inline-flex items-center gap-1 bg-stone-100 text-stone-600 text-xs px-2 py-0.5 rounded">{/dog/i.test(s.note) ? <Dog className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}{s.note}</span>}
              </div>
            )}
            {done && <div className="text-xs font-mono text-green-700 mt-1.5">✓ {s.by} · {s.startedAt ? `${fmtTime(s.startedAt)}–${fmtTime(s.at)} · ${fmtMin(s.at - s.startedAt)}` : fmtTime(s.at)}</div>}
            {skipped && <div className="text-xs font-mono text-amber-700 mt-1.5">Skipped — {s.reason} · {s.by} · {fmtTime(s.at)}</div>}
          </div>
        </button>

        <div className="flex flex-col gap-2 shrink-0">
          <button onClick={() => { setNavOpen((v) => !v); setSkipOpen(false); setNotesOpen(false); }} className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${navOpen ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600"}`} aria-label="Directions"><Navigation className="w-5 h-5" /></button>
          <button onClick={() => { setNotesOpen((v) => !v); setNavOpen(false); setSkipOpen(false); }} className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition ${notesOpen ? "bg-stone-700 text-white" : "bg-stone-100 text-stone-600"}`} aria-label="Notes">
            <StickyNote className="w-5 h-5" />
            {crewNotes.length > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-stone-700 text-white text-[10px] font-bold flex items-center justify-center">{crewNotes.length}</span>}
          </button>
          {!done && !skipped && !s.startedAt && (
            <button onClick={onStart} className="w-10 h-10 rounded-xl flex items-center justify-center bg-green-50 text-green-600" aria-label="Start mowing"><Play className="w-5 h-5" /></button>
          )}
          {skipped ? (
            <button onClick={onUndo} className="w-10 h-10 rounded-xl flex items-center justify-center bg-stone-100 text-stone-500" aria-label="Undo"><Undo2 className="w-5 h-5" /></button>
          ) : !done ? (
            <button onClick={() => { setSkipOpen((v) => !v); setNavOpen(false); setNotesOpen(false); }} className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${skipOpen ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-600"}`} aria-label="Skip"><SkipForward className="w-5 h-5" /></button>
          ) : null}
        </div>
      </div>

      {navOpen && (
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-stone-200">
          <NavLink href={links.waze} label="Waze" /><NavLink href={links.google} label="Google" /><NavLink href={links.apple} label="Apple" />
        </div>
      )}
      {skipOpen && (
        <div className="mt-3 pt-3 border-t border-stone-200">
          <div className="text-xs font-bold uppercase tracking-wide text-amber-600 mb-2">Why skip?</div>
          <div className="flex flex-wrap gap-2">
            {SKIP_REASONS.map((r) => <button key={r} onClick={() => { onSkip(r); setSkipOpen(false); }} className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 text-sm font-semibold active:scale-95 transition">{r}</button>)}
          </div>
        </div>
      )}
      {notesOpen && (
        <div className="mt-3 pt-3 border-t border-stone-200">
          <div className="text-xs font-bold uppercase tracking-wide text-stone-400 mb-2">Notes</div>
          {s.note && <div className="text-xs mb-2 bg-amber-50 rounded-lg px-3 py-2"><span className="font-bold text-amber-700 uppercase tracking-wide">Standing · Katy</span><div className="text-stone-700 mt-0.5">{s.note}</div></div>}
          <div className="space-y-1.5 mb-3">
            {crewNotes.length === 0 && <div className="text-sm text-stone-400">No field notes yet.</div>}
            {crewNotes.map((n) => <div key={n.id} className="text-sm bg-stone-50 rounded-lg px-3 py-2"><div className="text-stone-800">{n.text}</div><div className="text-xs font-mono text-stone-400 mt-0.5">{n.by} · {fmtTime(n.at)}</div></div>)}
          </div>
          <div className="flex gap-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitNote()} placeholder="Add a note from the field…" className="flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-green-500" />
            <button onClick={submitNote} disabled={!draft.trim()} className={`px-4 rounded-xl font-bold text-sm ${draft.trim() ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-300"}`}>Add</button>
          </div>
        </div>
      )}
    </div>
  );
}

function NavLink({ href, label }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-stone-100 text-stone-700 text-sm font-bold active:scale-[0.97] transition">{label} <ExternalLink className="w-3.5 h-3.5 opacity-60" /></a>;
}

function AdminView({ stops, crew, day, newCrew, setNewCrew, addCrew, removeCrew, onAdd, onEdit, onDelete, resetDay }) {
  const grouped = DAYS.map((d) => ({ d, items: stops.filter((s) => s.day === d) }));
  return (
    <div className="px-5 mt-4 space-y-5">
      <div className="bg-white rounded-2xl border border-stone-200 p-4">
        <div className="flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-stone-400" /><span className="text-xs font-bold uppercase tracking-wide text-stone-400">Crew</span></div>
        <div className="flex flex-wrap gap-2 mb-3">
          {crew.map((c) => <span key={c.id} className="inline-flex items-center gap-1.5 bg-stone-100 rounded-lg pl-3 pr-1.5 py-1 text-sm font-semibold">{c.name}<button onClick={() => removeCrew(c.id)} className="text-stone-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button></span>)}
        </div>
        <div className="flex gap-2">
          <input value={newCrew} onChange={(e) => setNewCrew(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCrew()} placeholder="Add mower name" className="flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-green-500" />
          <button onClick={addCrew} className="px-4 rounded-xl bg-stone-900 text-white font-bold"><Plus className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold uppercase tracking-wide text-stone-400">Stops by day</span>
        <button onClick={onAdd} className="inline-flex items-center gap-1 text-sm font-bold text-green-700"><Plus className="w-4 h-4" /> Add stop</button>
      </div>

      {grouped.map(({ d, items }) => items.length > 0 && (
        <div key={d}>
          <div className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-2 px-1">{DAY_FULL[d]} · {items.length}</div>
          <div className="space-y-2">
            {items.map((s) => (
              <div key={s.id} className={`rounded-xl border p-3 flex items-center gap-3 ${s.hold ? "bg-stone-100 border-dashed border-stone-300" : "bg-white border-stone-200"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="font-bold truncate">{s.customer}</span>{s.service !== "Mow" && <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${SERVICE_STYLE[s.service]}`}>{s.service}</span>}<span className="font-mono text-sm text-stone-500">{money(s.price)}</span></div>
                  <div className="text-sm text-stone-500 truncate">{s.address}{s.city ? `, ${s.city}` : ""} · {s.interval}</div>
                  {s.hold && <div className="text-xs text-amber-700 mt-0.5">⏸ {s.hold}</div>}
                </div>
                <button onClick={() => onEdit(s)} className="p-2 text-stone-400 hover:text-stone-900"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => onDelete(s.id)} className="p-2 text-stone-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>
      ))}

      <button onClick={resetDay} className="w-full py-3 rounded-2xl border-2 border-dashed border-stone-300 text-stone-500 font-bold uppercase tracking-wide text-sm flex items-center justify-center gap-2"><RotateCcw className="w-4 h-4" /> {day === "All" ? "Reset the whole route" : `Reset ${DAY_FULL[day]}'s checks`}</button>
    </div>
  );
}

const inp = "w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-green-500";
function Field({ label, children }) {
  return <div className="mb-3"><label className="block text-xs font-bold uppercase tracking-wide text-stone-400 mb-1.5">{label}</label>{children}</div>;
}

function StopForm({ initial, defaultDay, onCancel, onSave }) {
  const [f, setF] = useState(initial || { customer: "", address: "", city: "Painesville", service: "Mow", price: "", phone: "", gate: "", note: "", day: defaultDay, interval: "Weekly", meetFirst: false, hold: null });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.customer.trim() && f.address.trim();
  const save = () => onSave({ ...f, price: f.price === "" || f.price == null ? null : Number(f.price) });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={onCancel} className="text-stone-400"><ChevronLeft className="w-6 h-6" /></button>
          <span className="font-extrabold uppercase tracking-tight">{initial ? "Edit stop" : "New stop"}</span><span className="w-6" />
        </div>

        <Field label="Customer"><input className={inp} value={f.customer} onChange={(e) => set("customer", e.target.value)} placeholder="Jesse Carlson" /></Field>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2"><Field label="Address"><input className={inp} value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="11660 Jamie Dr" /></Field></div>
          <Field label="City"><input className={inp} value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="Concord" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Service"><div className="flex flex-wrap gap-1.5">{["Mow", "Ditch cut", "Treatment"].map((o) => <button key={o} onClick={() => set("service", o)} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold ${f.service === o ? "bg-green-600 text-white" : "bg-stone-100 text-stone-500"}`}>{o}</button>)}</div></Field>
          <Field label="Price ($)"><input type="number" className={inp} value={f.price ?? ""} onChange={(e) => set("price", e.target.value)} placeholder="95" /></Field>
        </div>
        <Field label="Phone (optional)"><input className={inp} value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(440) 555-0142" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Service day"><div className="flex flex-wrap gap-1.5">{DAYS.map((d) => <button key={d} onClick={() => set("day", d)} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold ${f.day === d ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-500"}`}>{d}</button>)}</div></Field>
          <Field label="Frequency"><div className="flex flex-wrap gap-1.5">{["Weekly", "Biweekly", "Monthly"].map((o) => <button key={o} onClick={() => set("interval", o)} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold ${f.interval === o ? "bg-green-600 text-white" : "bg-stone-100 text-stone-500"}`}>{o}</button>)}</div></Field>
        </div>
        <Field label="Gate code (optional)"><input className={inp} value={f.gate} onChange={(e) => set("gate", e.target.value)} placeholder="2480" /></Field>
        <Field label="Standing instructions (optional)"><textarea rows={2} className={inp} value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="Blow off deck each time; weedwhack ditch…" /></Field>
        <button onClick={() => set("meetFirst", !f.meetFirst)} className={`w-full mb-3 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${f.meetFirst ? "bg-amber-200 text-amber-900" : "bg-stone-100 text-stone-500"}`}><Phone className="w-4 h-4" /> Text Katy before first cut</button>

        <button disabled={!valid} onClick={save} className={`w-full py-3 rounded-xl font-bold uppercase tracking-wide ${valid ? "bg-green-600 text-white" : "bg-stone-100 text-stone-300"}`}>{initial ? "Save changes" : "Add stop"}</button>
      </div>
    </div>
  );
}

const PAY_STATES = [
  { k: "none", label: "Not sent", chip: "bg-stone-100 text-stone-500", tint: "bg-white border-stone-200" },
  { k: "sent", label: "Invoice sent", chip: "bg-amber-100 text-amber-700", tint: "bg-amber-50 border-amber-200" },
  { k: "paid", label: "Paid", chip: "bg-green-100 text-green-700", tint: "bg-green-50 border-green-200" },
];

function BillingView({ billing, invoices, onSetStatus }) {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const shift = (delta) => setYm(({ y, m }) => {
    let nm = m + delta, ny = y;
    if (nm < 0) { nm = 11; ny -= 1; }
    if (nm > 11) { nm = 0; ny += 1; }
    return { y: ny, m: nm };
  });

  const monthRecs = billing.filter((r) => sameMonth(r.at, ym.y, ym.m));

  // group by customer; each customer's services are sub-lines, one invoice covers the month
  const byCustomer = {};
  monthRecs.forEach((r) => {
    if (!byCustomer[r.customer]) byCustomer[r.customer] = { customer: r.customer, services: {}, total: 0 };
    const c = byCustomer[r.customer];
    if (!c.services[r.service]) c.services[r.service] = { service: r.service, price: r.price, dates: [], total: 0 };
    c.services[r.service].dates.push(r.at);
    c.services[r.service].total += r.price || 0;
    c.total += r.price || 0;
  });
  const accounts = Object.values(byCustomer).sort((a, b) => a.customer.localeCompare(b.customer));
  accounts.forEach((a) => Object.values(a.services).forEach((s) => s.dates.sort((x, y) => x - y)));

  const keyOf = (customer) => `${customer}|${ym.y}|${ym.m}`;
  const statusOf = (customer) => invoices[keyOf(customer)] || "none";

  const grandTotal = accounts.reduce((s, a) => s + a.total, 0);
  const paidTotal = accounts.filter((a) => statusOf(a.customer) === "paid").reduce((s, a) => s + a.total, 0);
  const openTotal = grandTotal - paidTotal;
  const totalCuts = monthRecs.length;

  return (
    <div className="px-5 mt-4 space-y-4">
      <div className="flex items-center justify-between bg-white rounded-2xl border border-stone-200 p-2">
        <button onClick={() => shift(-1)} className="w-10 h-10 rounded-xl flex items-center justify-center text-stone-500 hover:bg-stone-100"><ChevL className="w-5 h-5" /></button>
        <div className="font-extrabold uppercase tracking-tight">{MONTHS[ym.m]} {ym.y}</div>
        <button onClick={() => shift(1)} className="w-10 h-10 rounded-xl flex items-center justify-center text-stone-500 hover:bg-stone-100"><ChevronRight className="w-5 h-5" /></button>
      </div>

      <div className="bg-stone-900 text-white rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-stone-400 flex items-center gap-1"><Receipt className="w-3.5 h-3.5" /> Billed this month</div>
            <div className="font-mono text-4xl font-extrabold mt-1">${grandTotal}</div>
          </div>
          <div className="text-right font-mono text-sm text-stone-400">{totalCuts} cuts<br />{accounts.length} accounts</div>
        </div>
        <div className="flex gap-2 mt-4">
          <div className="flex-1 bg-stone-800 rounded-xl px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-amber-400 font-bold">Open</div><div className="font-mono font-bold">${openTotal}</div></div>
          <div className="flex-1 bg-stone-800 rounded-xl px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-green-400 font-bold">Paid</div><div className="font-mono font-bold">${paidTotal}</div></div>
        </div>
      </div>

      <div className="space-y-3">
        {accounts.map((a, i) => {
          const status = statusOf(a.customer);
          const meta = PAY_STATES.find((p) => p.k === status);
          const svc = Object.values(a.services);
          return (
            <div key={i} className={`rounded-2xl border p-4 ${meta.tint}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="font-bold">{a.customer}</span>
                <span className="font-mono font-bold text-lg shrink-0">${a.total}</span>
              </div>

              {svc.map((l, j) => {
                const uniform = l.dates.length > 0 && l.price != null;
                return (
                  <div key={j} className="mb-2">
                    <div className="flex items-center gap-2 text-sm">
                      {l.service !== "Mow"
                        ? <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${SERVICE_STYLE[l.service] || "bg-stone-100 text-stone-600"}`}>{l.service}</span>
                        : <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Mow</span>}
                      <span className="font-mono text-stone-500">{l.dates.length} {l.dates.length === 1 ? "cut" : "cuts"}{uniform && ` × $${l.price}`}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {l.dates.map((d, k) => <span key={k} className="font-mono text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded">{mdShort(d)}</span>)}
                    </div>
                  </div>
                );
              })}

              {/* payment status */}
              <div className="grid grid-cols-3 gap-1.5 mt-3 pt-3 border-t border-stone-200/70">
                {PAY_STATES.map((p) => (
                  <button key={p.k} onClick={() => onSetStatus(keyOf(a.customer), p.k)}
                    className={`py-1.5 rounded-lg text-xs font-bold transition ${status === p.k ? p.chip + " ring-2 ring-offset-1 ring-stone-300" : "bg-stone-100 text-stone-400"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {accounts.length === 0 && <div className="text-center text-stone-400 text-sm py-10">No completed cuts in {MONTHS[ym.m]}.</div>}
      </div>

      <p className="text-xs text-stone-400 text-center px-4">Cuts land here automatically. Katy marks each account Invoice sent → Paid as the month closes.</p>
    </div>
  );
}
