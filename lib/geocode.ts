// OpenRouteService Pelias geocoding (spec §2, §10): address → lat/lng on save.
// Server-only. Degrades gracefully: returns null when there's no API key, no
// address, or the lookup fails — the caller stores null coords and flags it.

export interface GeoPoint {
  lat: number;
  lng: number;
}

export async function geocodeAddress(
  address?: string | null,
  city?: string | null,
  state?: string | null,
): Promise<GeoPoint | null> {
  const key = process.env.ORS_API_KEY;
  if (!key || !address?.trim()) return null;

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
    if (!res.ok) return null;

    const data = await res.json();
    // ORS returns [lng, lat] (spec §10 gotcha: easy to reverse).
    const coords = data?.features?.[0]?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length === 2) {
      const [lng, lat] = coords;
      if (typeof lat === "number" && typeof lng === "number") {
        return { lat, lng };
      }
    }
    return null;
  } catch {
    return null;
  }
}
