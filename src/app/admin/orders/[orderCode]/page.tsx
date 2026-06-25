import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import {
  fetchOrderByCode,
  getOrderArchiveState,
  hasUploadedPaymentProof,
  isManualPaymentPending,
  isOrderArchived,
  type Order,
} from "@/lib/admin/queries";
import { canSendAdminWhatsAppIntent, hasAdminWhatsAppMessageSent, parseAdminWhatsAppIntent, type AdminWhatsAppIntent } from "@/lib/admin/whatsapp-messages";
import { getMissingAdminEnv } from "@/lib/env";
import { AdminWhatsAppLink, AdminWhatsAppNotice } from "../../AdminWhatsAppMessage";
import { ArchiveOrderForm } from "../../ArchiveOrderForm";
import { DeleteOrderForm } from "../../DeleteOrderForm";
import { updateAdminNote, updateOrderStatus } from "../../actions";

const statuses = ["payment_pending_review", "payment_confirmed", "needs_correction", "in_production", "ready_for_delivery", "delivered", "cancelled"];
const statusLabels: Record<string, string> = {
  payment_pending_review: "payment pending review",
  payment_confirmed: "payment confirmed",
  needs_correction: "needs correction",
  in_production: "in production",
  ready_for_delivery: "ready for delivery",
  delivered: "received by customer",
  cancelled: "cancelled",
  archived: "archived",
  unarchived: "restored",
  whatsapp_order_received_sent: "WhatsApp order received message sent",
  whatsapp_payment_confirmed_sent: "WhatsApp payment message sent",
  whatsapp_delivery_reminder_sent: "WhatsApp delivery reminder sent",
  whatsapp_delivered_sent: "WhatsApp received message sent",
  whatsapp_feedback_request_sent: "WhatsApp feedback request sent",
};

function statusLabel(status: string) {
  return statusLabels[status] ?? status.replaceAll("_", " ");
}

function WhatsAppDetailAction({
  blockedLabel,
  intent,
  label,
  loggedLabel,
  order,
}: {
  blockedLabel: string;
  intent: AdminWhatsAppIntent;
  label: string;
  loggedLabel: string;
  order: Order;
}) {
  if (hasAdminWhatsAppMessageSent(order, intent)) {
    return <span className="handoff-status received">{loggedLabel}</span>;
  }

  if (!canSendAdminWhatsAppIntent(order, intent)) {
    return <span className="handoff-status pending">{blockedLabel}</span>;
  }

  return <AdminWhatsAppLink order={order} intent={intent} label={label} returnTo={`/admin/orders/${order.order_code}?whatsappSent=${intent}`} />;
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderCode: string }>;
  searchParams?: Promise<{ deleteError?: string; whatsapp?: string; whatsappError?: string; whatsappSent?: string }>;
}) {
  await requireAdmin();
  const missing = getMissingAdminEnv();
  const { orderCode } = await params;
  const query = await searchParams;

  if (missing.length) {
    return <main className="admin-page"><section className="admin-shell admin-card"><h1>Setup needed</h1><p>Missing environment variables: {missing.join(", ")}</p></section></main>;
  }

  const order = await fetchOrderByCode(orderCode);
  if (!order) notFound();
  const archived = isOrderArchived(order);
  const archiveState = getOrderArchiveState(order);
  const whatsappIntent = parseAdminWhatsAppIntent(query?.whatsapp);

  return (
    <main className="admin-page">
      <section className="admin-shell">
        <Link className="mini-link" href="/admin"><ArrowLeft size={16} /> Back to CRM</Link>
        <div className="admin-topbar"><div><p className="kicker">Order detail</p><h1>{order.order_code}</h1></div><span className={`status-pill ${archived ? "archived" : order.status === "delivered" ? "received" : ""}`}>{archived ? "archived" : statusLabel(order.status)}</span></div>
        {whatsappIntent ? (
          <AdminWhatsAppNotice
            order={order}
            intent={whatsappIntent}
            returnTo={`/admin/orders/${order.order_code}?whatsappSent=${whatsappIntent}`}
          />
        ) : null}
        {query?.deleteError === "confirmation" ? (
          <div className="admin-flash warning">Delete cancelled. Type the exact order code to permanently delete this customer.</div>
        ) : null}
        {query?.whatsappError === "status" ? (
          <div className="admin-flash warning">WhatsApp follow-up was not logged because this order status is not ready for that message.</div>
        ) : null}
        {query?.whatsappSent ? (
          <div className="admin-flash success">WhatsApp follow-up logged for {order.order_code}.</div>
        ) : null}
        <div className="admin-panels detail-panels">
          <div className="admin-card"><h2>Customer</h2><p>{order.customer_name}</p><p>{order.whatsapp}</p><p>{order.email}</p></div>
          <div className="admin-card"><h2>Delivery</h2><p>{order.delivery_address}</p><p>{order.district}</p><p>{order.address_reference}</p><p>{order.delivery_notes}</p></div>
          <div className="admin-card"><h2>Pack</h2><p>{order.pack_name}</p><p>S/{Number(order.total_amount)}</p><ul>{order.order_items?.map((item) => <li key={item.id}>{item.quantity} x {item.flavor_name}</li>)}</ul></div>
          <div className="admin-card"><h2>Payment</h2><PaymentDetail order={order} /></div>
          <div className="admin-card"><h2>Customer received?</h2><p><span className={`handoff-status ${order.status === "delivered" ? "received" : "pending"}`}>{order.status === "delivered" ? "Yes, received by customer" : "Not marked received yet"}</span></p><p>Set status to “received by customer” after delivery handoff is confirmed.</p></div>
        </div>
        <div className="admin-panels detail-panels">
          <div className="admin-card"><h2>Status</h2><form className="admin-detail-form" action={updateOrderStatus}><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="orderCode" value={order.order_code} /><select name="status" defaultValue={order.status}>{statuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select><button className="pill-button pink" type="submit">Update status</button></form></div>
          <div className="admin-card whatsapp-zone"><h2>Customer comms</h2><p>Open and log the right WhatsApp message for each stage: post-compra, delivery reminder, received and feedback.</p><div className="admin-detail-actions"><WhatsAppDetailAction order={order} intent="order_received" label="Order received" loggedLabel="Order message logged" blockedLabel="Order not active" /><WhatsAppDetailAction order={order} intent="payment_confirmed" label="Payment message" loggedLabel="Payment message logged" blockedLabel="Confirm payment first" /><WhatsAppDetailAction order={order} intent="delivery_reminder" label="Delivery reminder" loggedLabel="Delivery reminder logged" blockedLabel="Set ready for delivery first" /><WhatsAppDetailAction order={order} intent="delivered" label="Received message" loggedLabel="Received message logged" blockedLabel="Mark received first" /><WhatsAppDetailAction order={order} intent="feedback_request" label="Feedback request" loggedLabel="Feedback request logged" blockedLabel="Send received first" /></div></div>
          <div className="admin-card"><h2>Admin notes</h2><form className="admin-detail-form" action={updateAdminNote}><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="orderCode" value={order.order_code} /><textarea name="adminNotes" defaultValue={order.admin_notes ?? ""} rows={5} /><button className="pill-button pink" type="submit">Save note</button></form></div>
          <div className="admin-card archive-zone"><h2>{archived ? "Restore customer" : "Archive customer"}</h2><p>{archived ? `Archived${archiveState.archivedAt ? ` on ${new Date(archiveState.archivedAt).toLocaleString("en-US")}` : ""}. Restore it when it should return to daily operations.` : "Use this for day-to-day cleanup. The order stays in records, but leaves production, delivery, and active CRM views."}</p><ArchiveOrderForm archived={archived} orderId={order.id} orderCode={order.order_code} customerName={order.customer_name} returnTo={`/admin/orders/${order.order_code}`} /></div>
          <div className="admin-card danger-zone"><h2>Delete customer</h2><p><ShieldCheck size={16} /> Before deleting, download the full CSV backup. This permanently removes the customer, order items, status history, and uploaded payment proof.</p><DeleteOrderForm orderId={order.id} orderCode={order.order_code} customerName={order.customer_name} label="Delete permanently" /></div>
        </div>
        <div className="admin-card"><h2>Status history</h2>{order.order_status_history?.length ? order.order_status_history.map((item) => <p key={item.id}>{new Date(item.created_at).toLocaleString("en-US")}: {item.old_status ? statusLabel(item.old_status) : "new"} to {statusLabel(item.new_status)} by {item.changed_by ?? "admin"}</p>) : <p>No status history yet.</p>}</div>
      </section>
    </main>
  );
}

function PaymentDetail({ order }: { order: Order }) {
  if (isManualPaymentPending(order)) {
    return <><p><strong>Legacy order without voucher</strong></p><p>Ask the customer to submit a Yape or Plin payment proof before confirming production.</p><p>No uploaded payment proof yet.</p></>;
  }

  return <><p>{order.payment_method}</p><p>Transaction: {order.payment_transaction_number}</p><p>Name: {order.payment_holder_name}</p><p>Phone: {order.payment_phone_number}</p>{hasUploadedPaymentProof(order) ? <a className="mini-link" href={`/admin/payment-proof/${order.order_code}`} target="_blank" rel="noreferrer"><Eye size={16} /> View screenshot</a> : <p>No uploaded payment proof yet.</p>}</>;
}
