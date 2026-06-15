// Directions deep links for the board (spec §8). Prefers the geocoded
// coordinates now stored on customers; falls back to the address text.

export interface Navigable {
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
}

export function mapLinks(c: Navigable) {
  const hasCoords = c.lat != null && c.lng != null;
  const coord = `${c.lat},${c.lng}`;
  const addr = encodeURIComponent(
    [c.address, c.city, "OH"].filter(Boolean).join(", "),
  );
  const dest = hasCoords ? coord : addr;

  return {
    waze: hasCoords
      ? `https://waze.com/ul?ll=${coord}&navigate=yes`
      : `https://waze.com/ul?q=${addr}&navigate=yes`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${dest}`,
    apple: `https://maps.apple.com/?daddr=${dest}`,
  };
}
