import type { Day, Interval } from "@/lib/types";

// Soft day labels (spec §4: a grouping convenience, not a hard schedule).
export const DAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export const DAY_FULL: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
};

// Cadence options (spec §4 services.interval check constraint).
export const INTERVALS: Interval[] = [
  "Weekly",
  "Biweekly",
  "Monthly",
  "Every other month",
  "Seasonal",
];

// Common service types — free text in the DB, these are the quick picks.
export const SERVICE_TYPES = ["Mow", "Ditch cut", "Treatment"] as const;

// Badge styling per service type (spec §12: Mow green, Ditch cut orange, Treatment violet).
export const SERVICE_STYLE: Record<string, string> = {
  Mow: "bg-green-100 text-green-700",
  "Ditch cut": "bg-orange-100 text-orange-700",
  Treatment: "bg-violet-100 text-violet-700",
};

export function serviceStyle(type: string): string {
  return SERVICE_STYLE[type] ?? "bg-stone-100 text-stone-600";
}

export function money(p: number | null | undefined): string {
  return p == null ? "—" : `$${p}`;
}
