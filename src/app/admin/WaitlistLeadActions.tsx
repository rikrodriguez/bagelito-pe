"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { archiveWaitlistLead, deleteWaitlistLead, restoreWaitlistLead } from "./actions";

type WaitlistLeadActionsProps = {
  archived: boolean;
  customerName: string;
  leadId: string;
  returnTo: string;
};

export function WaitlistLeadActions({ archived, customerName, leadId, returnTo }: WaitlistLeadActionsProps) {
  const confirmCustomerNameRef = useRef<HTMLInputElement>(null);
  const archiveAction = archived ? restoreWaitlistLead : archiveWaitlistLead;

  return (
    <div className="waitlist-lead-admin-actions">
      <form
        action={archiveAction}
        className="archive-waitlist-form"
        onSubmit={(event) => {
          const confirmed = window.confirm(
            archived
              ? `Restore ${customerName} to the active waitlist?`
              : `Archive ${customerName}? The lead will leave the active list but can be restored later.`,
          );
          if (!confirmed) event.preventDefault();
        }}
      >
        <input type="hidden" name="leadId" value={leadId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <ArchiveButton archived={archived} customerName={customerName} />
      </form>

      <form
        action={deleteWaitlistLead}
        className="delete-waitlist-form"
        onSubmit={(event) => {
          const confirmed = window.confirm(
            `Permanently delete ${customerName} from the waitlist? Export the Waitlist CSV first if you need a backup. This cannot be undone.`,
          );
          if (!confirmed) {
            event.preventDefault();
            return;
          }

          const typedName = window.prompt(`Type ${customerName} to permanently delete this lead.`);
          if (typedName?.trim() !== customerName.trim()) {
            event.preventDefault();
            window.alert("Delete cancelled. The customer name did not match.");
            return;
          }

          if (confirmCustomerNameRef.current) confirmCustomerNameRef.current.value = typedName.trim();
        }}
      >
        <input type="hidden" name="leadId" value={leadId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <input ref={confirmCustomerNameRef} type="hidden" name="confirmCustomerName" defaultValue="" />
        <DeleteButton customerName={customerName} />
      </form>
    </div>
  );
}

function ArchiveButton({ archived, customerName }: { archived: boolean; customerName: string }) {
  const { pending } = useFormStatus();
  const Icon = archived ? RotateCcw : Archive;
  const label = archived ? "Restore" : "Archive";

  return (
    <button
      aria-label={`${label} ${customerName}`}
      className={`status-action ${archived ? "restore" : "archive"}`}
      disabled={pending}
      type="submit"
    >
      <Icon aria-hidden="true" size={15} />
      <span>{pending ? (archived ? "Restoring..." : "Archiving...") : label}</span>
    </button>
  );
}

function DeleteButton({ customerName }: { customerName: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-label={`Delete ${customerName} permanently`}
      className="status-action delete"
      disabled={pending}
      type="submit"
    >
      <Trash2 aria-hidden="true" size={15} />
      <span>{pending ? "Deleting..." : "Delete"}</span>
    </button>
  );
}
