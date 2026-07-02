// Logic test for the map route builder's pure pieces: which services go on a
// route when a customer's pin is tapped, and how tap order maps onto the
// services' own sort_order slots. Run: npx tsx scripts/test-route-select.mts
import { pickRouteServices, assignSortSlots } from "../lib/route-plan";
import type { Interval } from "../lib/types";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

const svc = (
  service_type: string,
  interval: Interval,
  anchor_date: string | null = null,
) => ({ service_type, interval, anchor_date });

// Cycle week: Mon 2026-06-29 … Sun 2026-07-05.
const CYCLE = "2026-06-29";

console.log("--- pickRouteServices ---");

// The normal case: whatever is cadence-due goes on the route.
const weeklyMow = svc("Mow", "Weekly");
check(
  "weekly mow → picked",
  pickRouteServices([weeklyMow], CYCLE).length === 1,
);

// Off-cadence extras are NOT dragged along (no accidental early billing).
const monthlyDitchOff = svc("Ditch cut", "Monthly", "2026-06-10"); // next: Jul 10
{
  const picked = pickRouteServices([weeklyMow, monthlyDitchOff], CYCLE);
  check(
    "weekly mow + off-week monthly ditch → mow only",
    picked.length === 1 && picked[0].service_type === "Mow",
  );
}

// A monthly service whose occurrence lands inside the cycle week IS due.
const monthlyDitchDue = svc("Ditch cut", "Monthly", "2026-06-01"); // next: Jul 1 (in week)
check(
  "weekly mow + due monthly ditch → both",
  pickRouteServices([weeklyMow, monthlyDitchDue], CYCLE).length === 2,
);

// Nothing due (anchored biweekly, off week) → the Mow still goes on: the pin
// was tapped deliberately.
const biweeklyMowOff = svc("Mow", "Biweekly", "2026-06-22"); // odd week → off
{
  const picked = pickRouteServices([biweeklyMowOff, monthlyDitchOff], CYCLE);
  check(
    "all off-cadence → falls back to the mow only",
    picked.length === 1 && picked[0].service_type === "Mow",
  );
}

// No Mow at all → first active service, never silently nothing.
{
  const treatment = svc("Treatment", "Monthly", "2026-06-10");
  const picked = pickRouteServices([treatment], CYCLE);
  check(
    "only an off-week treatment → still picked (first active)",
    picked.length === 1 && picked[0].service_type === "Treatment",
  );
}

console.log("\n--- assignSortSlots ---");

// Tap order becomes board order, using only the chosen services' own slots.
{
  const slots = new Map([
    ["a", 10],
    ["b", 20],
    ["c", 30],
  ]);
  const next = assignSortSlots(["c", "a", "b"], slots);
  check(
    "tap order c,a,b permutes within slots {10,20,30}",
    next.get("c") === 10 && next.get("a") === 20 && next.get("b") === 30,
  );
}

// Unknown ids are ignored without shifting the rest.
{
  const slots = new Map([
    ["a", 5],
    ["b", 7],
  ]);
  const next = assignSortSlots(["ghost", "b", "a"], slots);
  check(
    "unknown id ignored, others keep alignment",
    next.get("b") === 5 && next.get("a") === 7 && !next.has("ghost"),
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
