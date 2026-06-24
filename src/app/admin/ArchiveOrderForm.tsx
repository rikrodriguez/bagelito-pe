"use client";

import { useFormStatus } from "react-dom";
import { Archive, RotateCcw } from "lucide-react";
import { archiveOrder, restoreOrder } from "./actions";

type ArchiveOrderFormProps = {
  orderId: string;
  orderCode: string;
  customerName: string;
  archived?: boolean;
  label?: string;
  returnTo?: string;
};

export function ArchiveOrderForm({
  orderId,
  orderCode,
  customerName,
  archived = false,
  label,
  returnTo,
}: ArchiveOrderFormProps) {
  const action = archived ? restoreOrder : archiveOrder;
  const defaultLabel = archived ? "Restore customer" : "Archive customer";

  return (
    <form
      action={action}
      className="archive-order-form"
      onSubmit={(event) => {
        const confirmed = window.confirm(
          archived
            ? `Restore ${customerName} (${orderCode}) to the active admin list?`
            : `Archive ${customerName} (${orderCode})? This hides the customer from daily operations without deleting records.`,
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderCode" value={orderCode} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <ArchiveButton archived={archived} label={label ?? defaultLabel} />
    </form>
  );
}

function ArchiveButton({ archived, label }: { archived: boolean; label: string }) {
  const { pending } = useFormStatus();
  const Icon = archived ? RotateCcw : Archive;

  return (
    <button className={`status-action ${archived ? "restore" : "archive"}`} disabled={pending} type="submit">
      <Icon size={15} />
      <span>{pending ? (archived ? "Restoring..." : "Archiving...") : label}</span>
    </button>
  );
}
