// OpenRouteService Pelias geocoding (spec §2, §10): address → lat/lng on save.
// Server-only. Degrades gracefully: a customer always saves. The result carries
// whatever coordinates Pelias returned PLUS a quality verdict — a weak/fallback
// match (e.g. a typo'd address that Pelias snaps to a city centroid out in Lake
// Erie) comes back as `low_confidence`. Callers decide what to trust:
// geocode-on-save stores coords only when quality is "ok" (so junk never lands
// in the DB), while the map pin picker uses any match as a draggable starting
// guess the admin corrects by eye.

// Tune here. Pelias confidence is 0..1; a confident street+house match is
// typically >= 0.9, interpolated ~0.8, coarse fallbacks well below.
export const GEOCODE_CONFIDENCE_THRESHOLD = 0.8;

// Layers that represent an actual street address / building, as opposed to a
// coarse fallback (street centroid, city/locality/region centroid, etc.).
const ADDRESS_LAYERS = new Set(["address", "venue"]);

export type GeocodeQuality = "ok" | "low_confidence" | "no_result";

export interface GeocodeResult {
  lat: number | null;
  lng: number | null;
  quality: GeocodeQuality;
  confidence: number | null;
  layer: string | null;
  matchType: string | null;
}

// Pure decision: is this Pelias feature a trustworthy house-number match?
// Exported so it can be unit-tested without a network call.
export function isConfidentAddressMatch(props: {
  confidence?: unknown;
  layer?: unknown;
  match_type?: unknown;
}): boolean {
  const confidence = typeof props.confidence === "number" ? props.confidence : 0;
  const layer = typeof props.layer === "string" ? props.layer : null;
  const matchType =
    typeof props.match_type === "string" ? props.match_type : null;

  return (
    confidence >= GEOCODE_CONFIDENCE_THRESHOLD &&
    layer !== null &&
    ADDRESS_LAYERS.has(layer) &&
    matchType !== "fallback"
  );
}

const NO_RESULT: GeocodeResult = {
  lat: null,
  lng: null,
  quality: "no_result",
  confidence: null,
  layer: null,
  matchType: null,
};

export async function geocodeAddress(
  address?: string | null,
  city?: string | null,
  state?: string | null,
): Promise<GeocodeResult> {
  const key = process.env.ORS_API_KEY;
  if (!key || !address?.trim()) return NO_RESULT;

  const text = [address, city, state || "OH"].filter(Boolean).join(", ");
  const url =
    "https://api.openrouteservice.org/geocode/search" +
    `?api_key=${encodeURIComponent(key)}` +
    `&text=${encodeURIComponent(text)}` +
    "&boundary.country=US&size=1";

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      // Geocoding is best-effort; don't let a slow lookup hang the save.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return NO_RESULT;

    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) return NO_RESULT;

    const props = feature.properties ?? {};
    const confidence =
      typeof props.confidence === "number" ? props.confidence : null;
    const layer = typeof props.layer === "string" ? props.layer : null;
    const matchType =
      typeof props.match_type === "string" ? props.match_type : null;

    // ORS returns [lng, lat] (spec §10 gotcha: easy to reverse).
    const coords = feature.geometry?.coordinates;
    const lng = Array.isArray(coords) ? coords[0] : undefined;
    const lat = Array.isArray(coords) ? coords[1] : undefined;
    if (typeof lat !== "number" || typeof lng !== "number") return NO_RESULT;

    // Weak/coarse matches keep their coordinates too — the quality field tells
    // callers whether to store them or only use them as a visual starting guess.
    return {
      lat,
      lng,
      quality: isConfidentAddressMatch(props) ? "ok" : "low_confidence",
      confidence,
      layer,
      matchType,
    };
  } catch {
    return NO_RESULT;
  }
}
