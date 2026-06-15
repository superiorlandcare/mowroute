import type { Interval } from "@/lib/types";

// Cadence math for the Mow board (spec §9). The board runs on a WEEKLY cycle
// anchored to Monday: `service_date` is the Monday of the cycle a visit belongs
// to, and `unique(service_id, service_date)` means at most one visit per service
// per cycle. Whether a given service is *due* in a cycle is derived from its
// `interval` + `anchor_date` — weekly hits every cycle, biweekly every other,
// monthly/every-other-month on the calendar. Days remain a soft display grouping.

const DAY_MS = 86_400_000;

// Monday of the week containing `d` (date-only, local time).
export function mondayOf(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = r.getDay(); // 0 = Sun … 6 = Sat
  const sinceMonday = (dow + 6) % 7;
  r.setDate(r.getDate() - sinceMonday);
  return r;
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// The Monday of the current cycle.
export function currentCycleMonday(today: Date = new Date()): string {
  return toISODate(mondayOf(today));
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

// Does a monthly-cadence occurrence land exactly on date `d`?
// Occurrences fall on the anchor's day-of-month every `step` months (clamped to
// month length, so an anchor on the 31st lands on the last day of shorter months).
function isMonthlyOccurrence(d: Date, anchor: Date, step: number): boolean {
  const anchorStart = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate(),
  );
  if (d < anchorStart) return false;
  const months =
    (d.getFullYear() - anchor.getFullYear()) * 12 +
    (d.getMonth() - anchor.getMonth());
  if (months % step !== 0) return false;
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const targetDay = Math.min(anchor.getDate(), lastDay);
  return d.getDate() === targetDay;
}

// Is a service due in the cycle whose Monday is `cycleMondayISO`?
//
// - Weekly → every cycle.
// - Non-weekly without an anchor → shown every cycle so nothing is silently
//   missed (decision 3); the UI flags these as "cadence not set".
// - Seasonal → no fixed cadence, so shown every cycle (admin skips as needed).
// - Biweekly / Monthly / Every other month → only when an occurrence computed
//   from `anchor_date` falls inside this cycle's week.
export function isServiceDue(
  service: { interval: Interval; anchor_date: string | null },
  cycleMondayISO: string,
): boolean {
  const { interval } = service;
  if (interval === "Weekly") return true;
  if (!service.anchor_date) return true; // decision 3: show until anchored
  if (interval === "Seasonal") return true;

  const cycleMonday = parseISODate(cycleMondayISO);
  const anchor = parseISODate(service.anchor_date);

  if (interval === "Biweekly") {
    const weeks = Math.round(diffDays(cycleMonday, mondayOf(anchor)) / 7);
    return ((weeks % 2) + 2) % 2 === 0;
  }

  // Monthly / Every other month: scan this cycle's 7 days for an occurrence.
  const step = interval === "Every other month" ? 2 : 1;
  for (let i = 0; i < 7; i++) {
    const d = new Date(
      cycleMonday.getFullYear(),
      cycleMonday.getMonth(),
      cycleMonday.getDate() + i,
    );
    if (isMonthlyOccurrence(d, anchor, step)) return true;
  }
  return false;
}

// A non-weekly service with no anchor has an unknown cadence: we show it every
// cycle but flag it so the admin knows to set the anchor (decision 3).
export function cadenceUnset(service: {
  interval: Interval;
  anchor_date: string | null;
}): boolean {
  return service.interval !== "Weekly" && !service.anchor_date;
}
