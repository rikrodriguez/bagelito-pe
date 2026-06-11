import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { fetchOrderByCode, hasUploadedPaymentProof, isManualPaymentPending, type Order } from "@/lib/admin/queries";
import { getMissingAdminEnv } from "@/lib/env";
import { updateAdminNote, updateOrderStatus } from "../../actions";

const statuses = ["payment_pending_review", "payment_confirmed", "needs_correction", "in_production", "ready_for_delivery", "delivered", "cancelled"];

export default async function OrderDetailPage({ params }: { params: Promise<{ orderCode: string }> }) {
  await requireAdmin();
  const missing = getMissingAdminEnv();
  const { orderCode } = await params;

  if (missing.length) {
    return <main className="admin-page"><section className="admin-shell admin-card"><h1>Setup needed</h1><p>Missing environment variables: {missing.join(", ")}</p></section></main>;
  }

  const order = await fetchOrderByCode(orderCode);
  if (!order) notFound();

  return (
    <main className="admin-page">
      <section className="admin-shell">
        <Link className="mini-link" href="/admin"><ArrowLeft size={16} /> Back to CRM</Link>
        <div className="admin-topbar"><div><p className="kicker">Order detail</p><h1>{order.order_code}</h1></div><span className="status-pill">{order.status.replaceAll("_", " ")}</span></div>
        <div className="admin-panels detail-panels">
          <div className="admin-card"><h2>Customer</h2><p>{order.customer_name}</p><p>{order.whatsapp}</p><p>{order.email}</p></div>
          <div className="admin-card"><h2>Delivery</h2><p>{order.delivery_address}</p><p>{order.district}</p><p>{order.address_reference}</p><p>{order.delivery_notes}</p></div>
          <div className="admin-card"><h2>Pack</h2><p>{order.pack_name}</p><p>S/{Number(order.total_amount)}</p><ul>{order.order_items?.map((item) => <li key={item.id}>{item.quantity} x {item.flavor_name}</li>)}</ul></div>
          <div className="admin-card"><h2>Payment</h2><PaymentDetail order={order} /></div>
        </div>
        <div className="admin-panels detail-panels">
          <div className="admin-card"><h2>Status</h2><form className="admin-detail-form" action={updateOrderStatus}><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="orderCode" value={order.order_code} /><select name="status" defaultValue={order.status}>{statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select><button className="pill-button pink" type="submit">Update status</button></form></div>
          <div className="admin-card"><h2>Admin notes</h2><form className="admin-detail-form" action={updateAdminNote}><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="orderCode" value={order.order_code} /><textarea name="adminNotes" defaultValue={order.admin_notes ?? ""} rows={5} /><button className="pill-button pink" type="submit">Save note</button></form></div>
        </div>
        <div className="admin-card"><h2>Status history</h2>{order.order_status_history?.length ? order.order_status_history.map((item) => <p key={item.id}>{new Date(item.created_at).toLocaleString("en-US")}: {item.old_status ?? "new"} to {item.new_status} by {item.changed_by ?? "admin"}</p>) : <p>No status history yet.</p>}</div>
      </section>
    </main>
  );
}

function PaymentDetail({ order }: { order: Order }) {
  if (isManualPaymentPending(order)) {
    return <><p><strong>Pending/manual follow-up</strong></p><p>Coordinate payment details via WhatsApp before production closes.</p><p>No uploaded payment proof yet.</p></>;
  }

  return <><p>{order.payment_method}</p><p>Transaction: {order.payment_transaction_number}</p><p>Name: {order.payment_holder_name}</p><p>Phone: {order.payment_phone_number}</p>{hasUploadedPaymentProof(order) ? <a className="mini-link" href={`/admin/payment-proof/${order.order_code}`} target="_blank" rel="noreferrer"><Eye size={16} /> View screenshot</a> : <p>No uploaded payment proof yet.</p>}</>;
}
