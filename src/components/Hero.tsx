import { Archive, CalendarDays, LockKeyhole, MessageCircle, Truck } from "lucide-react";
import { RollingBagel } from "./RollingBagel";

const badges = [
  { Icon: CalendarDays, text: "Monthly batch" },
  { Icon: LockKeyhole, text: "Limited production" },
  { Icon: Archive, text: "Pre-order only" },
  { Icon: Truck, text: "One monthly delivery window in Lima" },
];

export function Hero() {
  return (
    <section id="home" className="hero-section">
      <div className="hero-copy">
        <p className="kicker">Baked by batch</p>
        <h1>The monthly <span>bagel drop</span> in Lima</h1>
        <p className="hero-subcopy">We open orders once a month. You reserve your pack, we close the batch, bake fresh, and deliver on one scheduled date in Lima.</p>
        <div className="hero-buttons">
          <a className="pill-button pink" href="https://wa.me/51917547745" target="_blank" rel="noreferrer"><MessageCircle size={18} /> Reserve next batch</a>
          <a className="pill-button outline" href="#flavors">See this month&apos;s batch</a>
        </div>
        <div className="hero-badges">
          {badges.map(({ Icon, text }) => (
            <div className="mini-badge" key={text}>
              <span><Icon size={19} /></span>
              <strong>{text}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="dotted-path path-one" />
        <div className="dotted-path path-two" />
        <RollingBagel variant="sesame" size="lg" className="hero-bagel sesame-float" />
        <RollingBagel variant="jalapeno" size="lg" className="hero-bagel jalapeno-float" />
        <RollingBagel variant="rainbow" size="xl" className="hero-bagel rainbow-float" />
        <RollingBagel variant="everything" size="lg" className="hero-bagel everything-float" />
        <div className="purple-sticker">Always fresh. Never leftovers.</div>
      </div>
    </section>
  );
}
