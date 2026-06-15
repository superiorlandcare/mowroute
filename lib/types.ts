export type Role = "admin" | "crew";

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  active: boolean;
  created_at: string;
}

export type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";

export type Interval =
  | "Weekly"
  | "Biweekly"
  | "Monthly"
  | "Every other month"
  | "Seasonal";

export interface Customer {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  gate_code: string | null;
  notes: string | null;
  meet_first: boolean;
  hold_until: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  customer_id: string;
  service_type: string;
  price: number | null;
  day: Day | null;
  interval: Interval;
  anchor_date: string | null;
  service_minutes: number;
  window_start: string | null;
  window_end: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export interface CustomerWithServices extends Customer {
  services: Service[];
}

export type VisitStatus = "pending" | "in_progress" | "done" | "skipped";

export interface Visit {
  id: string;
  service_id: string;
  customer_id: string;
  service_date: string;
  status: VisitStatus;
  skip_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_minutes: number | null;
  price_snapshot: number | null;
  service_type_snapshot: string | null;
  performed_by: string | null;
}

// A single card on the board: the cycle's visit + the service + the customer.
export interface BoardRow {
  visit: Visit;
  service: Service;
  customer: Customer;
}

export type ActionResult = { error?: string; ok?: boolean };

