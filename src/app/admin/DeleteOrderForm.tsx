"use client";

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
  return (
    <form
      action={deleteOrder}
      className="delete-order-form"
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Delete ${customerName} (${orderCode}) forever? This removes the customer data, order items, status history, and payment proof.`,
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderCode" value={orderCode} />
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
