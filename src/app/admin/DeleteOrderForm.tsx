"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { deleteOrder } from "./actions";

type DeleteOrderFormProps = {
  orderId: string;
  orderCode: string;
  customerName: string;
  label?: string;
};

export function DeleteOrderForm({ orderId, orderCode, customerName, label = "Delete customer" }: DeleteOrderFormProps) {
  const confirmCodeRef = useRef<HTMLInputElement>(null);

  return (
    <form
      action={deleteOrder}
      className="delete-order-form"
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Permanent delete for ${customerName} (${orderCode})? Export the full CSV first. This removes the customer data, order items, status history, and payment proof.`,
        );
        if (!confirmed) {
          event.preventDefault();
          return;
        }

        const typedCode = window.prompt(`Type ${orderCode} to permanently delete this customer.`);
        if (typedCode !== orderCode) {
          event.preventDefault();
          window.alert("Delete cancelled. The order code did not match.");
          return;
        }

        if (confirmCodeRef.current) confirmCodeRef.current.value = typedCode;
      }}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderCode" value={orderCode} />
      <input ref={confirmCodeRef} type="hidden" name="confirmOrderCode" defaultValue="" />
      <DeleteButton label={label} />
    </form>
  );
}

function DeleteButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button className="status-action delete" disabled={pending} type="submit">
      <Trash2 size={15} />
      <span>{pending ? "Deleting..." : label}</span>
    </button>
  );
}
