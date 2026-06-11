import { MessageCircle } from "lucide-react";
import { RollingBagel } from "./RollingBagel";

export function FinalCTA() {
  return (
    <section className="final-cta-section">
      <div className="final-cta-card">
        <RollingBagel variant="rainbow" size="lg" className="final-rainbow" />
        <div>
          <h2>Missed this batch?</h2>
          <p>Join the waitlist and be first to know when the next Bagelito window opens.</p>
        </div>
        <a className="pill-button pink" href="https://wa.me/51917547745" target="_blank" rel="noreferrer"><MessageCircle size={18} /> Join next batch</a>
        <RollingBagel variant="sesame" size="md" className="final-sesame" />
      </div>
    </section>
  );
}
