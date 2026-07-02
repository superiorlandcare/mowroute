"use client";

// Thin Leaflet shell shared by the map view and the customer-form pin picker.
// Free OpenStreetMap tiles — no API key, no billing. Leaflet itself is loaded
// dynamically inside an effect because its module touches `window` and this
// component still server-renders its empty <div> shell.
//
// Deliberately imperative: MapCanvas mounts the map once and hands the live
// instance to the parent, which owns markers/interactions from there. Pins are
// divIcons (HTML/CSS) rather than Leaflet's image markers — bundler-safe, and
// they give the big high-contrast tap targets field use needs.

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LMap } from "leaflet";

export type LeafletModule = typeof import("leaflet");

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Painesville-ish fallback center for maps with nothing to show yet.
export const DEFAULT_CENTER: [number, number] = [41.7245, -81.2461];

// 6 decimals ≈ 10cm — plenty for a lawn, and keeps displayed coords readable.
export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

let leafletPromise: Promise<LeafletModule> | null = null;
function loadLeaflet(): Promise<LeafletModule> {
  if (!leafletPromise) leafletPromise = import("leaflet");
  return leafletPromise;
}

export function MapCanvas({
  center = DEFAULT_CENTER,
  zoom = 12,
  className,
  onReady,
}: {
  center?: [number, number];
  zoom?: number;
  className?: string;
  // Called exactly once, after the map exists. Return value ignored; the map
  // (and everything on it) is torn down by this component on unmount.
  onReady: (map: LMap, L: LeafletModule) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  // Initial view only — after mount the parent owns the camera.
  const initialView = useRef({ center, zoom });

  useEffect(() => {
    let map: LMap | null = null;
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !divRef.current) return;
      map = L.map(divRef.current, {
        center: initialView.current.center,
        zoom: initialView.current.zoom,
      });
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(
        map,
      );
      onReadyRef.current(map, L);
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, []);

  return <div ref={divRef} className={className} />;
}

// ---------------------------------------------------------------------------
// Pin icons. All are centered circles (iconAnchor = middle) so a pin marks the
// exact coordinate at any zoom. Sizes are tap-target-friendly (≥36px).
// ---------------------------------------------------------------------------

function circleIcon(L: LeafletModule, html: string, size: number) {
  return L.divIcon({
    className: "", // clear leaflet-div-icon's default white box
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// A property on the map (unselected): white ring, green core.
export function propertyPin(L: LeafletModule) {
  return circleIcon(
    L,
    `<div class="w-9 h-9 rounded-full bg-white border-[3px] border-green-600 shadow-md flex items-center justify-center">
       <div class="w-3 h-3 rounded-full bg-green-600"></div>
     </div>`,
    36,
  );
}

// A property with no route relevance right now (e.g. customer on hold).
export function mutedPin(L: LeafletModule) {
  return circleIcon(
    L,
    `<div class="w-9 h-9 rounded-full bg-white border-[3px] border-stone-400 shadow-md flex items-center justify-center">
       <div class="w-3 h-3 rounded-full bg-stone-400"></div>
     </div>`,
    36,
  );
}

// Selected in Build Route mode: solid green with the tap-order number.
export function selectedPin(L: LeafletModule, order: number) {
  return circleIcon(
    L,
    `<div class="w-10 h-10 rounded-full bg-green-600 border-[3px] border-white shadow-lg flex items-center justify-center text-white font-mono font-extrabold text-base">${order}</div>`,
    40,
  );
}

// Route start/end flags ("S" dark, "E" blue — matches the app's palette).
export function flagPin(L: LeafletModule, kind: "start" | "end") {
  const bg = kind === "start" ? "bg-stone-900" : "bg-blue-600";
  const letter = kind === "start" ? "S" : "E";
  return circleIcon(
    L,
    `<div class="w-9 h-9 rounded-full ${bg} border-[3px] border-white shadow-lg flex items-center justify-center text-white font-mono font-extrabold text-sm">${letter}</div>`,
    36,
  );
}

// The customer-form picker pin: big and obviously draggable (crosshair core).
export function dragPin(L: LeafletModule) {
  return circleIcon(
    L,
    `<div class="w-11 h-11 rounded-full bg-green-600/90 border-[3px] border-white shadow-lg flex items-center justify-center">
       <div class="w-3.5 h-3.5 rounded-full bg-white border-2 border-green-800"></div>
     </div>`,
    44,
  );
}
