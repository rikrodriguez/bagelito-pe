import { CreditCard, LockKeyhole, ShoppingBag, Truck } from "lucide-react";

const steps = [
  { n: 1, title: "Choose your pack", text: "Pick your favorite flavors from this month's batch.", Icon: ShoppingBag, color: "pink" },
  { n: 2, title: "Pay to reserve", text: "Your order is confirmed only after payment.", Icon: CreditCard, color: "orange" },
  { n: 3, title: "We close production", text: "Once the window closes, we buy ingredients and prep only what was reserved.", Icon: LockKeyhole, color: "mint" },
  { n: 4, title: "We bake and deliver", text: "Your pack is baked fresh and delivered in one scheduled Lima delivery window.", Icon: Truck, color: "purple" },
];

export function HowMonthlyWorks() {
  return (
    <section id="how-it-works" className="how-section section-pad">
      <h2>How the monthly batch works</h2>
      <div className="step-line" aria-hidden="true" />
      <div className="steps-grid">
        {steps.map(({ n, title, text, Icon, color }) => (
          <article className={`step-card ${color}`} key={title}>
            <span className="step-number">{n}</span>
            <div className="step-icon"><Icon size={34} /></div>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
