import Link from "next/link";
import {
  AlertCircle,
  Archive,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  Eye,
  FileDown,
  Home,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  ReceiptText,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import {
  batchStatuses,
  fetchCurrentBatch,
  fetchOrders,
  filterActiveOrders,
  filterArchivedOrders,
  getBatchStats,
  getDashboardStats,
  getDeliverySummary,
  getOrderArchiveState,
  getProductionSummary,
  hasUploadedPaymentProof,
  isManualPaymentPending,
  isOrderArchived,
  productionStatuses,
  type Batch,
  type Order,
} from "@/lib/admin/queries";
import {
  buildAdminWhatsAppMessage,
  getAdminWhatsAppFollowUps,
  hasAdminWhatsAppMessageSent,
  parseAdminWhatsAppIntent,
  type AdminWhatsAppIntent,
} from "@/lib/admin/whatsapp-messages";
import { getMissingAdminEnv } from "@/lib/env";
import { AdminWhatsAppLink, AdminWhatsAppNotice } from "./AdminWhatsAppMessage";
import { ArchiveOrderForm } from "./ArchiveOrderForm";
import { quickUpdateOrderStatus, updateBatchSettings } from "./actions";

const paidStatuses = new Set<string>(productionStatuses);

function formatMoney(value: number) {
  return `S/${Math.round(Number(value))}`;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "B";
}

function isPaid(order: Order) {
  return paidStatuses.has(order.status);
}

function isDelivered(order: Order) {
  return order.status === "delivered";
}

function paymentStatusLabel(order: Order) {
  if (isOrderArchived(order)) return "Archived";
  if (isDelivered(order)) return "Received by customer";
  if (isPaid(order)) return "Paid confirmed";
  if (order.status === "needs_correction") return "Needs correction";
  if (order.status === "cancelled") return "Cancelled";
  return "Not confirmed";
}

function statusClass(order: Order) {
  if (isOrderArchived(order)) return "archived";
  if (isDelivered(order)) return "received";
  if (isPaid(order)) return "paid";
  if (order.status === "needs_correction") return "warning";
  if (order.status === "cancelled") return "cancelled";
  return "pending";
}

function humanStatus(status: string) {
  return status.replaceAll("_", " ");
}

function batchStatusLabel(status: string) {
  const labels: Record<string, string> = {
    waitlist_open: "Waitlist / soft open",
    orders_open: "Orders open",
    closed: "Closed",
    in_production: "In production",
    delivered: "Delivered",
  };

  return labels[status] ?? humanStatus(status);
}

function formatDateTimeInput(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "America/Lima",
    year: "numeric",
  }).format(new Date(value));

  return parts.replace(" ", "T");
}

function formatBatchDate(value: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" });
}

function PaymentCell({ order }: { order: Order }) {
  if (isManualPaymentPending(order)) return <span>Manual proof pending</span>;
  return <span>{order.payment_method} - {order.payment_transaction_number}</span>;
}

function Stat({ label, value, helper, icon: Icon }: { label: string; value: string | number; helper?: string; icon: typeof Users }) {
  return (
    <div className="stat-card crm-stat-card">
      <div className="stat-icon"><Icon size={18} /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </div>
  );
}

function getPackStats(orders: Order[]) {
  const map = new Map<string, { label: string; count: number; units: number; revenue: number }>();

  for (const order of orders) {
    const current = map.get(order.pack_slug) ?? { label: order.pack_name, count: 0, units: 0, revenue: 0 };
    current.count += 1;
    current.units += Number(order.pack_units);
    current.revenue += Number(order.total_amount);
    map.set(order.pack_slug, current);
  }

  return Array.from(map.values()).map((item) => ({ ...item, percent: percent(item.count, orders.length) }));
}

function getPackTypeStats(orders: Order[]) {
  const map = new Map<string, { label: string; count: number; units: number }>();

  for (const order of orders) {
    const label = order.pack_type === "single" ? "Single flavor packs" : "Mixed packs";
    const current = map.get(order.pack_type) ?? { label, count: 0, units: 0 };
    current.count += 1;
    current.units += Number(order.pack_units);
    map.set(order.pack_type, current);
  }

  return Array.from(map.values()).map((item) => ({ ...item, percent: percent(item.count, orders.length) }));
}

function getDistrictStats(orders: Order[]) {
  const map = new Map<string, { district: string; orders: number; packs: number; bagels: number; paid: number; pending: number; needsCorrection: number }>();

  for (const order of orders) {
    const current = map.get(order.district) ?? { district: order.district, orders: 0, packs: 0, bagels: 0, paid: 0, pending: 0, needsCorrection: 0 };
    current.orders += 1;
    current.packs += 1;
    current.bagels += Number(order.pack_units);
    if (isPaid(order)) current.paid += 1;
    if (order.status === "payment_pending_review") current.pending += 1;
    if (order.status === "needs_correction") current.needsCorrection += 1;
    map.set(order.district, current);
  }

  return Array.from(map.values()).sort((a, b) => b.orders - a.orders || a.district.localeCompare(b.district));
}

function getFlavorText(order: Order) {
  if (!order.order_items?.length) return "No flavors captured";
  return order.order_items.map((item) => `${item.quantity} x ${item.flavor_name}`).join(" · ");
}

function getReceptionText(order: Order) {
  const notes = order.delivery_notes ?? "";
  if (notes.toLowerCase().includes("porteria") || notes.toLowerCase().includes("portería")) return "Leave at front desk";
  if (notes.toLowerCase().includes("recibo") || notes.toLowerCase().includes("recepciono")) return "Customer receives directly";
  return "Not specified";
}

function StatusAction({ order, status, label, tone }: { order: Order; status: string; label: string; tone: "paid" | "pending" | "warning" | "received" }) {
  return (
    <form action={quickUpdateOrderStatus}>
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="orderCode" value={order.order_code} />
      <input type="hidden" name="status" value={status} />
      <button className={`status-action ${tone}`} disabled={order.status === status} type="submit">
        {label}
      </button>
    </form>
  );
}

function WhatsAppQueue({ followUps }: { followUps: { order: Order; intent: AdminWhatsAppIntent }[] }) {
  return (
    <section className="admin-card whatsapp-queue-card">
      <div className="admin-card-head">
        <div>
          <h2>WhatsApp follow-up queue</h2>
          <p>Mensajes estándar pendientes después de confirmar pago o marcar recibido.</p>
        </div>
        <span className="status-pill neutral">{followUps.length} pending</span>
      </div>

      {followUps.length ? (
        <div className="whatsapp-queue-list">
          {followUps.map(({ order, intent }) => {
            const content = buildAdminWhatsAppMessage(order, intent);

            return (
              <article className="whatsapp-queue-item" key={`${order.id}-${intent}`}>
                <div>
                  <span>{content.eyebrow}</span>
                  <strong>{order.customer_name}</strong>
                  <small>{order.order_code} · {order.pack_name}</small>
                </div>
                <AdminWhatsAppLink order={order} intent={intent} label="Open + log" returnTo={`/admin?whatsappSent=${encodeURIComponent(order.order_code)}`} />
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">No hay WhatsApps pendientes. La cola de seguimiento está limpia.</div>
      )}
    </section>
  );
}

function BatchManagementPanel({ batch, stats }: { batch: Batch; stats: ReturnType<typeof getBatchStats> }) {
  return (
    <section className="admin-card batch-management-card">
      <div className="admin-card-head">
        <div>
          <p className="kicker">Batch management</p>
          <h2>{batch.name}</h2>
          <p>Abre/cierra pedidos, define capacidad y deja clara la fecha operativa del batch.</p>
        </div>
        <span className={`status-pill ${stats.acceptingReservations ? "paid" : "pending"}`}>{batchStatusLabel(batch.status)}</span>
      </div>

      <div className="batch-ops-grid">
        <div>
          <span>Reservations</span>
          <strong>{stats.reservedPacks}{batch.capacity_packs ? ` / ${batch.capacity_packs}` : ""}</strong>
          <small>{stats.remainingPacks === null ? "No pack limit" : `${stats.remainingPacks} packs left`}</small>
          {batch.capacity_packs ? <i><b style={{ width: `${stats.packPercent}%` }} /></i> : null}
        </div>
        <div>
          <span>Bagels reserved</span>
          <strong>{stats.reservedBagels}{batch.capacity_bagels ? ` / ${batch.capacity_bagels}` : ""}</strong>
          <small>{stats.remainingBagels === null ? "No bagel limit" : `${stats.remainingBagels} bagels left`}</small>
          {batch.capacity_bagels ? <i><b style={{ width: `${stats.bagelPercent}%` }} /></i> : null}
        </div>
        <div>
          <span>Paid production</span>
          <strong>{stats.confirmedPacks}</strong>
          <small>{stats.confirmedBagels} confirmed bagels</small>
        </div>
        <div>
          <span>Orders close</span>
          <strong>{formatBatchDate(batch.orders_close_at)}</strong>
          <small>{stats.acceptingReservations ? "Checkout accepting orders" : "Checkout blocked"}</small>
        </div>
        <div>
          <span>Delivery date</span>
          <strong>{formatBatchDate(batch.delivery_date)}</strong>
          <small>Lima timezone</small>
        </div>
      </div>

      <form action={updateBatchSettings} className="batch-settings-form">
        <input type="hidden" name="batchId" value={batch.id} />
        <label>Batch name<input name="name" defaultValue={batch.name} /></label>
        <label>Status<select name="status" defaultValue={batch.status}>{batchStatuses.map((status) => <option key={status} value={status}>{batchStatusLabel(status)}</option>)}</select></label>
        <label>Capacity packs<input min={0} name="capacityPacks" type="number" defaultValue={batch.capacity_packs ?? ""} placeholder="No limit" /></label>
        <label>Capacity bagels<input min={0} name="capacityBagels" type="number" defaultValue={batch.capacity_bagels ?? ""} placeholder="No limit" /></label>
        <label>Orders close at<input name="ordersCloseAt" type="datetime-local" defaultValue={formatDateTimeInput(batch.orders_close_at)} /></label>
        <label>Delivery date<input name="deliveryDate" type="datetime-local" defaultValue={formatDateTimeInput(batch.delivery_date)} /></label>
        <button className="pill-button pink" type="submit"><CalendarClock size={17} /> Save batch</button>
      </form>
    </section>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ batch?: string; deleted?: string; archived?: string; restored?: string; view?: string; whatsapp?: string; order?: string; whatsappError?: string; whatsappSent?: string }>;
}) {
  await requireAdmin();
  const missing = getMissingAdminEnv();
  const params = await searchParams;
  const batchMessage = params?.batch;
  const deletedOrderCode = params?.deleted;
  const archivedOrderCode = params?.archived;
  const restoredOrderCode = params?.restored;
  const whatsappError = params?.whatsappError;
  const whatsappSentOrderCode = params?.whatsappSent;
  const showingArchived = params?.view === "archived";
  const whatsappIntent = parseAdminWhatsAppIntent(params?.whatsapp);
  const whatsappOrderCode = params?.order;

  if (missing.length) {
    return <main className="admin-page"><section className="admin-shell admin-card"><h1>Setup needed</h1><p>Missing environment variables: {missing.join(", ")}</p></section></main>;
  }

  const allOrders = await fetchOrders();
  const currentBatch = await fetchCurrentBatch();
  const activeOrders = filterActiveOrders(allOrders);
  const archivedOrders = filterArchivedOrders(allOrders);
  const orders = showingArchived ? archivedOrders : activeOrders;
  const stats = getDashboardStats(activeOrders);
  const production = getProductionSummary(activeOrders);
  const delivery = getDeliverySummary(activeOrders);
  const paidOrders = activeOrders.filter(isPaid);
  const deliveredOrders = activeOrders.filter(isDelivered);
  const paidNotDeliveredOrders = paidOrders.filter((order) => !isDelivered(order));
  const pendingOrders = activeOrders.filter((order) => order.status === "payment_pending_review" || order.status === "needs_correction");
  const pendingValue = pendingOrders.reduce((sum, order) => sum + Number(order.total_amount), 0);
  const totalBagels = activeOrders.reduce((sum, order) => sum + Number(order.pack_units), 0);
  const missingProofs = activeOrders.filter((order) => !hasUploadedPaymentProof(order)).length;
  const marketingOptIns = activeOrders.filter((order) => order.marketing_opt_in).length;
  const packStats = getPackStats(activeOrders);
  const packTypeStats = getPackTypeStats(activeOrders);
  const districtStats = getDistrictStats(activeOrders);
  const batchStats = getBatchStats(currentBatch, activeOrders);
  const whatsappFollowUps = getAdminWhatsAppFollowUps(activeOrders);
  const whatsappOrder = whatsappIntent && whatsappOrderCode
    ? allOrders.find((order) => order.order_code === whatsappOrderCode)
    : null;

  return (
    <main className="admin-page">
      <section className="admin-shell crm-shell">
        <div className="admin-topbar">
          <div>
            <p className="kicker">Mini CRM</p>
            <h1>Customer reservations</h1>
            <p className="admin-intro">Aquí ves la data de clientes, formularios, packs, distritos y revisión de pagos de Bagelito.</p>
          </div>
          <div className="admin-export-row">
            <a href="/admin/export/orders"><FileDown size={16} /> Full backup CSV</a>
            <a href="/admin/export/production"><FileDown size={16} /> Production CSV</a>
            <a href="/admin/export/delivery"><FileDown size={16} /> Delivery CSV</a>
          </div>
        </div>

        <div className="admin-safety-card">
          <div>
            <span><ShieldCheck size={17} /> Admin safety</span>
            <strong>Export before destructive work. Use Archive for daily cleanup.</strong>
            <p>Supabase database backups protect tables by plan; payment screenshots live in Storage, so keep CSV exports before deleting real customers.</p>
          </div>
          <a href="/admin/export/orders"><FileDown size={16} /> Download full CSV</a>
        </div>

        {deletedOrderCode ? (
          <div className="admin-flash success">
            {deletedOrderCode === "missing" ? "That customer was already deleted." : `Deleted ${deletedOrderCode} permanently.`}
          </div>
        ) : null}

        {batchMessage === "updated" ? (
          <div className="admin-flash success">Batch settings updated.</div>
        ) : null}

        {archivedOrderCode ? (
          <div className="admin-flash success">Archived {archivedOrderCode}. It is hidden from active production and delivery views.</div>
        ) : null}

        {restoredOrderCode ? (
          <div className="admin-flash success">Restored {restoredOrderCode} to the active customer list.</div>
        ) : null}

        {whatsappError === "status" ? (
          <div className="admin-flash warning">WhatsApp follow-up was not logged because the order status is not ready for that message.</div>
        ) : null}

        {whatsappSentOrderCode ? (
          <div className="admin-flash success">WhatsApp follow-up logged for {whatsappSentOrderCode}.</div>
        ) : null}

        {whatsappIntent && whatsappOrder ? (
          <AdminWhatsAppNotice
            order={whatsappOrder}
            intent={whatsappIntent}
            returnTo={`/admin?whatsappSent=${encodeURIComponent(whatsappOrder.order_code)}`}
          />
        ) : null}

        <div className="stat-grid crm-stat-grid">
          <Stat icon={Users} label="Clients / reservations" value={stats.total} helper={`${totalBagels} bagels reserved`} />
          <Stat icon={CheckCircle2} label="Paid confirmed" value={paidOrders.length} helper={`${percent(paidOrders.length, activeOrders.length)}% of active reservations`} />
          <Stat icon={Clock3} label="Not confirmed" value={stats.pending} helper="Payment pending review" />
          <Stat icon={AlertCircle} label="Needs correction" value={stats.needsCorrection} helper="Follow up via WhatsApp" />
          <Stat icon={CreditCard} label="Confirmed revenue" value={formatMoney(stats.confirmedRevenue)} helper="Only paid statuses" />
          <Stat icon={ReceiptText} label="Pending value" value={formatMoney(pendingValue)} helper="Pending + correction" />
          <Stat icon={Package} label="Confirmed bagels" value={stats.confirmedBagels} helper="Production-ready units" />
          <Stat icon={CheckCircle2} label="Received by customer" value={deliveredOrders.length} helper={`${percent(deliveredOrders.length, paidOrders.length)}% of paid orders`} />
          <Stat icon={MessageCircle} label="WhatsApp queue" value={whatsappFollowUps.length} helper="Messages pending" />
        </div>

        <BatchManagementPanel batch={currentBatch} stats={batchStats} />

        <WhatsAppQueue followUps={whatsappFollowUps} />

        <div className="crm-overview-grid">
          <section className="admin-card crm-insight-card">
            <div className="admin-card-head compact"><h2>Pack mix</h2><p>% by selected product.</p></div>
            <div className="metric-list">
              {packStats.length ? packStats.map((item) => (
                <div className="metric-row" key={item.label}>
                  <div><strong>{item.label}</strong><span>{item.count} packs · {item.units} bagels · {formatMoney(item.revenue)}</span></div>
                  <b>{item.percent}%</b>
                  <div className="bar-meter"><i style={{ width: `${item.percent}%` }} /></div>
                </div>
              )) : <p>No pack data yet.</p>}
            </div>
          </section>

          <section className="admin-card crm-insight-card">
            <div className="admin-card-head compact"><h2>Pack types</h2><p>Mixed vs single flavor.</p></div>
            <div className="metric-list">
              {packTypeStats.length ? packTypeStats.map((item) => (
                <div className="metric-row" key={item.label}>
                  <div><strong>{item.label}</strong><span>{item.count} packs · {item.units} bagels</span></div>
                  <b>{item.percent}%</b>
                  <div className="bar-meter"><i style={{ width: `${item.percent}%` }} /></div>
                </div>
              )) : <p>No pack type data yet.</p>}
            </div>
          </section>

          <section className="admin-card crm-insight-card">
            <div className="admin-card-head compact"><h2>Districts</h2><p>All reservations grouped by district.</p></div>
            <div className="district-list">
              {districtStats.length ? districtStats.map((group) => (
                <div className="district-row" key={group.district}>
                  <strong>{group.district}</strong>
                  <span>{group.orders} orders · {group.bagels} bagels</span>
                  <small>{group.paid} paid · {group.pending} pending · {group.needsCorrection} correction</small>
                </div>
              )) : <p>No district data yet.</p>}
            </div>
          </section>

          <section className="admin-card crm-insight-card action-card">
            <div className="admin-card-head compact"><h2>Next actions</h2><p>What needs attention.</p></div>
            <div className="action-list">
              <span><Clock3 size={16} /> {stats.pending} payments waiting for review</span>
              <span><AlertCircle size={16} /> {stats.needsCorrection} orders need correction</span>
              <span><ShieldCheck size={16} /> {missingProofs} orders without uploaded proof</span>
              <span><Package size={16} /> {paidNotDeliveredOrders.length} paid orders not received yet</span>
              <span><Send size={16} /> {whatsappFollowUps.length} WhatsApp follow-ups pending</span>
              <span><Mail size={16} /> {marketingOptIns} customers opted into updates</span>
            </div>
          </section>
        </div>

        <section className="admin-card customer-section">
          <div className="admin-card-head">
            <div>
              <h2>{showingArchived ? "Archived customers" : "Visual customer list"}</h2>
              <p>{showingArchived ? "Pedidos ocultos de operación diaria. Puedes restaurarlos si fueron archivados por error." : "Formulario completo, entrega, pago y acciones rápidas."}</p>
            </div>
            <span className="status-pill neutral">{orders.length} {showingArchived ? "archived" : "active"} reservations</span>
          </div>

          <div className="admin-view-tabs">
            <Link className={!showingArchived ? "active" : ""} href="/admin">Active customers <b>{activeOrders.length}</b></Link>
            <Link className={showingArchived ? "active" : ""} href="/admin?view=archived"><Archive size={15} /> Archive <b>{archivedOrders.length}</b></Link>
          </div>

          <div className="customer-list">
            {orders.length ? orders.map((order) => {
              const archived = isOrderArchived(order);
              const archiveState = getOrderArchiveState(order);

              return (
              <article className="customer-card" key={order.id}>
                <div className="customer-card-main">
                  <div className="customer-avatar">{initials(order.customer_name)}</div>
                  <div className="customer-summary">
                    <div className="customer-title-line">
                      <h3>{order.customer_name}</h3>
                      <span className={`status-pill ${statusClass(order)}`}>{paymentStatusLabel(order)}</span>
                    </div>
                    <p>
                      {order.order_code} · {formatDate(order.created_at)} · <span>{humanStatus(order.status)}</span>
                      {archiveState.archivedAt ? ` · archived ${formatDate(archiveState.archivedAt)}` : ""}
                    </p>
                    <div className="customer-contact-grid">
                      <span><Phone size={14} /> {order.whatsapp}</span>
                      <span><Mail size={14} /> {order.email}</span>
                      <span><MapPin size={14} /> {order.district}</span>
                      <span><Package size={14} /> {order.pack_name}</span>
                    </div>
                  </div>
                </div>

                <div className="reservation-data-grid">
                  <div className="data-block">
                    <small>Pack</small>
                    <strong>{order.pack_name}</strong>
                    <span>{order.pack_units} bagels · {order.pack_type} · {formatMoney(Number(order.total_amount))}</span>
                  </div>
                  <div className="data-block">
                    <small>Flavors</small>
                    <strong>{getFlavorText(order)}</strong>
                  </div>
                  <div className="data-block wide">
                    <small>Delivery form data</small>
                    <strong><Home size={14} /> {order.delivery_address}</strong>
                    <span>{order.address_reference ? `Reference: ${order.address_reference}` : "No address reference"}</span>
                    <span>{getReceptionText(order)}{order.delivery_notes ? ` · ${order.delivery_notes}` : ""}</span>
                    <span className={`handoff-status ${isDelivered(order) ? "received" : "pending"}`}>
                      {isDelivered(order) ? "Received by customer" : isPaid(order) ? "Paid, not received yet" : "Waiting for paid confirmation"}
                    </span>
                  </div>
                  <div className="data-block">
                    <small>Payment</small>
                    <strong><PaymentCell order={order} /></strong>
                    <span>Name: {order.payment_holder_name}</span>
                    <span>Phone: {order.payment_phone_number}</span>
                  </div>
                  <div className="data-block">
                    <small>Proof</small>
                    {hasUploadedPaymentProof(order) ? <a href={`/admin/payment-proof/${order.order_code}`} target="_blank" rel="noreferrer">View private signed proof</a> : <strong>No proof uploaded yet</strong>}
                    <span>{order.marketing_opt_in ? "Marketing updates: yes" : "Marketing updates: no"}</span>
                  </div>
                </div>

                <div className="customer-actions">
                  {archived ? (
                    <ArchiveOrderForm
                      archived
                      orderId={order.id}
                      orderCode={order.order_code}
                      customerName={order.customer_name}
                      returnTo={`/admin?view=archived&restored=${encodeURIComponent(order.order_code)}`}
                    />
                  ) : (
                    <>
                      <StatusAction order={order} status="payment_confirmed" label="Confirm paid" tone="paid" />
                      <StatusAction order={order} status="payment_pending_review" label="Not confirmed" tone="pending" />
                      <StatusAction order={order} status="needs_correction" label="Needs correction" tone="warning" />
                      {isPaid(order) ? <StatusAction order={order} status="delivered" label={isDelivered(order) ? "Received" : "Mark received"} tone="received" /> : null}
                      {isPaid(order) && !hasAdminWhatsAppMessageSent(order, "payment_confirmed") ? <AdminWhatsAppLink order={order} intent="payment_confirmed" label="Msg paid" returnTo={`/admin?whatsappSent=${encodeURIComponent(order.order_code)}`} /> : null}
                      {isDelivered(order) && !hasAdminWhatsAppMessageSent(order, "delivered") ? <AdminWhatsAppLink order={order} intent="delivered" label="Msg received" returnTo={`/admin?whatsappSent=${encodeURIComponent(order.order_code)}`} /> : null}
                      <ArchiveOrderForm
                        orderId={order.id}
                        orderCode={order.order_code}
                        customerName={order.customer_name}
                        returnTo={`/admin?archived=${encodeURIComponent(order.order_code)}`}
                      />
                    </>
                  )}
                  <Link className="mini-link" href={`/admin/orders/${order.order_code}`}><Eye size={15} /> Detail</Link>
                </div>
              </article>
              );
            }) : <div className="empty-state">{showingArchived ? "No archived reservations yet." : "No reservations yet. Customer data will appear here after the reservation form is submitted."}</div>}
          </div>
        </section>

        <div className="admin-panels">
          <section className="admin-card">
            <h2>Production summary</h2>
            <p>Only paid-confirmed orders enter production.</p>
            {production.length ? production.map((item) => <div className="summary-row" key={item.flavorName}><span>{item.flavorName}</span><strong>{item.quantity}</strong></div>) : <p>No confirmed production yet.</p>}
          </section>
          <section className="admin-card">
            <h2>Delivery summary</h2>
            <p>Only paid-confirmed orders enter delivery planning.</p>
            {delivery.length ? delivery.map((group) => {
              const receivedCount = group.orders.filter(isDelivered).length;
              return <div className="summary-row tall" key={group.district}><span>{group.district}<small>{group.orders.map((order) => order.customer_name).join(", ")}</small><small>{receivedCount} received · {group.orders.length - receivedCount} pending handoff</small></span><strong>{group.orders.length} orders / {group.bagels} bagels</strong></div>;
            }) : <p>No confirmed deliveries yet.</p>}
          </section>
        </div>
      </section>
    </main>
  );
}
