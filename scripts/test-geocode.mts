// Logic test for the geocode classifier. Runs the REAL geocodeAddress against
// stubbed ORS/Pelias responses (no network), including the Lake Erie fallback.
// Run: npx tsx scripts/test-geocode.mts
import {
  geocodeAddress,
  isConfidentAddressMatch,
  GEOCODE_CONFIDENCE_THRESHOLD,
} from "../lib/geocode";

process.env.ORS_API_KEY = "test-key";

// Canned Pelias features keyed by a substring of the query text. Values mirror
// the real response shape: properties.{confidence,layer,match_type} + geometry.
const FIXTURES: Record<
  string,
  { confidence: number; layer: string; match_type: string; coords: [number, number] }
> = {
  // Real, precise addresses → confident street-address matches.
  "251 Walnut": { confidence: 0.95, layer: "address", match_type: "exact", coords: [-81.2456, 41.7245] },
  "7544 Nancy Ann": { confidence: 0.9, layer: "address", match_type: "interpolated", coords: [-81.18, 41.66] },
  // Nonexistent house number → Pelias fallback to a coarse centroid (Lake Erie).
  "1234 Balls": { confidence: 0.33, layer: "locality", match_type: "fallback", coords: [-81.241, 41.969] },
};

globalThis.fetch = (async (url: string | URL) => {
  const text = decodeURIComponent(String(url));
  const key = Object.keys(FIXTURES).find((k) => text.includes(encodeURIComponent(k)) || text.includes(k));
  const f = key ? FIXTURES[key] : null;
  const features = f
    ? [{ geometry: { coordinates: f.coords }, properties: { confidence: f.confidence, layer: f.layer, match_type: f.match_type } }]
    : [];
  return new Response(JSON.stringify({ features }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

console.log(`threshold = ${GEOCODE_CONFIDENCE_THRESHOLD}\n--- end-to-end (stubbed ORS) ---`);

const walnut = await geocodeAddress("251 Walnut Ave", "Painesville", "OH");
check("251 Walnut Ave → ok + coords kept", walnut.quality === "ok" && walnut.lat !== null && walnut.lng !== null);

const nancy = await geocodeAddress("7544 Nancy Ann Drive", "Painesville", "OH");
check("7544 Nancy Ann Drive → ok + coords kept", nancy.quality === "ok" && nancy.lat !== null);

const balls = await geocodeAddress("1234 Balls Drive", "Painesville", "OH");
check("1234 Balls Drive → low_confidence + coords kept for preview", balls.quality === "low_confidence" && balls.lat !== null && balls.lng !== null);

const missing = await geocodeAddress("Nowhere at all 99999", "Painesville", "OH");
check("unknown address → no_result", missing.quality === "no_result" && missing.lat === null);

console.log("\n--- pure decision function (boundary cases) ---");
check("exact address at threshold → confident", isConfidentAddressMatch({ confidence: 0.8, layer: "address", match_type: "exact" }));
check("street centroid (not house number) → flagged", !isConfidentAddressMatch({ confidence: 0.85, layer: "street", match_type: "exact" }));
check("high confidence but fallback → flagged", !isConfidentAddressMatch({ confidence: 0.97, layer: "address", match_type: "fallback" }));
check("below threshold → flagged", !isConfidentAddressMatch({ confidence: 0.79, layer: "address", match_type: "exact" }));
check("locality centroid → flagged", !isConfidentAddressMatch({ confidence: 0.6, layer: "locality", match_type: "fallback" }));

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
