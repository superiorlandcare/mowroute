import { isServiceDue } from "@/lib/cycle";
import type { Interval } from "@/lib/types";

// Which of a customer's active services go on the route when its pin is tapped
// into a map-built route? (Decision from planning with Katy.)
//
// 1. Services whose cadence says they're due that cycle — the normal case.
// 2. If nothing is due (e.g. an anchored biweekly on its off week), fall back
//    to the Mow service(s): she tapped the property deliberately, so at
//    minimum the mow goes on the route — but we do NOT drag an off-cadence
//    monthly extra (ditch cut, treatment) onto the board where it could get
//    completed and billed early.
// 3. No Mow either → the first active service (route position order), so a
//    deliberately tapped pin never silently adds nothing.
//
// Pure: exported for the script test in scripts/test-route-select.mts.
export function pickRouteServices<
  T extends {
    service_type: string;
    interval: Interval;
    anchor_date: string | null;
  },
>(services: T[], cycleMondayISO: string): T[] {
  const due = services.filter((s) => isServiceDue(s, cycleMondayISO));
  if (due.length > 0) return due;

  const mows = services.filter((s) => s.service_type === "Mow");
  if (mows.length > 0) return mows;

  return services.slice(0, 1);
}

// Permute the chosen services' sort_order among their OWN existing slots so the
// tap order becomes the board order without disturbing any other service's
// position — the same trick optimizeDay uses for the optimizer's order.
// `orderedIds` is the desired visiting order; returns id → new sort_order.
export function assignSortSlots(
  orderedIds: string[],
  currentSlotById: Map<string, number>,
): Map<string, number> {
  const present = orderedIds.filter((id) => currentSlotById.has(id));
  const slots = present
    .map((id) => currentSlotById.get(id) as number)
    .sort((a, b) => a - b);

  const next = new Map<string, number>();
  present.forEach((id, i) => next.set(id, slots[i]));
  return next;
}
