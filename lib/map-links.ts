// Turn-by-turn deep links to a lat/lng for the major map apps (spec §8).
// Shared by the board's stop cards and the map view's property card.
export function mapLinks(lat: number, lng: number) {
  const dest = `${lat},${lng}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${dest}`,
    apple: `https://maps.apple.com/?daddr=${dest}`,
    waze: `https://waze.com/ul?ll=${dest}&navigate=yes`,
  };
}
