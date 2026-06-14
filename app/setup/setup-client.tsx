"use client";

import { useState, useTransition } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  MapPin,
  KeyRound,
  Phone,
  Pause,
  Repeat,
  Clock,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import type { CustomerWithServices, Customer, Service, Profile } from "@/lib/types";
import { serviceStyle, money } from "@/lib/constants";
import { CrewPanel } from "./crew-panel";
import { CustomerForm } from "./customer-form";
import { ServiceForm } from "./service-form";
import { deleteCustomer, deleteService, reorderService } from "./actions";

type ServiceFormState = {
  initial: Service | null;
  customerId: string;
  customerName: string;
};

export function SetupClient({
  customers,
  profiles,
}: {
  customers: CustomerWithServices[];
  profiles: Profile[];
}) {
  const [customerForm, setCustomerForm] = useState<{
    open: boolean;
    initial: Customer | null;
  } | null>(null);
  const [serviceForm, setServiceForm] = useState<ServiceFormState | null>(null);
  const [pending, startTransition] = useTransition();

  function removeCustomer(c: Customer) {
    if (
      !window.confirm(
        `Delete ${c.name}? This also removes their services and visit history.`,
      )
    )
      return;
    startTransition(async () => {
      await deleteCustomer(c.id);
    });
  }

  function removeService(s: Service) {
    if (!window.confirm("Delete this service?")) return;
    startTransition(async () => {
      await deleteService(s.id);
    });
  }

  function move(s: Service, dir: "up" | "down") {
    startTransition(async () => {
      await reorderService(s.id, dir);
    });
  }

  return (
    <div className="px-5 mt-5 space-y-5">
      <CrewPanel profiles={profiles} />

      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold uppercase tracking-wide text-stone-400">
          Customers · {customers.length}
        </span>
        <button
          onClick={() => setCustomerForm({ open: true, initial: null })}
          className="inline-flex items-center gap-1 text-sm font-bold text-green-700"
        >
          <Plus className="w-4 h-4" /> Add customer
        </button>
      </div>

      <div className="space-y-3">
        {customers.map((c) => (
          <CustomerCard
            key={c.id}
            customer={c}
            disabled={pending}
            onEdit={() => setCustomerForm({ open: true, initial: c })}
            onDelete={() => removeCustomer(c)}
            onAddService={() =>
              setServiceForm({
                initial: null,
                customerId: c.id,
                customerName: c.name,
              })
            }
            onEditService={(s) =>
              setServiceForm({
                initial: s,
                customerId: c.id,
                customerName: c.name,
              })
            }
            onDeleteService={removeService}
            onMove={move}
          />
        ))}

        {customers.length === 0 && (
          <div className="text-center text-stone-400 text-sm py-10 bg-white rounded-2xl border border-stone-200">
            No customers yet. Add the first one to get started.
          </div>
        )}
      </div>

      {customerForm?.open && (
        <CustomerForm
          initial={customerForm.initial}
          onClose={() => setCustomerForm(null)}
        />
      )}
      {serviceForm && (
        <ServiceForm
          initial={serviceForm.initial}
          customerId={serviceForm.customerId}
          customerName={serviceForm.customerName}
          onClose={() => setServiceForm(null)}
        />
      )}
    </div>
  );
}

function CustomerCard({
  customer,
  disabled,
  onEdit,
  onDelete,
  onAddService,
  onEditService,
  onDeleteService,
  onMove,
}: {
  customer: CustomerWithServices;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAddService: () => void;
  onEditService: (s: Service) => void;
  onDeleteService: (s: Service) => void;
  onMove: (s: Service, dir: "up" | "down") => void;
}) {
  const c = customer;
  const services = [...c.services].sort((a, b) => a.sort_order - b.sort_order);
  const needsGeocode = !!c.address && (c.lat == null || c.lng == null);

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold truncate">{c.name}</div>
          <div className="flex items-center gap-1 text-sm text-stone-500 mt-0.5">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {c.address ? `${c.address}${c.city ? `, ${c.city}` : ""}` : "No address"}
            </span>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="p-2 text-stone-400 hover:text-stone-900"
            aria-label="Edit customer"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            disabled={disabled}
            className="p-2 text-stone-400 hover:text-red-500"
            aria-label="Delete customer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* customer-level tags */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {c.meet_first && (
          <span className="inline-flex items-center gap-1 bg-amber-200 text-amber-900 text-xs font-bold px-2 py-0.5 rounded">
            <Phone className="w-3 h-3" /> Text Katy first
          </span>
        )}
        {c.gate_code && (
          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs font-mono font-semibold px-2 py-0.5 rounded">
            <KeyRound className="w-3 h-3" /> {c.gate_code}
          </span>
        )}
        {c.hold_until && (
          <span className="inline-flex items-center gap-1 bg-stone-100 text-stone-500 text-xs font-mono px-2 py-0.5 rounded">
            <Pause className="w-3 h-3" /> hold {c.hold_until}
          </span>
        )}
        {needsGeocode && (
          <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 text-xs font-semibold px-2 py-0.5 rounded">
            <AlertTriangle className="w-3 h-3" /> Not geocoded
          </span>
        )}
      </div>

      {c.notes && (
        <div className="text-xs text-stone-500 mt-2 bg-stone-50 rounded-lg px-3 py-2">
          {c.notes}
        </div>
      )}

      {/* services */}
      <div className="mt-3 border-t border-stone-100 pt-3 space-y-2">
        {services.map((s, i) => (
          <div
            key={s.id}
            className="flex items-center gap-2 rounded-xl bg-stone-50 px-2.5 py-2"
          >
            {services.length > 1 && (
              <div className="flex flex-col -my-1">
                <button
                  onClick={() => onMove(s, "up")}
                  disabled={disabled || i === 0}
                  className="text-stone-300 enabled:hover:text-stone-700 disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onMove(s, "down")}
                  disabled={disabled || i === services.length - 1}
                  className="text-stone-300 enabled:hover:text-stone-700 disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${serviceStyle(
                    s.service_type,
                  )}`}
                >
                  {s.service_type}
                </span>
                <span className="font-mono text-sm font-bold text-stone-700">
                  {money(s.price)}
                </span>
                {s.day && (
                  <span className="text-[10px] font-bold uppercase text-stone-500">
                    {s.day}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-stone-400 mt-0.5 font-mono">
                <span className="inline-flex items-center gap-1">
                  <Repeat className="w-3 h-3" />
                  {s.interval}
                </span>
                {s.window_start && s.window_end && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {s.window_start.slice(0, 5)}–{s.window_end.slice(0, 5)}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => onEditService(s)}
              className="p-1.5 text-stone-400 hover:text-stone-900"
              aria-label="Edit service"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDeleteService(s)}
              disabled={disabled}
              className="p-1.5 text-stone-400 hover:text-red-500"
              aria-label="Delete service"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        <button
          onClick={onAddService}
          className="w-full py-2 rounded-xl border border-dashed border-stone-300 text-stone-500 font-bold uppercase tracking-wide text-xs flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add service
        </button>
      </div>
    </div>
  );
}
