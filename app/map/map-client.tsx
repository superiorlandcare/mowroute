"use client";

// Full-screen property map + tap-to-select route builder.
//
// View mode (everyone): every geocoded property is a pin; tapping one opens a
// card with name/address/services and turn-by-turn deep links.
// Build mode (admin): tapping pins selects them in order (green + number),
// a bottom bar tracks the count, date, and the route's start/end (shop by
// default — override by address search, dropping a pin, or tapping a
// property), and Create Route writes it through the existing visits model.
//
// Leaflet is driven imperatively via refs (see components/leaflet-map.tsx);
// React state stays the source of truth and effects push it into the markers.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  MapPin,
  MapPinOff,
  Navigation,
  Pause,
  Route,
  Search,
  Settings,
  X,
} from "lucide-react";
import type { Map as LMap, Marker } from "leaflet";
import {
  MapCanvas,
  propertyPin,
  mutedPin,
  selectedPin,
  flagPin,
  round6,
  DEFAULT_CENTER,
  type LeafletModule,
} from "@/components/leaflet-map";
import { serviceStyle, DAY_FULL } from "@/lib/constants";
import { toISODate } from "@/lib/cycle";
import { mapLinks } from "@/lib/map-links";
import type { MapCustomer, MapRoutePlan } from "@/lib/data/map";
import { createMapRoute, previewGeocode } from "./actions";

interface Endpoint {
  lat: number;
  lng: number;
  label: string | null;
}

type EndpointKind = "start" | "end";

export function MapClient({
  customers,
  plans,
  isAdmin,
  shop,
}: {
  customers: MapCustomer[];
  plans: MapRoutePlan[];
  isAdmin: boolean;
  shop: { lat: number; lng: number } | null;
}) {
  const shopEndpoint: Endpoint | null = shop ? { ...shop, label: "Shop" } : null;

  // --- state -----------------------------------------------------------------
  const [building, setBuilding] = useState(false);
  const [selected, setSelected] = useState<string[]>([]); // customer ids, tap order
  const [infoId, setInfoId] = useState<string | null>(null);
  const [date, setDate] = useState(""); // set to today after mount (client TZ)
  const [start, setStart] = useState<Endpoint | null>(shopEndpoint);
  const [end, setEnd] = useState<Endpoint | null>(shopEndpoint);
  const [picking, setPicking] = useState<EndpointKind | null>(null);
  const [editing, setEditing] = useState<EndpointKind | null>(null); // endpoint sheet
  const [unmappedOpen, setUnmappedOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [creating, startCreating] = useTransition();
  const [mapReady, setMapReady] = useState(false);
  const router = useRouter();

  const todayISO = useMemo(() => toISODate(new Date()), []);
  useEffect(() => setDate(todayISO), [todayISO]);

  // Prefill start/end when the chosen date already has a saved plan, so
  // re-editing a day's route doesn't silently reset a custom start/end.
  const planByDate = useMemo(
    () => new Map(plans.map((p) => [p.plan_date, p])),
    [plans],
  );
  useEffect(() => {
    if (!building || !date) return;
    const plan = planByDate.get(date);
    setStart(
      plan && plan.start_lat != null && plan.start_lng != null
        ? { lat: plan.start_lat, lng: plan.start_lng, label: plan.start_label }
        : shopEndpoint,
    );
    setEnd(
      plan && plan.end_lat != null && plan.end_lng != null
        ? { lat: plan.end_lat, lng: plan.end_lng, label: plan.end_label }
        : shopEndpoint,
    );
    // shopEndpoint is derived from the stable `shop` prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building, date, planByDate]);

  const mapped = useMemo(
    () => customers.filter((c) => c.lat != null && c.lng != null),
    [customers],
  );
  const unmapped = useMemo(
    () => customers.filter((c) => c.lat == null || c.lng == null),
    [customers],
  );
  const heldIds = useMemo(
    () =>
      new Set(
        customers
          .filter((c) => c.hold_until && c.hold_until > todayISO)
          .map((c) => c.id),
      ),
    [customers, todayISO],
  );
  const byId = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers],
  );

  // --- leaflet plumbing --------------------------------------------------------
  const mapRef = useRef<LMap | null>(null);
  const LRef = useRef<LeafletModule | null>(null);
  const markersRef = useRef<globalThis.Map<string, Marker>>(new globalThis.Map());
  const startMarkerRef = useRef<Marker | null>(null);
  const endMarkerRef = useRef<Marker | null>(null);

  // Marker/map event handlers read state through refs so the (one-time)
  // Leaflet listeners never go stale.
  const tapPinRef = useRef<(id: string) => void>(() => {});
  tapPinRef.current = (id: string) => {
    const c = byId.get(id);
    if (!c || c.lat == null || c.lng == null) return;
    if (picking) {
      // Choosing a property AS the start/end — a common real case.
      const ep = { lat: c.lat, lng: c.lng, label: c.name };
      if (picking === "start") setStart(ep);
      else setEnd(ep);
      setPicking(null);
      return;
    }
    if (building) {
      setMsg(null);
      setSelected((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
      return;
    }
    setMsg(null);
    setInfoId(id);
  };

  const tapMapRef = useRef<(lat: number, lng: number) => void>(() => {});
  tapMapRef.current = (lat: number, lng: number) => {
    if (picking) {
      const ep = { lat: round6(lat), lng: round6(lng), label: "Dropped pin" };
      if (picking === "start") setStart(ep);
      else setEnd(ep);
      setPicking(null);
      return;
    }
    setInfoId(null);
  };

  // Keep pin icons in sync with selection/build state.
  useEffect(() => {
    const L = LRef.current;
    if (!L || !mapReady) return;
    for (const [id, marker] of markersRef.current) {
      const order = selected.indexOf(id);
      if (building && order >= 0) marker.setIcon(selectedPin(L, order + 1));
      else if (heldIds.has(id)) marker.setIcon(mutedPin(L));
      else marker.setIcon(propertyPin(L));
    }
  }, [selected, building, heldIds, mapReady]);

  // Start/end flags exist only in build mode; draggable for fine-tuning.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady) return;

    const sync = (
      kind: EndpointKind,
      ep: Endpoint | null,
      ref: React.RefObject<Marker | null>,
      set: (e: Endpoint) => void,
    ) => {
      if (!building || !ep) {
        ref.current?.remove();
        ref.current = null;
        return;
      }
      if (!ref.current) {
        ref.current = L.marker([ep.lat, ep.lng], {
          icon: flagPin(L, kind),
          draggable: true,
          zIndexOffset: 500,
        })
          .addTo(map)
          .on("dragend", () => {
            const p = ref.current!.getLatLng();
            set({ lat: round6(p.lat), lng: round6(p.lng), label: "Dropped pin" });
          });
      } else {
        ref.current.setLatLng([ep.lat, ep.lng]);
      }
    };

    sync("start", start, startMarkerRef, setStart);
    sync("end", end, endMarkerRef, setEnd);
  }, [building, start, end, mapReady]);

  // --- actions -----------------------------------------------------------------
  const enterBuild = () => {
    setBuilding(true);
    setInfoId(null);
    setMsg(null);
  };
  const exitBuild = () => {
    setBuilding(false);
    setSelected([]);
    setPicking(null);
    setEditing(null);
    setStart(shopEndpoint);
    setEnd(shopEndpoint);
  };

  const create = () => {
    setMsg(null);
    startCreating(async () => {
      const res = await createMapRoute({
        date,
        customerIds: selected,
        start,
        end,
      });
      if (res.error) {
        setMsg(res.error);
        return;
      }
      const stops = res.stops ?? 0;
      const created = res.created ?? 0;
      let m = `Route saved for ${date} — ${stops} stop${stops === 1 ? "" : "s"} on the board`;
      if (created < stops) m += ` (${stops - created} already there)`;
      if (res.skippedCustomers?.length) {
        m += `. Skipped: ${res.skippedCustomers.join(", ")}`;
      }
      setMsg(m);
      setBuilding(false);
      setSelected([]);
      setPicking(null);
      setEditing(null);
      // Pull fresh props (incl. the just-saved plan) for the next build session.
      router.refresh();
    });
  };

  const info = infoId ? byId.get(infoId) : null;

  return (
    <div className="fixed inset-0 bg-stone-100">
      <MapCanvas
        className="h-full w-full"
        center={DEFAULT_CENTER}
        zoom={11}
        onReady={(map, L) => {
          mapRef.current = map;
          LRef.current = L;

          for (const c of mapped) {
            const marker = L.marker([c.lat as number, c.lng as number], {
              icon: propertyPin(L),
            })
              .addTo(map)
              .on("click", () => tapPinRef.current(c.id));
            markersRef.current.set(c.id, marker);
          }
          map.on("click", (e) =>
            tapMapRef.current(e.latlng.lat, e.latlng.lng),
          );

          // Frame everything we know about (pins + shop).
          const pts: [number, number][] = mapped.map((c) => [
            c.lat as number,
            c.lng as number,
          ]);
          if (shop) pts.push([shop.lat, shop.lng]);
          if (pts.length > 0) {
            map.fitBounds(L.latLngBounds(pts), {
              padding: [48, 48],
              maxZoom: 15,
            });
          }
          setMapReady(true);
        }}
      />

      {/* Top bar — floating chips; the gap stays draggable map */}
      <div className="absolute top-0 inset-x-0 z-[1100] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-2 pointer-events-none">
        <Link
          href="/"
          aria-label="Back to board"
          className="pointer-events-auto w-11 h-11 rounded-2xl bg-white border border-stone-200 shadow flex items-center justify-center text-stone-700 shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="pointer-events-auto h-11 px-4 rounded-2xl bg-white border border-stone-200 shadow flex items-center gap-2">
          <MapPin className="w-4 h-4 text-green-600" />
          <span className="font-extrabold uppercase tracking-tight text-sm">
            Map
          </span>
          <span className="font-mono text-xs text-stone-400">{mapped.length}</span>
        </div>
        <div className="flex-1" />
        {unmapped.length > 0 && (
          <button
            onClick={() => setUnmappedOpen(true)}
            className="pointer-events-auto h-11 px-3 rounded-2xl bg-amber-100 border border-amber-200 shadow flex items-center gap-1.5 text-amber-900 text-xs font-bold shrink-0"
          >
            <MapPinOff className="w-4 h-4" />
            {unmapped.length} unmapped
          </button>
        )}
        {isAdmin && !building && (
          <button
            onClick={enterBuild}
            className="pointer-events-auto h-11 px-4 rounded-2xl bg-green-600 text-white shadow-lg flex items-center gap-2 text-sm font-bold uppercase tracking-wide shrink-0"
          >
            <Route className="w-4 h-4" /> Build route
          </button>
        )}
      </div>

      {/* Picking banner — next tap sets the start/end */}
      {picking && (
        <div className="absolute top-20 inset-x-0 z-[1100] flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto bg-stone-900 text-white rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3 text-sm font-semibold">
            Tap the map (or a pin) to set the{" "}
            {picking === "start" ? "START" : "END"}
            <button
              onClick={() => setPicking(null)}
              aria-label="Cancel"
              className="w-8 h-8 -mr-1 rounded-xl bg-stone-700 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Result / error toast (outside build mode too, e.g. after saving) */}
      {msg && !building && (
        <div className="absolute bottom-4 inset-x-0 z-[1100] flex justify-center px-4">
          <button
            onClick={() => setMsg(null)}
            className="bg-stone-900 text-white text-sm font-semibold rounded-2xl shadow-lg px-4 py-3 text-left"
          >
            {msg}
          </button>
        </div>
      )}

      {/* View mode: property card */}
      {info && !building && (
        <div className="absolute bottom-0 inset-x-0 z-[1100] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-md mx-auto bg-white rounded-3xl shadow-xl border border-stone-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-extrabold text-lg leading-tight">
                  {info.name}
                </div>
                <div className="flex items-center gap-1 text-sm text-stone-500 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {info.address ?? "No address"}
                    {info.city ? `, ${info.city}` : ""}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setInfoId(null)}
                aria-label="Close"
                className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-stone-500 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {info.services.map((s) => (
                <span
                  key={s.id}
                  className={`text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded ${serviceStyle(s.service_type)}`}
                >
                  {s.service_type}
                  {s.day ? ` · ${DAY_FULL[s.day]}` : ""}
                </span>
              ))}
              {heldIds.has(info.id) && (
                <span className="inline-flex items-center gap-1 bg-stone-100 text-stone-500 text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded">
                  <Pause className="w-3 h-3" /> On hold until {info.hold_until}
                </span>
              )}
            </div>

            {info.lat != null && info.lng != null && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {(
                  [
                    ["Google", mapLinks(info.lat, info.lng).google],
                    ["Apple", mapLinks(info.lat, info.lng).apple],
                    ["Waze", mapLinks(info.lat, info.lng).waze],
                  ] as const
                ).map(([label, href]) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-blue-50 text-blue-700 text-sm font-bold active:scale-[0.97] transition"
                  >
                    <Navigation className="w-3.5 h-3.5" /> {label}
                  </a>
                ))}
              </div>
            )}

            {isAdmin && (
              <Link
                href="/setup"
                className="mt-2 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-stone-100 text-stone-600 text-sm font-semibold"
              >
                <Settings className="w-4 h-4" /> Edit in Setup
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Build mode: bottom bar */}
      {building && (
        <div className="absolute bottom-0 inset-x-0 z-[1100] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-md mx-auto bg-stone-900 text-white rounded-3xl shadow-xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-mono text-3xl font-extrabold leading-none">
                  {selected.length}
                  <span className="text-stone-500 text-lg"> selected</span>
                </div>
                <div className="text-[11px] uppercase tracking-wide text-stone-400 mt-1">
                  Tap pins to add · tap again to remove
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-green-500"
                  aria-label="Route date"
                />
                <button
                  onClick={exitBuild}
                  aria-label="Exit build mode"
                  className="w-11 h-11 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center text-stone-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Start / End */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              {(
                [
                  ["start", start] as const,
                  ["end", end] as const,
                ] as [EndpointKind, Endpoint | null][]
              ).map(([kind, ep]) => (
                <button
                  key={kind}
                  onClick={() => {
                    setEditing(editing === kind ? null : kind);
                    setPicking(null);
                  }}
                  className={`rounded-xl px-3 py-2.5 text-left border ${
                    editing === kind
                      ? "bg-stone-700 border-stone-500"
                      : "bg-stone-800 border-stone-700"
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wide text-stone-400 flex items-center gap-1">
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-mono text-white ${
                        kind === "start" ? "bg-green-600" : "bg-blue-600"
                      }`}
                    >
                      {kind === "start" ? "S" : "E"}
                    </span>
                    {kind}
                  </div>
                  <div className="text-sm font-semibold truncate mt-0.5">
                    {ep?.label ??
                      (ep ? `${ep.lat}, ${ep.lng}` : "Not set")}
                  </div>
                </button>
              ))}
            </div>

            {editing && (
              <EndpointEditor
                kind={editing}
                shop={shopEndpoint}
                onSet={(ep) => {
                  if (editing === "start") setStart(ep);
                  else setEnd(ep);
                  setEditing(null);
                }}
                onPickOnMap={() => {
                  setPicking(editing);
                  setEditing(null);
                }}
              />
            )}

            {msg && (
              <div className="text-xs text-amber-300 mt-3">{msg}</div>
            )}

            <button
              onClick={create}
              disabled={creating || selected.length === 0 || !date}
              className={`w-full mt-3 py-4 rounded-2xl font-bold uppercase tracking-wide text-base flex items-center justify-center gap-2 transition ${
                creating || selected.length === 0 || !date
                  ? "bg-stone-800 text-stone-500"
                  : "bg-green-600 text-white active:scale-[0.99]"
              }`}
            >
              <Route className="w-5 h-5" />
              {creating
                ? "Saving…"
                : `Create route${selected.length ? ` (${selected.length})` : ""}`}
            </button>
          </div>
        </div>
      )}

      {/* Unmapped customers sheet */}
      {unmappedOpen && (
        <div
          className="absolute inset-0 z-[1200] bg-black/40 flex items-end sm:items-center justify-center"
          onClick={() => setUnmappedOpen(false)}
        >
          <div
            className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-extrabold uppercase tracking-tight">
                Not on the map
              </span>
              <button
                onClick={() => setUnmappedOpen(false)}
                aria-label="Close"
                className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-stone-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-stone-500 mb-3">
              These customers have no location yet
              {isAdmin
                ? " — open them in Setup and drop a pin on the map."
                : "."}
            </p>
            <div className="space-y-2">
              {unmapped.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-stone-200 px-3 py-2.5"
                >
                  <div className="font-semibold text-stone-800">{c.name}</div>
                  <div className="text-xs text-stone-500">
                    {c.address ?? "No address"}
                    {c.city ? `, ${c.city}` : ""}
                  </div>
                </div>
              ))}
            </div>
            {isAdmin && (
              <Link
                href="/setup"
                className="mt-4 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-stone-900 text-white text-sm font-bold"
              >
                <Settings className="w-4 h-4" /> Open Setup
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Endpoint chooser: shop / search an address / pick on the map.
function EndpointEditor({
  kind,
  shop,
  onSet,
  onPickOnMap,
}: {
  kind: EndpointKind;
  shop: Endpoint | null;
  onSet: (ep: Endpoint) => void;
  onPickOnMap: () => void;
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearching] = useTransition();

  const search = () => {
    const text = query.trim();
    if (!text) return;
    setError(null);
    startSearching(async () => {
      const res = await previewGeocode(text, null);
      if (res.error || res.lat == null || res.lng == null) {
        setError(res.error ?? "No match — try picking on the map.");
        return;
      }
      onSet({ lat: round6(res.lat), lng: round6(res.lng), label: text });
    });
  };

  return (
    <div className="mt-2 rounded-xl bg-stone-800 border border-stone-700 p-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-stone-400 mb-2">
        Set the {kind === "start" ? "start" : "end"}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        {shop && (
          <button
            onClick={() => onSet(shop)}
            className="py-2.5 rounded-xl bg-stone-700 text-sm font-semibold"
          >
            Use shop
          </button>
        )}
        <button
          onClick={onPickOnMap}
          className={`py-2.5 rounded-xl bg-stone-700 text-sm font-semibold ${
            shop ? "" : "col-span-2"
          }`}
        >
          Pick on map
        </button>
      </div>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search an address…"
          className="flex-1 min-w-0 bg-stone-900 border border-stone-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-green-500"
        />
        <button
          onClick={search}
          disabled={searching || !query.trim()}
          aria-label="Search"
          className="w-11 rounded-xl bg-green-600 text-white flex items-center justify-center disabled:opacity-40"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>
      {error && <div className="text-xs text-amber-300 mt-2">{error}</div>}
    </div>
  );
}
