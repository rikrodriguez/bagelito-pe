const reviews = [
  { source: "WhatsApp", name: "Maria", lang: "EN", text: "These bagels taste like home. Soft, chewy, and gone in one morning." },
  { source: "Instagram", name: "Claudia", lang: "ES", text: "El rainbow bagel fue un hit en mi casa. Se ve lindo y sabe buenazo." },
  { source: "WhatsApp", name: "Andrea", lang: "EN", text: "The cheddar one has the perfect chew. Please save me a pack next batch." },
  { source: "Instagram", name: "Valeria", lang: "ES", text: "Me encanto que no son pesados. Se sienten hechos a mano de verdad." },
  { source: "WhatsApp", name: "Diego", lang: "EN", text: "Everything bagel was exactly what I missed from Canada. Great texture." },
  { source: "Instagram", name: "Lucia", lang: "ES", text: "La caja llego linda, frescos y con ese toque de nostalgia." },
  { source: "WhatsApp", name: "Sofia", lang: "EN", text: "Handmade Bagels, nostalgia with the perfect chew. That is exactly it." },
  { source: "Instagram", name: "Mateo", lang: "ES", text: "El jalapeno cheddar estuvo brutal. Quiero el de 12 para la proxima." },
  { source: "WhatsApp", name: "Camila", lang: "EN", text: "Loved the monthly drop idea. It feels special and the bagels arrived fresh." },
  { source: "Instagram", name: "Paula", lang: "ES", text: "Los pedi para brunch y todos preguntaron de donde eran." },
];

export function Testimonials() {
  return (
    <section className="testimonials-section section-pad">
      <h2>Batch love from Lima</h2>
      <p className="section-intro">Real-style notes from people who get the Bagelito mood: handmade bagels, nostalgia, and the perfect chew.</p>
      <div className="review-grid">
        {reviews.map((review, index) => (
          <article className={`review-card ${review.source.toLowerCase()}`} key={`${review.name}-${index}`}>
            <div className="review-top"><strong>{review.source}</strong><span>{review.lang}</span></div>
            <p>{review.text}</p>
            <small>{review.name}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
