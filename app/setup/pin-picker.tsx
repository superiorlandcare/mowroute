"use client";

// Draggable-pin location picker for the customer form (spec: the geocoder gets
// some addresses wrong, so the hand-placed pin is the source of truth).
// Tap the map or drag the pin to set the exact spot; "Find address" drops a
// geocoded STARTING GUESS (even a weak one) for the admin to correct by eye.

import { useEffect, useRef, useState, useTransition } from "react";
import { LocateFixed } from "lucide-react";
import type { Map as LMap, Marker } from "leaflet";
import {
  MapCanvas,
  dragPin,
  round6,
  DEFAULT_CENTER,
  type LeafletModule,
} from "@/components/leaflet-map";
import { previewGeocode } from "@/app/map/actions";

export function PinPicker({
  lat,
  lng,
  address,
  city,
  onPin,
}: {
  lat: number | null;
  lng: number | null;
  address: string;
  city: string;
  // The user placed/moved the pin (tap, drag, or geocode guess).
  onPin: (lat: number, lng: number) => void;
}) {
  const mapRef = useRef<LMap | null>(null);
  const LRef = useRef<LeafletModule | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;
  const coordsRef = useRef({ lat, lng });
  coordsRef.current = { lat, lng };

  const [findMsg, setFindMsg] = useState<string | null>(null);
  const [finding, startFinding] = useTransition();

  // Create/move the pin. Every placement reports back through onPin so the
  // form's lat/lng (and coords_manual) stay the single source of truth.
  const placeMarker = (la: number, ln: number, fly = false) => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return;
    if (!markerRef.current) {
      markerRef.current = L.marker([la, ln], {
        icon: dragPin(L),
        draggable: true,
      })
        .addTo(map)
        .on("dragend", () => {
          const p = markerRef.current!.getLatLng();
          onPinRef.current(round6(p.lat), round6(p.lng));
        });
    } else {
      markerRef.current.setLatLng([la, ln]);
    }
    if (fly) map.setView([la, ln], Math.max(map.getZoom(), 17));
  };

  // Keep the pin in sync when lat/lng change from outside (typed into the
  // manual inputs). Placement from the map itself round-trips through onPin
  // back to the same values, so this is loop-safe.
  useEffect(() => {
    if (lat != null && lng != null) placeMarker(lat, lng);
  }, [lat, lng]);

  const findAddress = () => {
    setFindMsg(null);
    startFinding(async () => {
      const res = await previewGeocode(address, city || null);
      if (res.error || res.lat == null || res.lng == null) {
        setFindMsg(res.error ?? "Couldn't find that address.");
        return;
      }
      placeMarker(res.lat, res.lng, true);
      onPinRef.current(round6(res.lat), round6(res.lng));
      if (res.quality !== "ok") {
        setFindMsg("Best guess only — check the pin and drag it to the exact spot.");
      }
    });
  };

  return (
    <div>
      <div className="rounded-xl overflow-hidden border border-stone-200 relative">
        <MapCanvas
          className="h-56 w-full"
          center={lat != null && lng != null ? [lat, lng] : DEFAULT_CENTER}
          zoom={lat != null && lng != null ? 17 : 11}
          onReady={(map, L) => {
            mapRef.current = map;
            LRef.current = L;
            const c = coordsRef.current;
            if (c.lat != null && c.lng != null) placeMarker(c.lat, c.lng);
            map.on("click", (e) => {
              const la = round6(e.latlng.lat);
              const ln = round6(e.latlng.lng);
              placeMarker(la, ln);
              onPinRef.current(la, ln);
            });
          }}
        />
        <button
          type="button"
          onClick={findAddress}
          disabled={finding || !address.trim()}
          className="absolute top-2 right-2 z-[1000] flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/95 border border-stone-200 shadow text-xs font-bold text-stone-700 disabled:opacity-50"
        >
          <LocateFixed className="w-3.5 h-3.5" />
          {finding ? "Finding…" : "Find address"}
        </button>
      </div>
      <p className="text-xs text-stone-500 mt-1.5">
        {lat != null && lng != null
          ? "Drag the pin (or tap the map) to fine-tune the exact spot."
          : "Tap the map to drop a pin, or use Find address for a starting guess."}
      </p>
      {findMsg && <p className="text-xs text-amber-700 mt-1">{findMsg}</p>}
    </div>
  );
}
