import { createClient } from "@/lib/supabase/server";
import type {
  CustomerWithServices,
  Customer,
  Service,
  Profile,
} from "@/lib/types";

// All data the Setup screen needs. RLS lets any authed user read; writes are
// admin-only (enforced in the server actions + RLS).
export async function getSetupData(): Promise<{
  customers: CustomerWithServices[];
  profiles: Profile[];
}> {
  const supabase = await createClient();

  const [customersRes, servicesRes, profilesRes] = await Promise.all([
    supabase.from("customers").select("*").order("name"),
    supabase.from("services").select("*").order("sort_order"),
    supabase.from("profiles").select("*").order("created_at"),
  ]);

  const customers = (customersRes.data ?? []) as Customer[];
  const services = (servicesRes.data ?? []) as Service[];
  const profiles = (profilesRes.data ?? []) as Profile[];

  const byCustomer = new Map<string, Service[]>();
  for (const s of services) {
    const list = byCustomer.get(s.customer_id) ?? [];
    list.push(s);
    byCustomer.set(s.customer_id, list);
  }

  return {
    customers: customers.map((c) => ({
      ...c,
      services: byCustomer.get(c.id) ?? [],
    })),
    profiles,
  };
}
