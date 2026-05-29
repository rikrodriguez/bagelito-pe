import { CalendarDays, Camera, Heart, Lock, MessageCircle, PackageCheck, ShoppingCart, Sparkles, Truck } from "lucide-react";

const flavors = ["Jalapeño Cheddar", "Cheddar", "Sesame", "Everything Bagel", "Cinnamon Raisin", "Blueberry", "Plain", "Classic Onion", "Rainbow / Custom Colors", "Snickerdoodle"];
const variants = ["jalapeno", "cheddar", "sesame", "everything", "cinnamon", "blueberry", "plain", "onion", "rainbow", "snickerdoodle"];
const packs = [
  ["12 mixed", "S/115", "The easiest way to try more flavors and share.", "pink", "Most wanted"],
  ["6 mixed", "S/60", "Perfect if this is your first Bagelito batch.", "orange", ""],
  ["12 single flavor", "S/100", "Best if you already know your favorite.", "mint", ""],
  ["6 single flavor", "S/50", "Simple, clean, and batch-friendly.", "purple", ""]
];
const reviews = [
  "These bagels taste like home. The chew is perfect.",
  "El cinnamon raisin estuvo buenazo. Se siente handmade de verdad.",
  "Loved the monthly drop idea. Fresh, organized, and worth waiting for.",
  "Los de jalapeño cheddar fueron mis favoritos.",
  "The everything bagel was nostalgic in the best way.",
  "La caja llegó linda y los bagels grandes. Ideal para compartir.",
  "Rainbow bagel was the star: colorful and real bagel flavor.",
  "Handmade Bagels. Nostalgia with the perfect chew. Literal."
];

function Bagel({ variant = "plain", size = "md" }: { variant?: string; size?: "sm" | "md" | "lg" | "hero" }) {
  return <span className={`bagel bagel-${variant} bagel-${size}`} aria-label={`${variant} bagel`} />;
}

export default function Home() {
  return (
    <>
      <header className="header">
        <a className="logo" href="#home">Bagelito<span>.pe</span></a>
        <nav><a href="#next-batch">Next Batch</a><a href="#packs">Packs</a><a href="#flavors">Flavors</a><a href="#how-it-works">How it works</a><a href="#about">About</a></nav>
        <a className="button pink" href="https://wa.me/51917547745"><MessageCircle size={20}/>Join the waitlist</a>
      </header>
      <main>
        <section className="hero shell" id="home">
          <div><span className="eyebrow">Baked by batch</span><h1>The monthly <span>bagel drop</span> in Lima</h1><p>We open orders once a month. You reserve your pack, we close the batch, bake fresh, and deliver on one scheduled date in Lima.</p><div className="actions"><a className="button pink" href="https://wa.me/51917547745"><MessageCircle size={20}/>Reserve next batch</a><a className="button outline" href="#flavors">See this month&apos;s batch</a></div><div className="badges"><span><CalendarDays/>Monthly batch</span><span><Lock/>Limited production</span><span><PackageCheck/>Pre-order only</span><span><Truck/>One monthly delivery window in Lima</span></div></div>
          <div className="hero-art"><span className="path"/><Bagel variant="sesame" size="lg"/><Bagel variant="jalapeno" size="lg"/><Bagel variant="rainbow" size="hero"/><Bagel variant="everything" size="lg"/><b>Always fresh. Never leftovers.</b></div>
        </section>
        <section className="batch shell" id="next-batch"><div className="card big"><h2>Next batch</h2><p>Join the waitlist now and get first access when the next order window opens.</p><div className="rows"><span>Status <b>Waitlist open</b></span><span>Next order window <b>Coming soon</b></span><span>Order window closes <b>Coming soon</b></span><span>Delivery window <b>Lima, scheduled date</b></span><span>Capacity <b>Limited packs</b></span><span>Minimum order <b>6-pack</b></span></div></div><aside className="card lavender"><h3>Don&apos;t miss the next drop</h3><p>Join the waitlist and be the first to know when orders open.</p><ul><li>First access to the next batch</li><li>Priority when capacity is limited</li><li>Updates via WhatsApp</li></ul><a className="button purple" href="https://wa.me/51917547745">Join the waitlist</a></aside></section>
        <section className="how shell" id="how-it-works"><h2>How the monthly batch works</h2><div className="steps">{["Choose your pack", "Pay to reserve", "We close production", "We bake and deliver"].map((step, i) => <article key={step}><i>{i + 1}</i><h3>{step}</h3><p>{["Pick your favorite flavors from this month&apos;s batch.", "Your order is confirmed only after payment.", "Once the window closes, we buy and prep exactly what was reserved.", "Freshly baked bagels are delivered in one scheduled Lima delivery window."][i]}</p></article>)}</div></section>
        <section className="packs shell" id="packs"><div className="split"><h2>Packs to reserve</h2><p><span>Minimum order: 6-pack</span><span>Premium and seasonal flavors may vary.</span></p></div><div className="pack-grid">{packs.map(([name, price, text, color, badge]) => <article className={`pack ${color}`} key={name}>{badge ? <em>{badge}</em> : null}<h3>{name}</h3><strong>{price}</strong><div className="box"><Bagel variant={color === "pink" ? "rainbow" : color === "orange" ? "jalapeno" : "plain"} size="sm"/><Bagel variant="sesame" size="sm"/><Bagel variant={color === "purple" ? "plain" : "everything"} size="sm"/></div><p>{text}</p><a className="reserve" href="https://wa.me/51917547745"><MessageCircle size={18}/>Reserve this pack</a></article>)}</div><div className="warning"><span>Your reservation is confirmed only after payment.</span><span>We bake according to confirmed paid orders.</span><span>No extra stock is guaranteed after the batch closes.</span></div></section>
        <section className="why shell"><h2>Why monthly?</h2><p>We bake by reservation because it makes the product better. No random stock, no leftovers, no rushed production. We know exactly how many packs to prepare, buy ingredients smarter, reduce waste, and deliver a fresher batch.</p><div className="reasons"><article><Sparkles/><h3>Fresher product</h3><p>Baked closer to delivery day.</p></article><article><ShoppingCart/><h3>Less waste</h3><p>We only make what&apos;s reserved.</p></article><article><PackageCheck/><h3>Smarter ingredients</h3><p>Better planning, better quality.</p></article><article><Heart/><h3>Better experience</h3><p>More flavor, more fun.</p></article></div></section>
        <section className="flavors shell" id="flavors"><h2>This month&apos;s batch (flavors)</h2><p>These are the flavors we prepare across our monthly batches. Availability may rotate depending on the month.</p><div className="flavor-grid">{flavors.map((name, i) => <article key={name}><Bagel variant={variants[i]} size="md"/><b>{name}</b><span>{i > 7 ? "S/12 each" : "S/10 each"}</span></article>)}</div></section>
        <section className="about shell" id="about"><div><span className="eyebrow">Handmade Bagels</span><h2>Nostalgia with the perfect chew</h2><p>Bagelito.pe is the monthly bagel drop in Lima: small-batch, handmade bagels reserved before we bake. Fresh, chewy, colorful, and made only for confirmed orders.</p></div><div className="handmade">100% handmade</div></section>
        <section className="testimonials shell"><h2>What the batch says</h2><div className="chats">{reviews.map((review, i) => <article className={i % 2 ? "ig" : "wa"} key={review}><b>{i % 2 ? <Camera size={17}/> : <MessageCircle size={17}/>} {i % 2 ? "Instagram" : "WhatsApp"}</b><p>{review}</p><span>Customer note</span></article>)}</div></section>
        <section className="cta shell"><Bagel variant="rainbow" size="lg"/><div><h2>Missed this batch?</h2><p>Join the waitlist and be first to know when the next Bagelito window opens.</p></div><a className="button pink" href="https://wa.me/51917547745">Join next batch</a></section>
      </main>
      <footer className="footer shell"><a className="logo" href="#home">Bagelito<span>.pe</span></a><p>The monthly bagel drop in Lima.</p><a href="https://wa.me/51917547745">+51 917 547 745</a><a href="https://instagram.com/bagelito.pe">@bagelito.pe</a><span>Made in Lima with love</span></footer>
    </>
  );
}
