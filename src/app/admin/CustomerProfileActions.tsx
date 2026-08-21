"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Archive, Trash2 } from "lucide-react";
import { archiveCustomerProfile, deleteCustomerProfile } from "./actions";

type CustomerProfileActionsProps = {
  blocked: boolean;
  customerKey: string;
  customerName: string;
};

export function CustomerProfileActions({ blocked, customerKey, customerName }: CustomerProfileActionsProps) {
  const confirmNameRef = useRef<HTMLInputElement>(null);

  return (
    <div className="customer-profile-action-stack">
      <div className="customer-profile-destructive-actions">
        <form
          action={archiveCustomerProfile}
          className="archive-customer-form"
          onSubmit={(event) => {
            if (!window.confirm(`Archive ${customerName}? Their records stay available in Archive and can be restored.`)) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="customerKey" value={customerKey} />
          <CustomerActionButton blocked={blocked} kind="archive" />
        </form>

        <form
          action={deleteCustomerProfile}
          className="delete-customer-form"
          onSubmit={(event) => {
            const confirmed = window.confirm(
              `Permanently delete ${customerName}? Export the full CSV first. This removes all linked orders, payment proofs, status history, and the matching waitlist lead. This cannot be undone.`,
            );
            if (!confirmed) {
              event.preventDefault();
              return;
            }

            const typedName = window.prompt(`Type ${customerName} to permanently delete this customer.`);
            if (typedName !== customerName) {
              event.preventDefault();
              window.alert("Delete cancelled. The customer name did not match.");
              return;
            }

            if (confirmNameRef.current) confirmNameRef.current.value = typedName;
          }}
        >
          <input type="hidden" name="customerKey" value={customerKey} />
          <input ref={confirmNameRef} type="hidden" name="confirmCustomerName" defaultValue="" />
          <CustomerActionButton blocked={blocked} kind="delete" />
        </form>
      </div>
      {blocked ? <small className="customer-profile-action-note">Complete or cancel active orders first.</small> : null}
    </div>
  );
}

function CustomerActionButton({ blocked, kind }: { blocked: boolean; kind: "archive" | "delete" }) {
  const { pending } = useFormStatus();
  const deleting = kind === "delete";
  const Icon = deleting ? Trash2 : Archive;
  const label = deleting ? "Delete permanently" : "Archive";
  const pendingLabel = deleting ? "Deleting..." : "Archiving...";

  return (
    <button
      className={`status-action ${deleting ? "delete" : "archive"}`}
      disabled={blocked || pending}
      title={blocked ? "Complete or cancel active orders first" : undefined}
      type="submit"
    >
      <Icon size={15} />
      <span>{pending ? pendingLabel : label}</span>
    </button>
  );
}
