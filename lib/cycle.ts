// Cycle + cadence logic for the Mow board (spec §9).
// Decision (Phase 3): a "cycle" is the current week; a visit's service_date is
// the Monday of that week, so there is one visit per service per week
// (unique(service_id, service_date)). Dates are computed in the crew's local
// timezone so the week doesn't roll early on a UTC server.

export const BUSINESS_TZ = "America/New_York";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Today's calendar date in the business timezone, as {y,m,d}.
function nowParts(tz = BUSINESS_TZ): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function ymd(dt: Date): string {
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(
    dt.getUTCDate(),
  )}`;
}

function mondayOf(dt: Date): Date {
  const out = new Date(dt);
  const dow = out.getUTCDay(); // 0=Sun … 6=Sat
  out.setUTCDate(out.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return out;
}

// Monday (YYYY-MM-DD) of the current week — the service_date for this cycle.
export function currentCycleDate(): string {
  const { y, m, d } = nowParts();
  return ymd(mondayOf(new Date(Date.UTC(y, m - 1, d))));
}

// Today (YYYY-MM-DD) in the business timezone — used for hold_until comparisons.
export function todayDate(): string {
  const { y, m, d } = nowParts();
  return `${y}-${pad(m)}-${pad(d)}`;
}

function monthlyDue(anchor: Date, cycleMonday: Date, step: number): boolean {
  const anchorDay = anchor.getUTCDate();
  for (let i = 0; i < 7; i++) {
    const d = new Date(cycleMonday);
    d.setUTCDate(d.getUTCDate() + i);
    const monthsSince =
      (d.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
      (d.getUTCMonth() - anchor.getUTCMonth());
    if (monthsSince < 0 || monthsSince % step !== 0) continue;
    const daysInMonth = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    const recurDay = Math.min(anchorDay, daysInMonth);
    if (d.getUTCDate() === recurDay) return true;
  }
  return false;
}

// Is a service due in the given cycle (Monday YYYY-MM-DD)?
// Weekly = always. Unanchored non-weekly = always (show until anchored, per
// the Phase 3 decision). Anchored non-weekly = cadence math from anchor_date.
export function isServiceDue(
  service: { interval: string; anchor_date: string | null },
  cycleDate: string,
): boolean {
  if (service.interval === "Weekly") return true;
  if (!service.anchor_date) return true;

  const cycle = parseYmd(cycleDate);
  const anchor = parseYmd(service.anchor_date);

  switch (service.interval) {
    case "Biweekly": {
      const weeks = Math.round(
        (cycle.getTime() - mondayOf(anchor).getTime()) / (7 * 86_400_000),
      );
      return weeks >= 0 && weeks % 2 === 0;
    }
    case "Monthly":
      return monthlyDue(anchor, cycle, 1);
    case "Every other month":
      return monthlyDue(anchor, cycle, 2);
    case "Seasonal":
      return true;
    default:
      return true;
  }
}

// Customer is "on hold" when hold_until is in the future (spec §8/§9).
export function isHeld(
  customer: { hold_until: string | null },
  today = todayDate(),
): boolean {
  return !!customer.hold_until && customer.hold_until > today;
}

// Human label for the current week, e.g. "Week of Jun 9".
export function cycleLabel(cycleDate: string): string {
  const dt = parseYmd(cycleDate);
  const month = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(dt);
  return `Week of ${month} ${dt.getUTCDate()}`;
}
