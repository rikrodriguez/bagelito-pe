"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Check, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { flavors } from "@/data/flavors";
import { flavorImages } from "@/data/flavor-images";
import { packs, type PackSlug } from "@/data/packs";
import { flavorCopy, packCopy } from "@/lib/i18n";
import { useBatchAvailability } from "@/components/BatchAvailabilityProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { SHOP_DRAFT_KEY, SHOP_DRAFT_UPDATED_EVENT } from "@/lib/shop-draft";

// Shared with the existing checkout. Only a pack and flavor counts are stored;
// no customer identity, reservation, or payment details ever enter localStorage.
type BoxDraft = { version: 1; packSlug: PackSlug; quantities: Record<string, number>; singleFlavor: string };
const descriptions = {
  es: {
    "jalapeno-cheddar": "Sabor intenso a cheddar con un toque suave de jalapeño.",
    cheddar: "Sabroso, dorado y terminado con cheddar derretido.",
    sesame: "El clásico bagel de mordida elástica con costra de ajonjolí.",
    "everything-bagel": "Ajonjolí, cebolla, ajo y el acabado salado del everything.",
    "cinnamon-raisin": "Canela cálida, pasas y un acabado ligeramente dulce.",
    blueberry: "Sabor frutal a blueberry en una miga suave y elástica.",
    plain: "El clásico limpio: dorado por fuera y elástico por dentro.",
    "classic-onion": "Cebolla sabrosa con una costra tostada y aromática.",
    "rainbow-custom-colors": "Bagel premium de colores para celebraciones.",
    snickerdoodle: "Bagel de temporada inspirado en canela y azúcar."
  },
  en: {
    "jalapeno-cheddar": "Cheddar-forward with a gentle jalapeño kick.",
    cheddar: "Savory, golden, and finished with melted cheddar.",
    sesame: "A classic chewy bagel with a toasted sesame crust.",
    "everything-bagel": "Sesame, onion, garlic, and a savory everything finish.",
    "cinnamon-raisin": "Warm cinnamon with raisins and a lightly sweet finish.",
    blueberry: "Fruity blueberry flavor in a soft, chewy crumb.",
    plain: "The clean classic: golden outside and chewy inside.",
    "classic-onion": "Savory onion flavor with a toasted aromatic crust.",
    "rainbow-custom-colors": "A premium colorful bagel made for celebrations.",
    snickerdoodle: "A seasonal cinnamon-sugar inspired bagel."
  }
} as const;
const copy = {
  es: {
    status: "Vista de revisión: aquí no se crean pedidos ni se efectúan cobros.",
    closed: "Los pedidos están cerrados; puedes recorrer la tienda.",
    home: "01 / ENTRADA", counter: "02 / MOSTRADOR", box: "03 / TU CAJA", pay: "04 / CHECKOUT",
    kicker: "CLASSIC GRINGO BAGELS · LIMA",
    headline: "Entra. Mira. Antójate.",
    introduction: "Bienvenido a la tienda digital de Bagelito. Descubre nuestros sabores, míralos de cerca y arma una caja a tu manera.",
    explore: "Explorar sabores", build: "Armar mi caja", quick: "Ir directo al checkout",
    counterKicker: "ACÉRCATE AL MOSTRADOR", counterTitle: "Elige con los ojos.",
    counterIntro: "Diez sabores de nuestro catálogo, con sus fotografías reales. Toca para acercarte y suma tus favoritos a la caja.",
    all: "Todos", classics: "Clásicos", premium: "Premium / temporada",
    magnify: "Ver de cerca", add: "Agregar", choose: "Elegir",
    chosen: "en tu caja", packBuilding: "Estás armando", remaining: "espacios restantes", complete: "Caja completa",
    boxKicker: "ESCOGE TU FORMATO", boxTitle: "Una caja. A tu gusto.",
    boxIntro: "Un pack mixto para combinar o uno de un solo sabor. Mira cómo tu caja se va llenando.",
    mixed: "Combina sabores", single: "Un solo sabor", changed: "Cambiar de pack reinicia la selección.",
    noBagels: "Tu caja espera su primer bagel.", summary: "Tu caja",
    bagels: "bagels", packSubtotal: "Subtotal del pack", delivery: "El delivery se calcula por distrito en checkout.",
    checkout: "Continuar al checkout", demoCheckout: "Ver checkout de demostración",
    incomplete: "Completa los espacios de la caja para continuar.",
    remove: "Quitar un", increase: "Agregar un",
    zoomClose: "Cerrar detalle", photo: "Foto del catálogo Bagelito.",
    outro: "Del mostrador al checkout.", outroBody: "Revisa distrito, delivery y total antes de cualquier pago.",
    legal: "Términos y entrega", entranceNote: "Una tienda digital, no un local físico.",
  },
  en: {
    status: "Review preview: no orders or payments are created here.",
    closed: "Ordering is closed; you can still explore the store.",
    home: "01 / ENTRANCE", counter: "02 / COUNTER", box: "03 / YOUR BOX", pay: "04 / CHECKOUT",
    kicker: "CLASSIC GRINGO BAGELS · LIMA",
    headline: "Step in. Look around. Get hungry.",
    introduction: "Welcome to Bagelito's digital store. Discover our flavors, see every bagel up close, and build your own box.",
    explore: "Explore flavors", build: "Build my box", quick: "Go straight to checkout",
    counterKicker: "COME TO THE COUNTER", counterTitle: "Choose with your eyes.",
    counterIntro: "Ten flavors from our catalog, with real product photographs. Tap to zoom and add your favorites to the box.",
    all: "All", classics: "Classics", premium: "Premium / seasonal",
    magnify: "Take a closer look", add: "Add", choose: "Choose",
    chosen: "in your box", packBuilding: "You're building", remaining: "slots left", complete: "Box complete",
    boxKicker: "PICK YOUR FORMAT", boxTitle: "One box. Your rules.",
    boxIntro: "Mix flavors or pick one favorite. Watch your box fill up with your selection.",
    mixed: "Mix flavors", single: "Single flavor", changed: "Changing pack resets your selection.",
    noBagels: "Your box is waiting for its first bagel.", summary: "Your box",
    bagels: "bagels", packSubtotal: "Pack subtotal", delivery: "Delivery is calculated by district at checkout.",
    checkout: "Continue to checkout", demoCheckout: "View demo checkout",
    incomplete: "Fill the remaining box spaces to continue.",
    remove: "Remove one", increase: "Add one",
    zoomClose: "Close detail", photo: "Bagelito catalog photograph.",
    outro: "From counter to checkout.", outroBody: "Review district, delivery, and total before any payment.",
    legal: "Terms and delivery", entranceNote: "A digital store, not a physical location.",
  }
} as const;

function readDraft(raw: string | null): BoxDraft | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const input = value as Record<string, unknown>;
    const pack = packs.find((item) => item.slug === input.packSlug);
    if (input.version !== 1 || !pack) return null;
    const valid = new Set(flavors.map((item) => item.slug));
    const amounts: Record<string, number> = {};
    const rawAmounts = input.quantities && typeof input.quantities === "object" ? input.quantities as Record<string, unknown> : {};
    let spaces = pack.units;
    for (const flavor of flavors) {
      const n = rawAmounts[flavor.slug];
      const count = typeof n === "number" && Number.isInteger(n) ? Math.max(0, Math.min(n, spaces)) : 0;
      if (count) amounts[flavor.slug] = count;
      spaces -= count;
    }
    return {
      version: 1, packSlug: pack.slug,
      quantities: pack.packType === "mixed" ? amounts : {},
      singleFlavor: pack.packType === "single" && typeof input.singleFlavor === "string" && valid.has(input.singleFlavor) ? input.singleFlavor : "",
    };
  } catch { return null; }
}

export function ShopVisit({ paymentEnabled }: { paymentEnabled: boolean }) {
  const { locale } = useLanguage();
  const batch = useBatchAvailability();
  const t = copy[locale];
  const [packSlug, setPackSlug] = useState<PackSlug>("6-mixed");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [singleFlavor, setSingleFlavor] = useState("");
  const [filter, setFilter] = useState<"all" | "classic" | "premium">("all");
  const [zoom, setZoom] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const modalClose = useRef<HTMLButtonElement>(null);
  const pack = packs.find((item) => item.slug === packSlug) ?? packs[1];
  const reviewOnly = batch.merchantReviewOnly || !paymentEnabled;
  const count = pack.packType === "single" ? singleFlavor ? pack.units : 0 : Object.values(quantities).reduce((n, value) => n + value, 0);
  const remaining = Math.max(0, pack.units - count);
  const filled = remaining === 0;
  const closeup = flavors.find((item) => item.slug === zoom);
  const filtered = useMemo(() => filter === "all" ? flavors : flavors.filter((flavor) => flavor.category === filter), [filter]);
  const slots = useMemo(() => {
    if (pack.packType === "single") return singleFlavor ? Array.from({ length: pack.units }, () => singleFlavor) : [];
    const result: string[] = [];
    for (const flavor of flavors) for (let i = 0; i < (quantities[flavor.slug] ?? 0); i++) result.push(flavor.slug);
    return result;
  }, [pack.packType, pack.units, quantities, singleFlavor]);

  useEffect(() => {
    try {
      const draft = readDraft(window.localStorage.getItem(SHOP_DRAFT_KEY));
      if (draft) { setPackSlug(draft.packSlug); setQuantities(draft.quantities); setSingleFlavor(draft.singleFlavor); }
    } catch { /* Private browsing may deny storage. */ }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(SHOP_DRAFT_KEY, JSON.stringify({ version: 1, packSlug, quantities, singleFlavor }));
      window.dispatchEvent(new Event(SHOP_DRAFT_UPDATED_EVENT));
    }
    catch { /* Selection remains usable without storage. */ }
  }, [hydrated, packSlug, quantities, singleFlavor]);
  useEffect(() => {
    if (!zoom) return;
    modalClose.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setZoom(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoom]);

  function labelFor(slug: string) { return flavorCopy[locale][slug] ?? flavors.find((f) => f.slug === slug)?.name ?? slug; }
  function setPack(next: PackSlug) {
    if (next === packSlug) return;
    setPackSlug(next); setQuantities({}); setSingleFlavor("");
  }
  function changeFlavor(slug: string, delta: number) {
    if (!flavors.some((f) => f.slug === slug)) return;
    if (pack.packType === "single") { setSingleFlavor(delta > 0 ? slug : singleFlavor === slug ? "" : singleFlavor); return; }
    setQuantities((previous) => {
      const old = previous[slug] ?? 0;
      const total = Object.values(previous).reduce((sum, n) => sum + n, 0);
      const next = Math.max(0, Math.min(old + delta, pack.units - total + old));
      return { ...previous, [slug]: next };
    });
  }
  function visitCheckout() {
    if (!filled) return;
    try { window.localStorage.setItem(SHOP_DRAFT_KEY, JSON.stringify({ version: 1, packSlug, quantities, singleFlavor })); } catch { /* Optional. */ }
    window.location.assign("/checkout?pack=" + encodeURIComponent(packSlug));
  }

  return (
    <div className="bagelito-store">
      <div className="store-notice" role="status"><span className="store-notice-dot" />
        {reviewOnly ? t.status : !batch.accepting ? t.closed : t.entranceNote}
      </div>
      <section className="store-entrance" aria-labelledby="store-title">
        <div className="store-entrance-copy">
          <span className="store-index">{t.home}</span>
          <span className="store-kicker">{t.kicker}</span>
          <h1 id="store-title">{t.headline}</h1>
          <p>{t.introduction}</p>
          <div className="store-hero-buttons">
            <a className="store-primary" href="#mostrador">{t.explore}<ArrowRight size={19}/></a>
            <a className="store-secondary" href="#arma-tu-caja">{t.build}<ArrowDown size={18}/></a>
          </div>
          <Link href={"/checkout?pack=" + encodeURIComponent(packSlug)} className="store-quick">{t.quick} <ArrowRight size={16}/></Link>
          <div className="store-progress-decor" aria-hidden="true"><span>01</span><span>02</span><span>03</span><span>04</span></div>
        </div>
        <div className="store-showroom" aria-label={locale === "es" ? "Ilustración del mostrador digital con fotografías de bagels" : "Illustrated digital counter featuring bagel photographs"}>
          <div className="store-tile-wall" aria-hidden="true" />
          <div className="store-wall-name" aria-hidden="true">BAGELITO</div>
          <div className="store-hero-photo store-hero-photo-one"><Image src="/images/bagel-everything.webp" alt="Everything Bagel" fill sizes="(max-width: 760px) 49vw, 300px" quality={75} priority/></div>
          <div className="store-hero-photo store-hero-photo-two"><Image src="/images/bagel-jalapeno-cheddar.webp" alt="Jalapeño Cheddar" fill sizes="(max-width: 760px) 46vw, 290px" quality={75} priority/></div>
          <div className="store-hero-photo store-hero-photo-three"><Image src="/images/bagel-blueberry.webp" alt="Blueberry Bagel" fill sizes="(max-width: 760px) 35vw, 220px" quality={75}/></div>
          <div className="store-metal-counter" aria-hidden="true"><span>BAGELS · SCHMEARS · GOOD TIMES</span></div>
          <span className="store-scene-disclaimer">{t.entranceNote}</span>
        </div>
      </section>

      <section className="store-counter" id="mostrador" aria-labelledby="counter-title">
        <div className="store-section-title">
          <span className="store-index">{t.counter}</span><span className="store-kicker">{t.counterKicker}</span>
          <h2 id="counter-title">{t.counterTitle}</h2><p>{t.counterIntro}</p>
        </div>
        <div className="store-counter-bar">
          <div className="store-filters" role="group" aria-label={locale === "es" ? "Filtrar sabores" : "Filter flavors"}>
            {(["all", "classic", "premium"] as const).map((kind) => (
              <button type="button" key={kind} aria-pressed={filter === kind} className={filter === kind ? "active" : ""} onClick={() => setFilter(kind)}>
                {kind === "all" ? t.all : kind === "classic" ? t.classics : t.premium}
              </button>
            ))}
          </div>
          <a href="#arma-tu-caja" className="store-current-box"><ShoppingBag size={18}/>{t.packBuilding} {pack.units} {t.bagels} · {count}/{pack.units}</a>
        </div>
        <div className="store-products" aria-label={locale === "es" ? "Sabores del catálogo" : "Catalog flavors"}>
          {filtered.map((flavor) => {
            const name = labelFor(flavor.slug);
            const selected = pack.packType === "single" ? singleFlavor === flavor.slug ? pack.units : 0 : quantities[flavor.slug] ?? 0;
            return (
              <article className="store-product" key={flavor.slug}>
                <button type="button" className="store-product-image" onClick={() => setZoom(flavor.slug)} aria-label={t.magnify + ": " + name}>
                  <Image src={flavorImages[flavor.slug]} alt={name} width={350} height={350} sizes="(max-width: 640px) 66vw, 280px" quality={75} loading="lazy"/>
                  <span className="store-zoom-mark">+</span>
                </button>
                <div className="store-product-copy">
                  <span className="store-product-category">{flavor.seasonal ? t.premium : flavor.category === "premium" ? "Premium" : t.classics}</span>
                  <h3>{name}</h3><p>{descriptions[locale][flavor.slug as keyof typeof descriptions.es]}</p>
                  <div className="store-product-foot">
                    <span>{selected ? selected + " " + t.chosen : locale === "es" ? "Pack desde S/50" : "Pack from S/50"}</span>
                    <button type="button" disabled={pack.packType === "mixed" && remaining === 0 || pack.packType === "single" && selected === pack.units}
                      onClick={() => changeFlavor(flavor.slug, 1)} aria-label={t.add + ": " + name}>
                      <Plus size={18}/>{pack.packType === "single" ? t.choose : t.add}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="store-counter-end" aria-live="polite">
          <strong>{filled ? t.complete : remaining + " " + t.remaining}</strong>
          <a href="#arma-tu-caja">{t.summary} <ArrowRight size={17}/></a>
        </div>
      </section>

      <section className="store-builder" id="arma-tu-caja" aria-labelledby="builder-title">
        <div className="store-section-title">
          <span className="store-index">{t.box}</span><span className="store-kicker">{t.boxKicker}</span>
          <h2 id="builder-title">{t.boxTitle}</h2><p>{t.boxIntro}</p>
        </div>
        <div className="store-pack-options" role="group" aria-label={locale === "es" ? "Elige un pack" : "Choose a pack"}>
          {packs.map((option) => (
            <button type="button" key={option.slug} className={packSlug === option.slug ? "store-pack active" : "store-pack"}
              aria-pressed={packSlug === option.slug} onClick={() => setPack(option.slug)}>
              <span>{option.units} BAGELS</span><strong>{packCopy[locale][option.slug].name}</strong><b>S/{option.amount}</b>
              <small>{option.packType === "mixed" ? t.mixed : t.single}</small>
            </button>
          ))}
        </div>
        <p className="store-pack-hint">{t.changed}</p>
        <div className="store-builder-layout">
          <div className="store-box-scene" aria-label={t.summary + ": " + count + "/" + pack.units}>
            <div className="store-box-lid"><strong>BAGELITO</strong><span>CLASSIC GRINGO BAGELS</span></div>
            <div className="store-box-tray">
              {Array.from({ length: pack.units }, (_, index) => {
                const slug = slots[index];
                return (
                  <div className={slug ? "store-box-slot filled" : "store-box-slot"} key={index}>
                    {slug ? <Image src={flavorImages[slug]} alt={labelFor(slug)} fill sizes="(max-width: 620px) 18vw, 95px" quality={75}/> : <span aria-hidden="true">+</span>}
                  </div>
                );
              })}
            </div>
            <div className="store-box-front"><span>MADE IN LIMA · MADE TO SHARE</span><strong>{count} / {pack.units}</strong></div>
          </div>
          <aside className="store-cart" aria-label={t.summary}>
            <span className="store-index">{t.summary}</span>
            <h3>{packCopy[locale][pack.slug].name}</h3>
            <div className="store-cart-meter" role="progressbar" aria-valuemin={0} aria-valuemax={pack.units} aria-valuenow={count} aria-label={t.summary}>
              <span style={{ width: count / pack.units * 100 + "%" }}/>
            </div>
            <p className="store-cart-count" aria-live="polite">{count}/{pack.units} {t.bagels} · {filled ? t.complete : remaining + " " + t.remaining}</p>
            <div className="store-cart-lines" aria-live="polite">
              {!slots.length ? <p className="store-empty-message">{t.noBagels}</p> : flavors.filter((flavor) => slots.includes(flavor.slug)).map((flavor) => {
                const n = pack.packType === "single" ? pack.units : quantities[flavor.slug] ?? 0;
                return (
                  <div className="store-cart-line" key={flavor.slug}>
                    <Image src={flavorImages[flavor.slug]} alt="" width={48} height={48} quality={75}/>
                    <strong>{labelFor(flavor.slug)}</strong>
                    <div className="store-item-controls">
                      <button type="button" aria-label={t.remove + " " + labelFor(flavor.slug)} onClick={() => changeFlavor(flavor.slug, -1)}><Minus size={14}/></button>
                      <b>{n}</b>
                      <button type="button" disabled={remaining === 0 || pack.packType === "single"}
                        aria-label={t.increase + " " + labelFor(flavor.slug)} onClick={() => changeFlavor(flavor.slug, 1)}><Plus size={14}/></button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="store-cart-total"><span>{t.packSubtotal}</span><strong>S/{pack.amount}</strong></div>
            <p className="store-delivery-note">{t.delivery}</p>
            <button type="button" className="store-primary store-checkout" disabled={!filled} onClick={visitCheckout}>
              {reviewOnly ? t.demoCheckout : t.checkout} <ArrowRight size={19}/>
            </button>
            {!filled ? <p className="store-cart-help">{t.incomplete}</p> : null}
            {reviewOnly ? <p className="store-cart-warning">{t.status}</p> : null}
          </aside>
        </div>
      </section>

      <section className="store-final" aria-labelledby="store-final-title">
        <div><span className="store-index">{t.pay}</span><h2 id="store-final-title">{t.outro}</h2><p>{t.outroBody}</p></div>
        <div><a href="#arma-tu-caja" className="store-primary">{t.build}<ArrowRight size={18}/></a><Link href="/legal">{t.legal}</Link></div>
      </section>

      {closeup ? (
        <div className="store-modal-overlay" onMouseDown={(event) => { if (event.currentTarget === event.target) setZoom(null); }}>
          <div className="store-modal" role="dialog" aria-modal="true" aria-label={labelFor(closeup.slug)}>
            <button type="button" className="store-modal-x" ref={modalClose} aria-label={t.zoomClose} onClick={() => setZoom(null)}><X size={25}/></button>
            <div className="store-modal-photo"><Image src={flavorImages[closeup.slug]} alt={labelFor(closeup.slug)} width={540} height={540} sizes="(max-width: 760px) 90vw, 440px" quality={75}/></div>
            <div className="store-modal-copy"><span className="store-kicker">BAGELITO</span><h3>{labelFor(closeup.slug)}</h3><p>{descriptions[locale][closeup.slug as keyof typeof descriptions.es]}</p>
              <small>{t.photo}</small>
              <button type="button" className="store-primary" disabled={pack.packType === "mixed" && remaining === 0} onClick={() => { changeFlavor(closeup.slug, 1); setZoom(null); }}>
                {t.add}<Plus size={17}/>
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <a href="#arma-tu-caja" className="store-mobile-bag" aria-label={t.summary + ": " + count + "/" + pack.units}>
        <ShoppingBag size={18}/>{t.summary}<strong>{count}/{pack.units}</strong>{filled ? <Check size={17}/> : <ArrowRight size={17}/>}
      </a>
    </div>
  );
}
