import Link from "next/link";
import {
  AlertCircle,
  ArrowUpDown,
  Archive,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  Eye,
  FileDown,
  Home,
  ListFilter,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  ReceiptText,
  Search,
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
  getCustomerCrmStats,
  getCustomerProfiles,
  getDashboardStats,
  getDeliveryRoutePlan,
  getDeliverySummary,
  getFinancialSummary,
  getOrderArchiveState,
  getProductionOpsPlan,
  hasUploadedPaymentProof,
  isManualPaymentPending,
  isOrderArchived,
  productionStatuses,
  type Batch,
  type CustomerProfile,
  type DeliveryRouteStop,
  type FinancialSummary,
  type Order,
  type ProductionOpsPlan,
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
import { quickUpdateOrderStatus, updateBatchFinancialCosts, updateBatchSettings } from "./actions";

const paidStatuses = new Set<string>(productionStatuses);
const statusFilterOptions = [
  { value: "all", label: "All statuses" },
  { value: "pending_attention", label: "Pending attention" },
  { value: "payment_pending_review", label: "Payment pending" },
  { value: "needs_correction", label: "Needs correction" },
  { value: "payment_confirmed", label: "Paid confirmed" },
  { value: "in_production", label: "In production" },
  { value: "ready_for_delivery", label: "Ready for delivery" },
  { value: "paid_not_delivered", label: "Paid, not received" },
  { value: "delivered", label: "Received by customer" },
  { value: "no_proof", label: "No uploaded proof" },
  { value: "cancelled", label: "Cancelled" },
] as const;
const sortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "delivery", label: "Delivery route" },
  { value: "status", label: "Status" },
  { value: "amount_desc", label: "Highest amount" },
  { value: "amount_asc", label: "Lowest amount" },
] as const;

type AdminSearchParams = {
  batch?: string;
  deleted?: string;
  archived?: string;
  restored?: string;
  view?: string;
  whatsapp?: string;
  order?: string;
  whatsappError?: string;
  whatsappSent?: string;
  finance?: string;
  q?: string;
  status?: string;
  sort?: string;
};

function formatMoney(value: number) {
  const amount = Math.round(Number(value));
  return `${amount < 0 ? "-" : ""}S/${Math.abs(amount)}`;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function formatCostInput(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
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

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function compareText(a: string | null | undefined, b: string | null | undefined) {
  return normalizeText(a).localeCompare(normalizeText(b), "es");
}

function isPendingAttention(order: Order) {
  return order.status === "payment_pending_review" || order.status === "needs_correction";
}

function matchesSearch(order: Order, query: string) {
  const search = normalizeText(query);
  if (!search) return true;

  const haystack = normalizeText([
    order.customer_name,
    order.order_code,
    order.district,
    order.whatsapp,
    order.email,
    order.delivery_address,
    order.pack_name,
    order.payment_transaction_number,
    getFlavorText(order),
  ].join(" "));

  return haystack.includes(search);
}

function matchesStatusFilter(order: Order, statusFilter: string) {
  switch (statusFilter) {
    case "all":
      return true;
    case "pending_attention":
      return isPendingAttention(order);
    case "paid_not_delivered":
      return isPaid(order) && !isDelivered(order);
    case "no_proof":
      return !hasUploadedPaymentProof(order);
    default:
      return order.status === statusFilter;
  }
}

function sortOrders(orders: Order[], sort: string) {
  return [...orders].sort((a, b) => {
    switch (sort) {
      case "oldest":
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case "delivery":
        return compareText(a.district, b.district)
          || compareText(a.delivery_address, b.delivery_address)
          || compareText(a.customer_name, b.customer_name);
      case "status":
        return compareText(a.status, b.status) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case "amount_desc":
        return Number(b.total_amount) - Number(a.total_amount) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case "amount_asc":
        return Number(a.total_amount) - Number(b.total_amount) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });
}

function filterAndSortOrders(orders: Order[], query: string, statusFilter: string, sort: string) {
  return sortOrders(
    orders.filter((order) => matchesSearch(order, query) && matchesStatusFilter(order, statusFilter)),
    sort,
  );
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
  const notes = (order.delivery_notes ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  if (notes.includes("porteria")) return "Leave at front desk";
  if (notes.includes("recibo") || notes.includes("recepciono")) return "Customer receives directly";
  return "Not specified";
}

function StatusAction({ order, returnTo, status, label, tone }: { order: Order; returnTo?: string; status: string; label: string; tone: "paid" | "pending" | "warning" | "received" }) {
  return (
    <form action={quickUpdateOrderStatus}>
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="orderCode" value={order.order_code} />
      <input type="hidden" name="status" value={status} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <button className={`status-action ${tone}`} disabled={order.status === status} type="submit">
        {label}
      </button>
    </form>
  );
}

function productionStageActionTone(stageKey: ProductionOpsPlan["stages"][number]["key"]) {
  if (stageKey === "bake") return "warning";
  if (stageKey === "pack") return "paid";
  return "received";
}

function getCustomerFlavorSummary(profile: CustomerProfile) {
  if (!profile.favoriteFlavors.length) return "No flavors captured";
  return profile.favoriteFlavors.slice(0, 3).map((item) => `${item.flavorName} (${item.quantity})`).join(" · ");
}

function CustomerCrmPanel({ profiles, stats }: { profiles: CustomerProfile[]; stats: ReturnType<typeof getCustomerCrmStats> }) {
  const topProfiles = profiles.slice(0, 8);

  return (
    <section className="admin-card customer-crm-panel" id="customer-crm">
      <div className="admin-card-head">
        <div>
          <p className="kicker">Customer CRM</p>
          <h2>Customer history and repeat buyers</h2>
          <p>Customer history, repeat purchases, last purchase, total spend, and flavor preferences.</p>
        </div>
        <span className="status-pill neutral">{stats.totalCustomers} customers</span>
      </div>

      <div className="customer-crm-kpis">
        <div><span>Unique customers</span><strong>{stats.totalCustomers}</strong><small>Grouped by WhatsApp/email</small></div>
        <div><span>Repeat customers</span><strong>{stats.repeatCustomers}</strong><small>{stats.repeatRate}% repeat rate</small></div>
        <div><span>Total spent</span><strong>{formatMoney(stats.totalSpent)}</strong><small>{stats.totalPaidOrders} paid orders</small></div>
        <div><span>Avg customer value</span><strong>{formatMoney(stats.averageCustomerValue)}</strong><small>{stats.lastPurchaseAt ? `Last purchase ${formatDate(stats.lastPurchaseAt)}` : "No paid purchases yet"}</small></div>
      </div>

      {stats.topCustomer ? (
        <div className="customer-crm-highlight">
          <span>Top customer</span>
          <strong>{stats.topCustomer.customerName}</strong>
          <small>{stats.topCustomer.totalOrders} orders · {formatMoney(stats.topCustomer.totalSpent)} spent · {getCustomerFlavorSummary(stats.topCustomer)}</small>
        </div>
      ) : null}

      {topProfiles.length ? (
        <div className="customer-profile-list">
          {topProfiles.map((profile) => {
            const latestOrder = profile.orders[0];
            const repeat = profile.repeatOrders > 0;

            return (
              <article className="customer-profile-card" key={profile.key}>
                <div className="customer-profile-head">
                  <div className="customer-avatar">{initials(profile.customerName)}</div>
                  <div>
                    <h3>{profile.customerName}</h3>
                    <p>{profile.whatsapp} · {profile.email}</p>
                    <p>{profile.district} · first order {formatDate(profile.firstOrderAt)}</p>
                  </div>
                  <span className={`status-pill ${repeat ? "paid" : "neutral"}`}>{repeat ? "Repeat" : "New"}</span>
                </div>

                <div className="customer-profile-metrics">
                  <div><span>Orders</span><strong>{profile.totalOrders}</strong></div>
                  <div><span>Paid</span><strong>{profile.paidOrders}</strong></div>
                  <div><span>Spent</span><strong>{formatMoney(profile.totalSpent)}</strong></div>
                  <div><span>Last</span><strong>{formatDate(profile.lastPurchaseAt ?? profile.lastOrderAt)}</strong></div>
                </div>

                <div className="customer-flavor-tags">
                  {profile.favoriteFlavors.length ? profile.favoriteFlavors.slice(0, 4).map((flavor) => (
                    <span key={flavor.flavorName}>{flavor.flavorName} · {flavor.quantity}</span>
                  )) : <span>No flavors captured</span>}
                </div>

                <div className="customer-order-history-mini">
                  {profile.orders.slice(0, 3).map((order) => (
                    <Link href={`/admin/orders/${order.order_code}`} key={order.id}>
                      <span>{order.order_code}</span>
                      <strong>{order.pack_name}</strong>
                      <small>{formatDate(order.created_at)} · {formatMoney(Number(order.total_amount))} · {humanStatus(order.status)}</small>
                    </Link>
                  ))}
                </div>

                {latestOrder ? <Link className="mini-link" href={`/admin/orders/${latestOrder.order_code}`}><Eye size={15} /> Latest order</Link> : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">No customer history yet. It will appear after reservations are submitted.</div>
      )}
    </section>
  );
}

function FinancialPanel({ summary }: { summary: FinancialSummary }) {
  const marginTone = summary.estimatedNetProfit >= 0 ? "positive" : "negative";

  return (
    <section className="admin-card finance-panel" id="finance">
      <div className="admin-card-head">
        <div>
          <p className="kicker">Finance</p>
          <h2>Financial snapshot</h2>
          <p>Sales, editable real costs, margin by pack, and net profit for the current batch.</p>
        </div>
        <span className="status-pill neutral">{summary.batchName}</span>
      </div>

      <div className="finance-kpi-grid">
        <div><span>Confirmed sales</span><strong>{formatMoney(summary.confirmedSales)}</strong><small>{summary.confirmedPacks} paid packs</small></div>
        <div><span>Pending</span><strong>{formatMoney(summary.pendingSales)}</strong><small>{summary.pendingPacks} packs pending review</small></div>
        <div className={summary.deliverySurplus >= 0 ? "positive" : "negative"}><span>Delivery variance</span><strong>{formatMoney(summary.deliverySurplus)}</strong><small>{formatMoney(summary.deliveryCollected)} collected / {formatMoney(summary.actualDeliveryCost)} real cost</small></div>
        <div className={marginTone}><span>Net profit</span><strong>{formatMoney(summary.estimatedNetProfit)}</strong><small>{summary.estimatedNetProfitRate}% of total collected</small></div>
      </div>

      <div className="finance-detail-grid">
        <section className="finance-card finance-cost-card">
          <div className="admin-card-head compact">
            <h3>Editable real costs</h3>
            <p>Update after buying ingredients, packaging or paying delivery.</p>
          </div>
          <form action={updateBatchFinancialCosts} className="finance-cost-form">
            <input type="hidden" name="batchId" value={summary.batchId} />
            <label>
              <span>Ingredient / bagel</span>
              <input disabled={!summary.costSchemaReady} min="0" name="ingredientCostPerBagel" step="0.01" type="number" defaultValue={formatCostInput(summary.costs.ingredientCostPerBagel)} />
            </label>
            <label>
              <span>Packaging / pack</span>
              <input disabled={!summary.costSchemaReady} min="0" name="packagingCostPerPack" step="0.01" type="number" defaultValue={formatCostInput(summary.costs.packagingCostPerPack)} />
            </label>
            <label>
              <span>Real delivery cost</span>
              <input disabled={!summary.costSchemaReady} min="0" name="actualDeliveryCost" step="0.01" type="number" defaultValue={formatCostInput(summary.costs.actualDeliveryCost)} />
            </label>
            <label>
              <span>Other batch costs</span>
              <input disabled={!summary.costSchemaReady} min="0" name="otherBatchCost" step="0.01" type="number" defaultValue={formatCostInput(summary.costs.otherBatchCost)} />
            </label>
            <button className="status-action paid" disabled={!summary.costSchemaReady} type="submit">Save costs</button>
          </form>
          {!summary.costSchemaReady ? (
            <p className="finance-assumption">Run `supabase/add-batch-financial-costs.sql` once in Supabase to enable editable costs.</p>
          ) : null}
        </section>

        <section className="finance-card">
          <div className="admin-card-head compact">
            <h3>Revenue bridge</h3>
            <p>Delivery is separated from product revenue.</p>
          </div>
          <div className="finance-row-list">
            <div><span>Confirmed total collected</span><strong>{formatMoney(summary.confirmedSales)}</strong></div>
            <div><span>Product revenue</span><strong>{formatMoney(summary.confirmedProductSales)}</strong></div>
            <div><span>Delivery collected</span><strong>{formatMoney(summary.deliveryCollected)}</strong></div>
            <div><span>Pending pipeline</span><strong>{formatMoney(summary.pendingSales)}</strong></div>
          </div>
        </section>

        <section className="finance-card">
          <div className="admin-card-head compact">
            <h3>Packs by batch</h3>
            <p>Current batch only.</p>
          </div>
          <div className="finance-row-list">
            <div><span>Reserved packs</span><strong>{summary.reservedPacks}</strong></div>
            <div><span>Confirmed packs</span><strong>{summary.confirmedPacks}</strong></div>
            <div><span>Pending packs</span><strong>{summary.pendingPacks}</strong></div>
            <div><span>Confirmed bagels</span><strong>{summary.confirmedBagels}</strong></div>
          </div>
        </section>

        <section className="finance-card finance-pack-card">
          <div className="admin-card-head compact">
            <h3>Margin by pack</h3>
            <p>Confirmed product revenue minus ingredient and packaging cost.</p>
          </div>
          <div className="finance-pack-list">
            {summary.packMetrics.length ? summary.packMetrics.map((item) => (
              <div className="finance-pack-row" key={item.packSlug}>
                <div>
                  <strong>{item.packName}</strong>
                  <small>{item.confirmedPacks} confirmed / {item.reservedPacks} reserved · {item.bagels} bagels</small>
                  <small>Revenue {formatMoney(item.productRevenue)} · Cost {formatMoney(item.ingredientCost + item.packagingCost)} · {item.grossMarginRate}% margin</small>
                </div>
                <b>{formatMoney(item.grossMargin)} <small>{formatMoney(item.marginPerPack)} / pack</small></b>
              </div>
            )) : <div className="production-stage-empty">No packs in this batch yet.</div>}
          </div>
        </section>

        <section className="finance-card">
          <div className="admin-card-head compact">
            <h3>Net profit bridge</h3>
            <p>Batch-level estimate with real editable costs.</p>
          </div>
          <div className="finance-row-list">
            <div><span>Ingredient cost</span><strong>{formatMoney(summary.estimatedProductCost)}</strong></div>
            <div><span>Packaging</span><strong>{formatMoney(summary.estimatedPackagingCost)}</strong></div>
            <div><span>Real delivery cost</span><strong>{formatMoney(summary.actualDeliveryCost)}</strong></div>
            <div><span>Other costs</span><strong>{formatMoney(summary.otherBatchCost)}</strong></div>
            <div><span>Total costs</span><strong>{formatMoney(summary.estimatedTotalCost)}</strong></div>
            <div><span>Product gross margin</span><strong>{formatMoney(summary.estimatedGrossMargin)}</strong></div>
            <div><span>Net profit</span><strong>{formatMoney(summary.estimatedNetProfit)}</strong></div>
          </div>
          <p className="finance-assumption">Formula: total collected minus ingredients, packaging, real delivery and other batch costs. Product gross margin excludes delivery.</p>
        </section>
      </div>
    </section>
  );
}

function CustomerCommsQueue({ followUps }: { followUps: { order: Order; intent: AdminWhatsAppIntent }[] }) {
  return (
    <section className="admin-card whatsapp-queue-card">
      <div className="admin-card-head">
        <div>
          <p className="kicker">Customer comms</p>
          <h2>WhatsApp message queue</h2>
          <p>Post-purchase, payment confirmation, delivery reminders, and feedback/testimonial requests.</p>
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
        <div className="empty-state">No pending messages. The customer comms queue is clear.</div>
      )}
    </section>
  );
}

function ProductionOpsPanel({ plan, returnTo }: { plan: ProductionOpsPlan; returnTo: string }) {
  const doneStage = plan.stages.find((stage) => stage.key === "done");
  const activeStages = plan.stages.filter((stage) => stage.key !== "done");
  const donePercent = percent(doneStage?.packs ?? 0, plan.totalPacks);
  const deliveryDate = plan.deliveryDate ? formatBatchDate(plan.deliveryDate) : "Not set";

  return (
    <section className="admin-card production-ops-card" id="production-ops">
      <div className="admin-card-head">
        <div>
          <p className="kicker">Production ops</p>
          <h2>{plan.batchName}</h2>
          <p>Packing list by flavor, total batch count, and the operating checklist for baking, packing, and delivery.</p>
        </div>
        <a className="status-action export" href="/admin/export/production"><FileDown size={16} /> Production CSV</a>
      </div>

      <div className="production-ops-stats">
        <div><span>Batch packs</span><strong>{plan.totalPacks}</strong><small>{formatMoney(plan.totalRevenue)} confirmed</small></div>
        <div><span>Bagels</span><strong>{plan.totalBagels}</strong><small>Paid batch count</small></div>
        <div><span>Flavors</span><strong>{plan.packingList.length}</strong><small>Items to prep</small></div>
        <div><span>Delivery window</span><strong>{deliveryDate}</strong><small>{donePercent}% received</small></div>
      </div>

      {!plan.totalPacks ? (
        <div className="empty-state">No paid orders in the current batch yet. Confirm payments first, then this checklist will populate.</div>
      ) : null}

      <div className="production-ops-grid">
        <section>
          <div className="admin-card-head compact">
            <h3>Packing list by flavor</h3>
            <p>Use this to bake and count each flavor before packing.</p>
          </div>
          <div className="production-flavor-list">
            {plan.packingList.length ? plan.packingList.map((item) => (
              <div className="production-flavor-row" key={item.flavorName}>
                <div>
                  <strong>{item.flavorName}</strong>
                  <small>{[...new Set(item.orderCodes)].join(", ")}</small>
                </div>
                <b>{item.quantity}</b>
              </div>
            )) : <div className="production-stage-empty">No flavors to prep yet.</div>}
          </div>
        </section>

        <section>
          <div className="admin-card-head compact">
            <h3>Pack totals</h3>
            <p>Quick count for boxes and labels.</p>
          </div>
          <div className="production-pack-list">
            {plan.packList.length ? plan.packList.map((item) => (
              <div className="production-pack-row" key={item.packSlug}>
                <div>
                  <strong>{item.packName}</strong>
                  <small>{item.orderCodes.join(", ")}</small>
                </div>
                <b>{item.packs} packs / {item.bagels} bagels</b>
              </div>
            )) : <div className="production-stage-empty">No packs to label yet.</div>}
          </div>
        </section>
      </div>

      <div className="production-stage-grid">
        {plan.stages.map((stage) => (
          <section className={`production-stage ${stage.key}`} key={stage.key}>
            <div className="production-stage-head">
              <span>{stage.label}</span>
              <strong>{stage.packs} packs</strong>
              <small>{stage.bagels} bagels · {stage.description}</small>
            </div>

            <div className="production-task-list">
              {stage.orders.length ? stage.orders.map((order) => (
                <div className="production-task-row" key={order.id}>
                  <span className={`production-check ${stage.key === "done" ? "done" : ""}`}>{stage.key === "done" ? "✓" : ""}</span>
                  <div className="production-task-main">
                    <strong>{order.order_code} · {order.customer_name}</strong>
                    <small>{order.pack_name} · {order.pack_units} bagels</small>
                    <small>{getFlavorText(order)}</small>
                  </div>
                  <div className="production-task-actions">
                    {stage.nextStatus && stage.actionLabel ? (
                      <StatusAction order={order} returnTo={returnTo} status={stage.nextStatus} label={stage.actionLabel} tone={productionStageActionTone(stage.key)} />
                    ) : (
                      <span className="status-pill received">Done</span>
                    )}
                    <Link className="mini-link" href={`/admin/orders/${order.order_code}`}><Eye size={15} /> Detail</Link>
                  </div>
                </div>
              )) : (
                <div className="production-stage-empty">No orders in this step.</div>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="production-op-note">
        <strong>Suggested flow:</strong>
        {activeStages.map((stage) => <span key={stage.key}>{stage.label}: {stage.packs}</span>)}
        <span>Received: {doneStage?.packs ?? 0}</span>
      </div>
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
          <p>Open or close orders, set capacity, and keep the batch operating dates clear.</p>
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

function DeliveryOpsPanel({ routePlan, returnTo }: { routePlan: DeliveryRouteStop[]; returnTo: string }) {
  const totalOrders = routePlan.reduce((sum, stop) => sum + stop.orders.length, 0);
  const totalPending = routePlan.reduce((sum, stop) => sum + stop.pendingHandoff, 0);
  const totalBagels = routePlan.reduce((sum, stop) => sum + stop.bagels, 0);
  const farthestStop = routePlan.at(-1);

  return (
    <section className="admin-card delivery-ops-card" id="delivery-ops">
      <div className="admin-card-head">
        <div>
          <p className="kicker">Delivery ops</p>
          <h2>Driver route by district</h2>
          <p>Suggested route from Jr. Sinchi Roca 2560, Lince: nearby districts first, then farther stops.</p>
        </div>
        <a className="status-action export" href="/admin/export/driver"><FileDown size={16} /> Driver CSV</a>
      </div>

      <div className="delivery-ops-stats">
        <div><span>Stops</span><strong>{routePlan.length}</strong><small>District groups</small></div>
        <div><span>Orders</span><strong>{totalOrders}</strong><small>{totalPending} pending handoff</small></div>
        <div><span>Bagels</span><strong>{totalBagels}</strong><small>Paid route inventory</small></div>
        <div><span>Farthest</span><strong>{farthestStop ? `${farthestStop.distanceKm.toFixed(1)} km` : "0 km"}</strong><small>{farthestStop?.district ?? "No route yet"}</small></div>
      </div>

      {routePlan.length ? (
        <div className="delivery-route-list">
          {routePlan.map((stop) => (
            <article className="delivery-stop-card" key={stop.district}>
              <div className="delivery-stop-head">
                <span>Stop {String(stop.stopNumber).padStart(2, "0")}</span>
                <div>
                  <h3>{stop.district}</h3>
                  <p>{stop.distanceKm.toFixed(1)} km from Lince · approx. S/{stop.deliveryFee} delivery fee</p>
                </div>
                <strong>{stop.pendingHandoff} pending / {stop.orders.length} orders</strong>
              </div>

              <div className="delivery-checklist">
                {stop.orders.map((order) => {
                  const delivered = isDelivered(order);

                  return (
                    <div className={`delivery-check-item ${delivered ? "received" : ""}`} key={order.id}>
                      <span className="driver-check" aria-label={delivered ? "Received" : "Pending"}>{delivered ? "✓" : ""}</span>
                      <div className="delivery-check-main">
                        <div>
                          <strong>{order.customer_name}</strong>
                          <small>{order.order_code} · {order.pack_name} · {order.pack_units} bagels · {formatMoney(Number(order.total_amount))}</small>
                        </div>
                        <p><Home size={14} /> {order.delivery_address}</p>
                        <p>{order.address_reference ? `Ref: ${order.address_reference}` : "No reference"} · {getReceptionText(order)}</p>
                        {order.delivery_notes ? <p>Notes: {order.delivery_notes}</p> : null}
                        <p><Phone size={14} /> {order.whatsapp} · {getFlavorText(order)}</p>
                      </div>
                      <div className="delivery-check-actions">
                        {delivered ? <span className="status-pill received">Received</span> : <StatusAction order={order} returnTo={returnTo} status="delivered" label="Mark received" tone="received" />}
                        <Link className="mini-link" href={`/admin/orders/${order.order_code}`}><Eye size={15} /> Detail</Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">No paid orders are ready for route planning yet.</div>
      )}
    </section>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<AdminSearchParams>;
}) {
  await requireAdmin();
  const missing = getMissingAdminEnv();
  const params = await searchParams;
  const batchMessage = params?.batch;
  const financeMessage = params?.finance;
  const deletedOrderCode = params?.deleted;
  const archivedOrderCode = params?.archived;
  const restoredOrderCode = params?.restored;
  const whatsappError = params?.whatsappError;
  const whatsappSentOrderCode = params?.whatsappSent;
  const showingArchived = params?.view === "archived";
  const whatsappIntent = parseAdminWhatsAppIntent(params?.whatsapp);
  const whatsappOrderCode = params?.order;
  const searchQuery = (params?.q ?? "").trim();
  const statusFilter = statusFilterOptions.some((option) => option.value === params?.status) ? params?.status ?? "all" : "all";
  const sort = sortOptions.some((option) => option.value === params?.sort) ? params?.sort ?? "newest" : "newest";

  if (missing.length) {
    return <main className="admin-page"><section className="admin-shell admin-card"><h1>Setup needed</h1><p>Missing environment variables: {missing.join(", ")}</p></section></main>;
  }

  const allOrders = await fetchOrders();
  const currentBatch = await fetchCurrentBatch();
  const customerProfiles = getCustomerProfiles(allOrders);
  const customerCrmStats = getCustomerCrmStats(customerProfiles);
  const activeOrders = filterActiveOrders(allOrders);
  const archivedOrders = filterArchivedOrders(allOrders);
  const baseOrders = showingArchived ? archivedOrders : activeOrders;
  const orders = filterAndSortOrders(baseOrders, searchQuery, statusFilter, sort);
  const stats = getDashboardStats(activeOrders);
  const delivery = getDeliverySummary(activeOrders);
  const finance = getFinancialSummary(currentBatch, activeOrders);
  const productionOps = getProductionOpsPlan(currentBatch, activeOrders);
  const routePlan = getDeliveryRoutePlan(activeOrders);
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
  const buildAdminHref = (overrides: Partial<{ view: string; q: string; status: string; sort: string }> = {}) => {
    const nextView = overrides.view ?? (showingArchived ? "archived" : "");
    const nextQ = overrides.q ?? searchQuery;
    const nextStatus = overrides.status ?? statusFilter;
    const nextSort = overrides.sort ?? sort;
    const query = new URLSearchParams();

    if (nextView === "archived") query.set("view", "archived");
    if (nextQ) query.set("q", nextQ);
    if (nextStatus && nextStatus !== "all") query.set("status", nextStatus);
    if (nextSort && nextSort !== "newest") query.set("sort", nextSort);

    const value = query.toString();
    return value ? `/admin?${value}` : "/admin";
  };
  const currentListHref = buildAdminHref();
  const appendCurrentListQuery = (key: string, value: string) =>
    `${currentListHref}${currentListHref.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
  const activeFilterCount = Number(Boolean(searchQuery)) + Number(statusFilter !== "all") + Number(sort !== "newest");
  const pendingAttentionCount = activeOrders.filter(isPendingAttention).length;
  const noProofCount = activeOrders.filter((order) => !hasUploadedPaymentProof(order)).length;
  const selectedStatusLabel = statusFilterOptions.find((option) => option.value === statusFilter)?.label ?? "All statuses";
  const selectedSortLabel = sortOptions.find((option) => option.value === sort)?.label ?? "Newest first";

  return (
    <main className="admin-page">
      <section className="admin-shell crm-shell">
        <div className="admin-topbar">
          <div>
            <p className="kicker">Mini CRM</p>
            <h1>Customer reservations</h1>
            <p className="admin-intro">Customer data, reservation forms, packs, districts, and Bagelito payment review live here.</p>
          </div>
          <div className="admin-export-row">
            <a href="/admin/export/orders"><FileDown size={16} /> Full backup CSV</a>
            <a href="/admin/export/production"><FileDown size={16} /> Production CSV</a>
            <a href="/admin/export/delivery"><FileDown size={16} /> Delivery CSV</a>
            <a href="/admin/export/driver"><FileDown size={16} /> Driver CSV</a>
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

        {financeMessage === "updated" ? (
          <div className="admin-flash success">Finance costs updated.</div>
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
          <Stat icon={MessageCircle} label="Customer comms" value={whatsappFollowUps.length} helper="Messages pending" />
        </div>

        <CustomerCrmPanel profiles={customerProfiles} stats={customerCrmStats} />

        <FinancialPanel summary={finance} />

        <BatchManagementPanel batch={currentBatch} stats={batchStats} />

        <CustomerCommsQueue followUps={whatsappFollowUps} />

        <ProductionOpsPanel plan={productionOps} returnTo={currentListHref} />

        <DeliveryOpsPanel routePlan={routePlan} returnTo={currentListHref} />

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
              <span><Send size={16} /> {whatsappFollowUps.length} customer messages pending</span>
              <span><Mail size={16} /> {marketingOptIns} customers opted into updates</span>
            </div>
          </section>
        </div>

        <section className="admin-card customer-section">
          <div className="admin-card-head">
            <div>
              <h2>{showingArchived ? "Archived customers" : "Visual customer list"}</h2>
              <p>{showingArchived ? "Orders hidden from daily operations. Restore them if they were archived by mistake." : "Full form data, delivery, payment, and quick actions."}</p>
            </div>
            <span className="status-pill neutral">{orders.length} of {baseOrders.length} {showingArchived ? "archived" : "active"} reservations</span>
          </div>

          <div className="admin-view-tabs">
            <Link className={!showingArchived && statusFilter === "all" ? "active" : ""} href={buildAdminHref({ view: "", status: "all" })}>Active customers <b>{activeOrders.length}</b></Link>
            <Link className={!showingArchived && statusFilter === "pending_attention" ? "active" : ""} href={buildAdminHref({ view: "", status: "pending_attention" })}><Clock3 size={15} /> Pending only <b>{pendingAttentionCount}</b></Link>
            <Link className={!showingArchived && statusFilter === "paid_not_delivered" ? "active" : ""} href={buildAdminHref({ view: "", status: "paid_not_delivered" })}>Paid not received <b>{paidNotDeliveredOrders.length}</b></Link>
            <Link className={!showingArchived && statusFilter === "no_proof" ? "active" : ""} href={buildAdminHref({ view: "", status: "no_proof" })}>No proof <b>{noProofCount}</b></Link>
            <Link className={showingArchived ? "active" : ""} href={buildAdminHref({ view: "archived", status: "all" })}><Archive size={15} /> Archive <b>{archivedOrders.length}</b></Link>
          </div>

          <form className="admin-filter-bar" action="/admin">
            {showingArchived ? <input type="hidden" name="view" value="archived" /> : null}
            <label className="admin-search-field">
              <span><Search size={15} /> Search</span>
              <input name="q" defaultValue={searchQuery} placeholder="Name, code, district, WhatsApp..." />
            </label>
            <label>
              <span><ListFilter size={15} /> Status</span>
              <select name="status" defaultValue={statusFilter}>
                {statusFilterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span><ArrowUpDown size={15} /> Sort</span>
              <select name="sort" defaultValue={sort}>
                {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <div className="admin-filter-actions">
              <button className="status-action paid" type="submit">Apply</button>
              <Link className="mini-link" href={showingArchived ? "/admin?view=archived" : "/admin"}>Clear</Link>
            </div>
          </form>

          <div className="admin-filter-summary">
            <span>{orders.length} shown</span>
            <span>{selectedStatusLabel}</span>
            <span>{selectedSortLabel}</span>
            {searchQuery ? <span>Search: &quot;{searchQuery}&quot;</span> : null}
            {activeFilterCount ? <strong>{activeFilterCount} active filters</strong> : <strong>No filters</strong>}
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
                      returnTo={`${currentListHref}${currentListHref.includes("?") ? "&" : "?"}restored=${encodeURIComponent(order.order_code)}`}
                    />
                  ) : (
                    <>
                      <StatusAction order={order} returnTo={currentListHref} status="payment_confirmed" label="Confirm paid" tone="paid" />
                      <StatusAction order={order} returnTo={currentListHref} status="payment_pending_review" label="Not confirmed" tone="pending" />
                      <StatusAction order={order} returnTo={currentListHref} status="needs_correction" label="Needs correction" tone="warning" />
                      {isPaid(order) ? <StatusAction order={order} returnTo={currentListHref} status="delivered" label={isDelivered(order) ? "Received" : "Mark received"} tone="received" /> : null}
                      {(order.status === "payment_pending_review" || order.status === "needs_correction") && !hasAdminWhatsAppMessageSent(order, "order_received") ? <AdminWhatsAppLink order={order} intent="order_received" label="Msg order" returnTo={appendCurrentListQuery("whatsappSent", order.order_code)} /> : null}
                      {isPaid(order) && !hasAdminWhatsAppMessageSent(order, "payment_confirmed") ? <AdminWhatsAppLink order={order} intent="payment_confirmed" label="Msg paid" returnTo={appendCurrentListQuery("whatsappSent", order.order_code)} /> : null}
                      {order.status === "ready_for_delivery" && !hasAdminWhatsAppMessageSent(order, "delivery_reminder") ? <AdminWhatsAppLink order={order} intent="delivery_reminder" label="Msg delivery" returnTo={appendCurrentListQuery("whatsappSent", order.order_code)} /> : null}
                      {isDelivered(order) && !hasAdminWhatsAppMessageSent(order, "delivered") ? <AdminWhatsAppLink order={order} intent="delivered" label="Msg received" returnTo={appendCurrentListQuery("whatsappSent", order.order_code)} /> : null}
                      {isDelivered(order) && hasAdminWhatsAppMessageSent(order, "delivered") && !hasAdminWhatsAppMessageSent(order, "feedback_request") ? <AdminWhatsAppLink order={order} intent="feedback_request" label="Msg feedback" returnTo={appendCurrentListQuery("whatsappSent", order.order_code)} /> : null}
                      <ArchiveOrderForm
                        orderId={order.id}
                        orderCode={order.order_code}
                        customerName={order.customer_name}
                        returnTo={`${currentListHref}${currentListHref.includes("?") ? "&" : "?"}archived=${encodeURIComponent(order.order_code)}`}
                      />
                    </>
                  )}
                  <Link className="mini-link" href={`/admin/orders/${order.order_code}`}><Eye size={15} /> Detail</Link>
                </div>
              </article>
              );
            }) : <div className="empty-state">{baseOrders.length ? "No reservations match these filters. Clear or loosen the search to see more customers." : showingArchived ? "No archived reservations yet." : "No reservations yet. Customer data will appear here after the reservation form is submitted."}</div>}
          </div>
        </section>

        <div className="admin-panels">
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
