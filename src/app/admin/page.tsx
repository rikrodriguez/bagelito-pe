import Link from "next/link";
import { Eye, FileDown } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { fetchOrders, getDashboardStats, getDeliverySummary, getProductionSummary, hasUploadedPaymentProof, isManualPaymentPending, type Order } from "@/lib/admin/queries";
import { getMissingAdminEnv } from "@/lib/env";

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="stat-card"><span>{label}</span><strong>{value}</strong></div>;
}

function PaymentCell({ order }: { order: Order }) {
  if (isManualPaymentPending(order)) return <span>Pending/manual follow-up</span>;
  return <span>{order.payment_method} - {order.payment_transaction_number}</span>;
}

export default async function AdminPage() {
  await requireAdmin();
  const missing = getMissingAdminEnv();

  if (missing.length) {
    return <main className="admin-page"><section className="admin-shell admin-card"><h1>Setup needed</h1><p>Missing environment variables: {missing.join(", ")}</p></section></main>;
  }

  const orders = await fetchOrders();
  const stats = getDashboardStats(orders);
  const production = getProductionSummary(orders);
  const delivery = getDeliverySummary(orders);

  return (
    <main className="admin-page">
      <section className="admin-shell">
        <div className="admin-topbar">
          <div><p className="kicker">Mini CRM</p><h1>Bagelito reservations</h1></div>
          <div className="admin-export-row">
            <a href="/admin/export/orders"><FileDown size={16} /> Orders CSV</a>
            <a href="/admin/export/production"><FileDown size={16} /> Production CSV</a>
            <a href="/admin/export/delivery"><FileDown size={16} /> Delivery CSV</a>
          </div>
        </div>

        <div className="stat-grid">
          <Stat label="Reservations received" value={stats.total} />
          <Stat label="Payment pending review" value={stats.pending} />
          <Stat label="Payment confirmed" value={stats.confirmed} />
          <Stat label="Needs correction" value={stats.needsCorrection} />
          <Stat label="Cancelled" value={stats.cancelled} />
          <Stat label="Confirmed revenue" value={`S/${stats.confirmedRevenue}`} />
          <Stat label="Confirmed bagels" value={stats.confirmedBagels} />
        </div>

        <section className="admin-card">
          <div className="admin-card-head"><h2>Orders</h2><p>Payment review and batch status.</p></div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Pack</th><th>Total</th><th>District</th><th>Status</th><th>Payment</th><th>Proof</th><th>Actions</th></tr></thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.order_code}</td>
                    <td>{new Date(order.created_at).toLocaleDateString("en-US")}</td>
                    <td><strong>{order.customer_name}</strong><span>{order.whatsapp}</span><span>{order.email}</span></td>
                    <td>{order.pack_name}</td>
                    <td>S/{Number(order.total_amount)}</td>
                    <td>{order.district}</td>
                    <td><span className="status-pill">{order.status.replaceAll("_", " ")}</span></td>
                    <td><PaymentCell order={order} /></td>
                    <td>{hasUploadedPaymentProof(order) ? <a href={`/admin/payment-proof/${order.order_code}`} target="_blank" rel="noreferrer">View</a> : <span>No proof yet</span>}</td>
                    <td><Link className="mini-link" href={`/admin/orders/${order.order_code}`}><Eye size={15} /> View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="admin-panels">
          <section className="admin-card">
            <h2>Production summary</h2>
            <p>Only confirmed orders appear here.</p>
            {production.length ? production.map((item) => <div className="summary-row" key={item.flavorName}><span>{item.flavorName}</span><strong>{item.quantity}</strong></div>) : <p>No confirmed production yet.</p>}
          </section>
          <section className="admin-card">
            <h2>Delivery summary</h2>
            {delivery.length ? delivery.map((group) => <div className="summary-row tall" key={group.district}><span>{group.district}<small>{group.orders.map((order) => order.customer_name).join(", ")}</small></span><strong>{group.orders.length} orders / {group.bagels} bagels</strong></div>) : <p>No confirmed deliveries yet.</p>}
          </section>
        </div>
      </section>
    </main>
  );
}
