import { Leaf, ShoppingCart, Smile, Trash2 } from "lucide-react";

const reasons = [
  { title: "Fresher product", text: "Baked closer to delivery day for the best taste and texture.", Icon: Leaf, color: "mint" },
  { title: "Less waste", text: "We only make what's reserved. Better for the planet.", Icon: Trash2, color: "pink" },
  { title: "Smarter ingredients", text: "We buy better, plan better and support quality.", Icon: ShoppingCart, color: "orange" },
  { title: "Better monthly experience", text: "More flavors, more fun, more Bagelito.", Icon: Smile, color: "purple" },
];

export function WhyMonthly() {
  return (
    <section id="about" className="why-section section-pad">
      <h2>Why monthly?</h2>
      <p className="section-intro">We bake by reservation because it makes the product better. No random stock, no leftovers, no rushed production. We know exactly how many packs to prepare, buy ingredients smarter, reduce waste, and deliver a fresher batch.</p>
      <div className="reason-grid">
        {reasons.map(({ title, text, Icon, color }) => (
          <article className={`reason-card ${color}`} key={title}>
            <Icon size={42} />
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
