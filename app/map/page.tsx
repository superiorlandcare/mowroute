import { requireUser } from "@/lib/auth";
import { getMapData } from "@/lib/data/map";
import { MapClient } from "./map-client";

export const metadata = { title: "Map · MowRoute" };

// Full-screen map of every active property (spec-adjacent: crews use this in
// the field, so it's available to everyone; Build Route mode inside is
// admin-only). Auth here, RLS as backstop — same as the board.
export default async function MapPage() {
  const { profile } = await requireUser();
  const isAdmin = profile?.role === "admin";
  const { customers, plans } = await getMapData();

  // The shop/depot (env-configured, server-only) doubles as the default route
  // start/end; exposing its coords to signed-in users is fine — it's where the
  // crew starts every morning.
  const depotLat = Number(process.env.DEPOT_LAT);
  const depotLng = Number(process.env.DEPOT_LNG);
  const shop =
    Number.isFinite(depotLat) && Number.isFinite(depotLng)
      ? { lat: depotLat, lng: depotLng }
      : null;

  return (
    <MapClient customers={customers} plans={plans} isAdmin={isAdmin} shop={shop} />
  );
}
