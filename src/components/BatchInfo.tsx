import { CalendarDays, LockKeyhole, PackageCheck, Truck, UsersRound } from "lucide-react";

const rows = [
  { Icon: CalendarDays, label: "Status", value: "Waitlist open" },
  { Icon: CalendarDays, label: "Next order window", value: "Coming soon" },
  { Icon: CalendarDays, label: "Order window closes", value: "Coming soon" },
  { Icon: Truck, label: "Delivery window", value: "Lima, scheduled date" },
  { Icon: UsersRound, label: "Capacity", value: "Limited packs" },
  { Icon: PackageCheck, label: "Minimum order", value: "6-pack" },
];

export function BatchInfo() {
  return (
    <section id="next-batch" className="batch-section section-pad">
      <div className="batch-card main-batch-card">
        <div>
          <h2>Next batch</h2>
          <p>Join the waitlist now and get first access when the next order window opens.</p>
        </div>
        <div className="batch-grid">
          <div className="batch-list">
            {rows.map(({ Icon, label, value }) => (
              <div className="batch-row" key={label}>
                <Icon size={18} />
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="batch-gauge">
            <div className="gauge-ring"><LockKeyhole size={34} /></div>
            <strong>Limited monthly batch</strong>
            <span>First paid reservations get priority.</span>
          </div>
        </div>
      </div>
      <aside className="batch-card waitlist-card">
        <h2>Don&apos;t miss the next drop</h2>
        <p>Join the waitlist and be the first to know when orders open.</p>
        <ul>
          <li>First access to the next batch</li>
          <li>Priority when capacity is limited</li>
          <li>Updates via WhatsApp</li>
        </ul>
        <a className="pill-button purple" href="https://wa.me/51917547745" target="_blank" rel="noreferrer">Join the waitlist</a>
        <small>No spam. Only batch updates.</small>
      </aside>
    </section>
  );
}
