"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, DoorOpen, Minus, Plus, ShoppingBag, Sparkles, X } from "lucide-react";
import { flavors } from "@/data/flavors";
import { flavorImages } from "@/data/flavor-images";
import { packs, type PackSlug } from "@/data/packs";
import { flavorCopy, packCopy } from "@/lib/i18n";
import { districtDeliveryDistancesKm, getDeliveryFee } from "@/lib/delivery-pricing";
import { SHOP_DRAFT_KEY, SHOP_DRAFT_UPDATED_EVENT } from "@/lib/shop-draft";
import { useBatchAvailability } from "@/components/BatchAvailabilityProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { FirstStageChoice } from "@/components/store/FirstStageChoice";
import { FirstStageProgress } from "@/components/store/FirstStageProgress";
import { getFirstStageFromHash, hashForFirstStage, type FirstStageStep, type PackFamily } from "@/lib/storefront-first-stage";

type Scene = "entry" | "counter" | "build" | "cashier";
type Draft = { version: 1; packSlug: PackSlug; quantities: Record<string, number>; singleFlavor: string; district?: string };
type FlyingBagel = { slug: string; x: number; y: number; dx: number; dy: number; key: number };
const scenes: Scene[] = ["entry", "counter", "build", "cashier"];
const sceneHash: Record<Scene, string> = { entry: "#entrar", counter: "#mostrador", build: "#arma-tu-caja", cashier: "#caja" };
const getScene = (hash: string): Scene => hash === "#packs" ? "counter" : scenes.find((s) => sceneHash[s] === hash) ?? "entry";
const descriptions = {
  es: {
    "jalapeno-cheddar": "Cheddar dorado, con un toque de jalapeño.",
    cheddar: "Dorado, sabroso y con cheddar.",
    sesame: "El clásico bagel cubierto de ajonjolí.",
    "everything-bagel": "El clásico everything, lleno de sabor.",
    "cinnamon-raisin": "Canela y pasas en cada mordida.",
    blueberry: "Blueberry en una miga suave y elástica.",
    plain: "El original. Dorado por fuera, suave por dentro.",
    "classic-onion": "Cebolla, una costra tostada y mucho carácter.",
    "rainbow-custom-colors": "El bagel colorido para celebrar.",
    snickerdoodle: "Edición de temporada inspirada en canela y azúcar."
  },
  en: {
    "jalapeno-cheddar": "Golden cheddar with a touch of jalapeño.",
    cheddar: "Golden, savory, and topped with cheddar.",
    sesame: "The classic bagel with a sesame crust.",
    "everything-bagel": "The everything classic, packed with flavor.",
    "cinnamon-raisin": "Cinnamon and raisins in every bite.",
    blueberry: "Blueberry in a soft, chewy crumb.",
    plain: "The original. Golden outside, chewy inside.",
    "classic-onion": "Onion, a toasted crust, plenty of character.",
    "rainbow-custom-colors": "A colorful bagel made for celebrations.",
    snickerdoodle: "A seasonal cinnamon-sugar inspired special."
  }
} as const;
const words = {
  es: {
    sections: ["Entrada", "Mostrador", "Arma tu caja", "Pagar"],
    preview: "Visita de revisión · No se registran pedidos ni cobros",
    closed: "Pedidos cerrados · Puedes explorar el catálogo",
    note: "Recorrido digital ilustrado · No es una fotografía de un local",
    entryEyebrow: "BIENVENIDO A BAGELITO · LIMA",
    entryTitle: "No mires la vitrina. Entra.",
    entryBody: "Una tienda digital hecha para elegir con los ojos. Entra al mostrador, descubre los sabores y arma tu propia caja.",
    enter: "Entrar a Bagelito", start: "Abrir la puerta", quick: "Comprar sin recorrido",
    enterHint: "Toca la puerta para entrar", roomSign: "GOOD BAGELS GOOD DAYS",
    counterEyebrow: "02 / EN EL MOSTRADOR",
    counterTitle: "Acércate. Elige uno.",
    counterBody: "Toca cualquier bagel para verlo de cerca. Añádelo a tu caja y observa cómo se llena.",
    all: "Todos", classic: "Clásicos", premium: "Premium",
    shelfName: "EL MOSTRADOR", shelfHint: "Desliza para explorar los diez sabores",
    focusLabel: "En la vitrina", add: "Agregar a mi caja", choose: "Elegir este sabor",
    selectPack: "Cambiar formato", viewBox: "Ir a mi caja", boxProgress: "En tu caja",
    full: "Caja completa", slotsLeft: "espacios libres", from: "Packs desde S/50",
    builderEyebrow: "03 / MESA DE ARMADO", builderTitle: "Hazla tuya.",
    builderBody: "Elige el tamaño. Toca un sabor para ponerlo en la caja, uno por uno.",
    format: "Elige tu formato", mixed: "Surtidos", single: "Un sabor",
    switchResets: "Cambiar el formato reinicia los sabores seleccionados.",
    openSpaces: "espacios por llenar", noItems: "Todavía no has elegido ninguno.",
    total: "Subtotal del pack", changePack: "Editar sabores", box: "Tu caja",
    addFast: "Suma desde la bandeja", nextCashier: "Pasar por caja",
    checkoutEyebrow: "04 / EN LA CAJA", checkoutTitle: "Tu pedido, a la vista.",
    checkoutBody: "Aquí ves el importe antes de pasar al checkout. El pago solo se habilitará después de la aprobación comercial.",
    cashierSign: "BAGELITO CHECKOUT", receipt: "TU TICKET", package: "Pack",
    district: "Distrito de entrega", delivery: "Delivery referencial por distrito", payable: "Total estimado",
    finalDetail: "La dirección y los datos del cliente se completan en el checkout.",
    continue: "Ir al checkout", demo: "Explorar checkout de demostración",
    edit: "Volver a editar", first: "Primero completa la caja", back: "Regresar",
    legal: "Términos y políticas", focusClose: "Cerrar detalle",
    photo: "Fotografía del catálogo real", save: "agregado a tu caja",
    reset: "Formato cambiado. Empieza una nueva combinación.",
    stageLandmark: "Recorrido por Bagelito", cart: "Tu caja",
    mobileGo: "Ver mi caja", fastHint: "¿Ya sabes lo que quieres?",
    finalBand: "Del antojo a tu caja.", finalLine: "Descubre, combina y revisa el total. Todo sin complicaciones.",
  },
  en: {
    sections: ["Entrance", "Counter", "Build a box", "Checkout"],
    preview: "Review experience · No orders or payments are created",
    closed: "Orders closed · You can still browse the catalog",
    note: "Illustrated digital store · Not a photograph of a physical location",
    entryEyebrow: "WELCOME TO BAGELITO · LIMA",
    entryTitle: "Don't just window-shop. Come in.",
    entryBody: "A digital store made for choosing with your eyes. Step up to the counter, find your flavors, and build a box.",
    enter: "Step inside Bagelito", start: "Open the door", quick: "Skip straight to checkout",
    enterHint: "Tap the door to enter", roomSign: "GOOD BAGELS GOOD DAYS",
    counterEyebrow: "02 / AT THE COUNTER",
    counterTitle: "Come closer. Pick one.",
    counterBody: "Tap any bagel to see it up close. Add it to your box and watch it fill.",
    all: "All", classic: "Classics", premium: "Premium",
    shelfName: "THE COUNTER", shelfHint: "Swipe to explore all ten flavors",
    focusLabel: "On display", add: "Add to my box", choose: "Choose this flavor",
    selectPack: "Switch box", viewBox: "See my box", boxProgress: "In your box",
    full: "Box complete", slotsLeft: "slots left", from: "Boxes from S/50",
    builderEyebrow: "03 / PACKING TABLE", builderTitle: "Make it yours.",
    builderBody: "Pick a size. Tap any flavor to place it in your box, one by one.",
    format: "Pick your format", mixed: "Mixed", single: "One flavor",
    switchResets: "Switching your pack resets selected flavors.",
    openSpaces: "spaces to fill", noItems: "You haven't selected any yet.",
    total: "Pack subtotal", changePack: "Edit flavors", box: "Your box",
    addFast: "Pick from the tray", nextCashier: "Go to the register",
    checkoutEyebrow: "04 / AT THE REGISTER", checkoutTitle: "Your order, in plain sight.",
    checkoutBody: "Review the full estimate before checkout. Real payments remain off until merchant approval.",
    cashierSign: "BAGELITO CHECKOUT", receipt: "YOUR RECEIPT", package: "Box",
    district: "Delivery district", delivery: "Estimated district delivery", payable: "Estimated total",
    finalDetail: "Enter your address and customer details at checkout.",
    continue: "Continue to checkout", demo: "Preview demo checkout",
    edit: "Back to your box", first: "Fill your box first", back: "Go back",
    legal: "Terms and policies", focusClose: "Close detail",
    photo: "Actual catalog photograph", save: "added to your box",
    reset: "Pack changed. Start a new combination.",
    stageLandmark: "Bagelito store visit", cart: "Your box",
    mobileGo: "See my box", fastHint: "Know exactly what you want?",
    finalBand: "From craving to box.", finalLine: "Discover, mix, and review the total. No fuss.",
  }
} as const;
function safeDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== "object") return null;
    const v = input as Record<string, unknown>;
    const pack = packs.find((p) => p.slug === v.packSlug);
    if (!pack || v.version !== 1) return null;
    const known = new Set(flavors.map((f) => f.slug));
    const inputQuantities = v.quantities && typeof v.quantities === "object" ? v.quantities as Record<string, unknown> : {};
    const quantities: Record<string, number> = {};
    let capacity = pack.units;
    for (const f of flavors) {
      const amount = inputQuantities[f.slug];
      const count = typeof amount === "number" && Number.isInteger(amount) ? Math.max(0, Math.min(amount, capacity)) : 0;
      if (count) quantities[f.slug] = count;
      capacity -= count;
    }
    return {
      version: 1, packSlug: pack.slug, quantities: pack.packType === "mixed" ? quantities : {},
      singleFlavor: pack.packType === "single" && typeof v.singleFlavor === "string" && known.has(v.singleFlavor) ? v.singleFlavor : "",
      district: typeof v.district === "string" && Object.hasOwn(districtDeliveryDistancesKm, v.district) ? v.district : undefined,
    };
  } catch { return null; }
}

export function StoreWalkthrough({ paymentEnabled }: { paymentEnabled: boolean }) {
  const { locale } = useLanguage();
  const t = words[locale];
  const { accepting, merchantReviewOnly } = useBatchAvailability();
  const [scene, setScene] = useState<Scene>("entry");
  const [entering, setEntering] = useState(false);
  const [firstStageStep, setFirstStageStep] = useState<FirstStageStep>("entry");
  const [selectedPackFamily, setSelectedPackFamily] = useState<PackFamily | null>(null);
  const [packSlug, setPackSlug] = useState<PackSlug>("6-mixed");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [singleFlavor, setSingleFlavor] = useState("");
  const [district, setDistrict] = useState("Miraflores");
  const [hydrated, setHydrated] = useState(false);
  const [filter, setFilter] = useState<"all" | "classic" | "premium">("all");
  const [spotlight, setSpotlight] = useState("everything-bagel");
  const [detail, setDetail] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [flying, setFlying] = useState<FlyingBagel | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rackRef = useRef<HTMLDivElement>(null);
  const boxTrayRef = useRef<HTMLDivElement>(null);
  const doorTimerRef = useRef<number | null>(null);
  const basketRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const focusReturn = useRef<HTMLElement | null>(null);
  const reviewOnly = merchantReviewOnly || !paymentEnabled;
  const pack = packs.find((p) => p.slug === packSlug) ?? packs[1];
  const count = pack.packType === "single" ? singleFlavor ? pack.units : 0 : Object.values(quantities).reduce((sum, n) => sum + n, 0);
  const remaining = Math.max(0, pack.units - count);
  const filled = remaining === 0;
  const slots = useMemo(() => {
    if (pack.packType === "single") return singleFlavor ? Array.from({ length: pack.units }, () => singleFlavor) : [];
    return flavors.flatMap((f) => Array.from({ length: quantities[f.slug] ?? 0 }, () => f.slug));
  }, [pack.packType, pack.units, singleFlavor, quantities]);
  const spotlightFlavor = flavors.find((f) => f.slug === spotlight) ?? flavors[0];
  const detailedFlavor = flavors.find((f) => f.slug === detail) ?? null;
  const filtered = filter === "all" ? flavors : flavors.filter((f) => f.category === filter);
  const deliveryFee = getDeliveryFee(district);
  const total = pack.amount + deliveryFee;

  useEffect(() => {
    try {
      const saved = safeDraft(window.localStorage.getItem(SHOP_DRAFT_KEY));
      if (saved) {
        setPackSlug(saved.packSlug);
        setQuantities(saved.quantities);
        setSingleFlavor(saved.singleFlavor);
        if (saved.district) setDistrict(saved.district);
      }
    } catch { /* Private browsing can disable storage. */ }
    setFirstStageStep(getFirstStageFromHash(window.location.hash));
    setScene(getScene(window.location.hash));
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(SHOP_DRAFT_KEY, JSON.stringify({ version: 1, packSlug, quantities, singleFlavor, district }));
      window.dispatchEvent(new Event(SHOP_DRAFT_UPDATED_EVENT));
    } catch { /* Browsing must work without storage. */ }
  }, [hydrated, packSlug, quantities, singleFlavor, district]);
  useEffect(() => {
    const fromHistory = () => {
      if (doorTimerRef.current) window.clearTimeout(doorTimerRef.current);
      doorTimerRef.current = null;
      setEntering(false);
      setFirstStageStep(getFirstStageFromHash(window.location.hash));
      setScene(getScene(window.location.hash));
    };
    window.addEventListener("popstate", fromHistory);
    window.addEventListener("hashchange", fromHistory);
    return () => {
      if (doorTimerRef.current) window.clearTimeout(doorTimerRef.current);
      window.removeEventListener("popstate", fromHistory);
      window.removeEventListener("hashchange", fromHistory);
    };
  }, []);
  useEffect(() => {
    if (!detail) return;
    focusReturn.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetail(null);
      if (event.key === "Tab") {
        const dialog = document.querySelector<HTMLElement>(".walk-detail-dialog");
        const interactive = dialog ? [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled),a[href]")] : [];
        if (!interactive.length) return;
        if (event.shiftKey && document.activeElement === interactive[0]) {
          event.preventDefault(); interactive[interactive.length - 1].focus();
        } else if (!event.shiftKey && document.activeElement === interactive[interactive.length - 1]) {
          event.preventDefault(); interactive[0].focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); focusReturn.current?.focus(); };
  }, [detail]);

  function label(slug: string) {
    return flavorCopy[locale][slug] ?? flavors.find((f) => f.slug === slug)?.name ?? slug;
  }
  function move(next: Scene) {
    if (doorTimerRef.current) window.clearTimeout(doorTimerRef.current);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const commit = () => {
      doorTimerRef.current = null;
      setScene(next);
      setDetail(null);
      setEntering(false);
      if (next === "entry") { setFirstStageStep("entry"); setSelectedPackFamily(null); }
      if (next === "counter") { setFirstStageStep("category"); setSelectedPackFamily(null); }
      const nextHash = next === "entry" ? hashForFirstStage("entry") : next === "counter" ? hashForFirstStage("category") : sceneHash[next];
      if (window.location.hash !== nextHash) window.history.pushState(null, "", nextHash);
      window.requestAnimationFrame(() => {
        stageRef.current?.scrollIntoView({block:"start",behavior:reduced?"auto":"smooth"});
        window.requestAnimationFrame(() => document.querySelector<HTMLElement>(".walk-frame.is-active h1, .walk-frame.is-active h2")?.focus({preventScroll:true}));
      });
    };
    if (scene === "entry" && next === "counter" && !reduced) {
      setEntering(true);
      doorTimerRef.current = window.setTimeout(commit, 470);
    } else commit();
  }
  function changePack(next: PackSlug) {
    if (next === packSlug) return;
    setPackSlug(next);
    setQuantities({});
    setSingleFlavor("");
    setAnnouncement(t.reset);
  }
  function updateFlavor(slug: string, change: number) {
    if (!flavors.some((f) => f.slug === slug)) return;
    if (pack.packType === "single") {
      setSingleFlavor((current) => change > 0 ? slug : current === slug ? "" : current);
      return;
    }
    setQuantities((current) => {
      const old = current[slug] ?? 0;
      const currentTotal = Object.values(current).reduce((sum, n) => sum + n, 0);
      const next = Math.max(0, Math.min(old + change, pack.units - currentTotal + old));
      return { ...current, [slug]: next };
    });
  }
  function canAdd(slug: string) {
    return pack.packType === "single" ? singleFlavor !== slug : remaining > 0;
  }
  function add(slug: string, event?: MouseEvent<HTMLButtonElement>) {
    if (!canAdd(slug)) return;
    updateFlavor(slug, 1);
    setAnnouncement(label(slug) + " " + t.save);
    if (!event || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const source = event.currentTarget.getBoundingClientRect();
    const emptySlot = scene === "build" ? boxTrayRef.current?.querySelector<HTMLElement>(".store-box-slot:not(.filled)") : null;
    const destination = (emptySlot || basketRef.current)?.getBoundingClientRect();
    if (!destination) return;
    const x = source.left + source.width / 2 - 37;
    const y = source.top + source.height / 2 - 37;
    setFlying({
      slug, key: Date.now(), x, y,
      dx: destination.left + destination.width / 2 - (x + 37),
      dy: destination.top + destination.height / 2 - (y + 37),
    });
  }
  function onMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--walk-px", (20 * ((event.clientX - rect.left) / rect.width - .5)).toFixed(1) + "px");
    event.currentTarget.style.setProperty("--walk-py", (14 * ((event.clientY - rect.top) / rect.height - .5)).toFixed(1) + "px");
  }
  function checkout() {
    if (!filled) { move("build"); return; }
    try {
      window.localStorage.setItem(SHOP_DRAFT_KEY, JSON.stringify({ version: 1, packSlug, quantities, singleFlavor, district }));
    } catch { /* Never block shopping if storage is denied. */ }
    window.location.assign("/checkout?pack=" + encodeURIComponent(packSlug));
  }

  return (
    <div className="bagelito-store walk-store has-first-stage">
      <div className="store-notice walk-review-note" role="status">
        <span className="store-notice-dot" />
        {reviewOnly ? t.preview : !accepting ? t.closed : t.note}
      </div>
      <div className="walk-main" aria-label={t.stageLandmark}>
        <div className="walk-top" ref={stageRef}>
          <div className="walk-top-info">
            <span className="walk-kicker">BAGELITO EXPERIENCE</span>
            <span className="walk-digital-label">{t.note}</span>
          </div>
          <div className="walk-wayfinding">
            <nav className="walk-steps" aria-label={t.stageLandmark}>
              {scenes.map((s, index) => (
                <button key={s} type="button" className={scene === s ? "is-active" : ""} aria-pressed={scene === s}
                  onClick={() => move(s)}>
                  <span>{String(index + 1).padStart(2,"0")}</span>
                  <strong>{t.sections[index]}</strong>
                </button>
              ))}
            </nav>
            <button ref={basketRef} type="button" className="walk-pocket" aria-label={t.cart + ": " + count + "/" + pack.units} onClick={() => move("build")}>
              <ShoppingBag size={19} /><span>{count} / {pack.units}</span>
            </button>
          </div>
        </div>

        <div className="walk-theatre" data-scene={scene} data-entering={entering} onPointerMove={onMove}>
          <div className="walk-spatial-environment" aria-hidden="true"><span className="walk-env-sign">BAGELITO</span><span className="walk-env-floor" /></div>
          <section className={"walk-frame walk-entry" + (scene === "entry" ? " is-active" : "")} aria-hidden={scene !== "entry"} id="entrar">
            <div className="walk-entry-copy">
              <span className="walk-eyebrow"><Sparkles size={15} /> {t.entryEyebrow}</span>
              <h1 tabIndex={-1}>{t.entryTitle}</h1>
              <p>{t.entryBody}</p>
              <div className="walk-entry-actions">
                <Link href={hashForFirstStage("category")} className="walk-primary" aria-disabled={entering} onClick={(event) => { event.preventDefault(); if (!entering) move("counter"); }}>{t.enter} <ArrowRight size={20} /></Link>
                <button type="button" className="walk-quiet" onClick={() => move("build")}>{t.fastHint} <ChevronRight size={17} /></button>
              </div>
              <Link className="walk-direct-link" href={"/checkout?pack=" + encodeURIComponent(packSlug)}>{t.quick} <ArrowRight size={17} /></Link>
              <div className="walk-entrance-flourish"><span>EST. LIMA</span><i /><span>CLASSIC GRINGO BAGELS</span></div>
            </div>
            <div className="walk-entrance-art">
              <div className="walk-façade" aria-hidden="true">
                <div className="walk-awning"><span>BAGELITO</span><span>CLASSIC GRINGO BAGELS</span></div>
                <div className="walk-façade-wall" />
                <div className="walk-interior-glimpse">
                  <div className="walk-back-sign">BAGELITO</div>
                  <div className="walk-glimpse-shelf">
                    <Image src="/images/bagel-everything.webp" alt="" width={200} height={200} priority quality={75} />
                    <Image src="/images/bagel-jalapeno-cheddar.webp" alt="" width={200} height={200} priority quality={75} />
                    <Image src="/images/bagel-blueberry.webp" alt="" width={200} height={200} quality={75} />
                  </div>
                  <div className="walk-glimpse-metal" />
                </div>
                <div className="walk-door-glass">
                  <div className="walk-door-panel left"><span /></div>
                  <div className="walk-door-panel right"><span /></div>
                </div>
                <div className="walk-façade-tiles" />
              </div>
              <Link href={hashForFirstStage("category")} className="walk-entrance-hotspot" aria-disabled={entering}
                onClick={(event) => { event.preventDefault(); if (!entering) move("counter"); }} aria-label={t.start}>
                <DoorOpen size={21}/><span>{t.start}</span><ArrowRight size={17}/>
              </Link>
              <span className="walk-door-hint">{t.enterHint}</span>
            </div>
          </section>

          <section className={"walk-frame walk-counter" + (scene === "counter" ? " is-active" : "")}
            aria-hidden={scene !== "counter"} id="mostrador">
            <div className="walk-room-perspective" aria-hidden="true">
              <div className="walk-room-wall"><span>BAGELITO</span><small>{t.roomSign}</small></div>
              <div className="walk-room-ceiling"/>
              <div className="walk-room-floor" />
              <div className="walk-room-light one" /><div className="walk-room-light two"/>
            </div>
            <FirstStageChoice
              step={firstStageStep === "pack-size" ? "pack-size" : "category"}
              selectedFamily={selectedPackFamily}
              onPacks={() => {
                setSelectedPackFamily(null);
                setFirstStageStep("pack-size");
                if (window.location.hash !== hashForFirstStage("pack-size")) {
                  window.history.pushState({ bagelitoFirstStage: true }, "", hashForFirstStage("pack-size"));
                }
              }}
              onBack={() => {
                if (window.history.state?.bagelitoFirstStage) window.history.back();
                else {
                  setSelectedPackFamily(null);
                  setFirstStageStep("category");
                  window.history.replaceState(null, "", hashForFirstStage("category"));
                }
              }}
              onFamily={(family) => {
                setSelectedPackFamily(family);
                setAnnouncement(family === "large" ? "Bagels grandes seleccionado." : "Mini bagels seleccionado.");
              }}
            />
            <div className="walk-counter-layout">
              <div className="walk-counter-header">
                <div><span className="walk-eyebrow">{t.counterEyebrow}</span><h2 tabIndex={-1}>{t.counterTitle}</h2><p>{t.counterBody}</p></div>
                <button type="button" className="walk-minibag" onClick={() => move("build")}><ShoppingBag size={17}/>{count}/{pack.units}<ChevronRight size={15}/></button>
              </div>
              <div className="walk-counter-floorplan">
                <div className="walk-display-case">
                  <div className="walk-display-heading">
                    <span>{t.shelfName}</span>
                    <div className="walk-counter-filters" role="group" aria-label={locale==="es"?"Filtrar sabores":"Filter flavors"}>
                      {(["all","classic","premium"] as const).map((value) => (
                        <button type="button" aria-pressed={filter===value} className={filter===value?"active":""} key={value} onClick={() => setFilter(value)}>
                          {value==="all"?t.all:value==="classic"?t.classic:t.premium}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="walk-rack-controls" role="group" aria-label={locale==="es"?"Recorrer los sabores":"Browse flavors"}>
                    <button type="button" onClick={() => rackRef.current?.scrollBy({left:-322,behavior:"smooth"})} aria-label={locale==="es"?"Sabores anteriores":"Previous flavors"}><ArrowLeft size={18}/></button>
                    <span>{t.shelfHint}</span>
                    <button type="button" onClick={() => rackRef.current?.scrollBy({left:322,behavior:"smooth"})} aria-label={locale==="es"?"Ver más sabores":"Show more flavors"}><ArrowRight size={18}/></button>
                  </div>
                  <div ref={rackRef} className="walk-rack" aria-label={t.shelfName}>
                    {filtered.map((f) => {
                      const selected = pack.packType==="single" ? singleFlavor===f.slug?pack.units:0 : (quantities[f.slug]??0);
                      return (
                        <article className={"walk-rack-item store-product" + (spotlight === f.slug ? " is-spotlight" : "")} key={f.slug} onMouseEnter={()=>setSpotlight(f.slug)}>
                          <button type="button" className="walk-rack-photo store-product-image" aria-label={t.photo + " " + label(f.slug)}
                            onClick={() => {setSpotlight(f.slug);setDetail(f.slug);}}>
                            <Image src={flavorImages[f.slug]} alt={label(f.slug)} width={230} height={230}
                              sizes="(max-width: 760px) 130px, 160px" quality={75} loading="eager"/>
                          </button>
                          <div className="walk-rack-label"><strong>{label(f.slug)}</strong><span>{selected ? selected + " ✓" : t.from}</span></div>
                          <button type="button" className="walk-rack-plus" onClick={(event)=>add(f.slug,event)}
                            disabled={!canAdd(f.slug)} aria-label={t.add + ": " + label(f.slug)}><Plus size={16}/></button>
                        </article>
                      );
                    })}
                  </div>
                  <div className="walk-metal-lip"><span>BAGELITO</span><span>{t.shelfHint}</span><span>BAKED WITH LOVE</span></div>
                </div>
                <aside className="walk-spotlight" aria-label={t.focusLabel}>
                  <span className="walk-spotlight-kicker">{t.focusLabel} <Sparkles size={15}/></span>
                  <button type="button" className="walk-spotlight-photo" onClick={() => setDetail(spotlightFlavor.slug)}
                    aria-label={t.photo + " " + label(spotlightFlavor.slug)}>
                    <Image src={flavorImages[spotlightFlavor.slug]} alt={label(spotlightFlavor.slug)} width={390} height={390}
                      sizes="(max-width: 800px) 70vw, 310px" quality={75} loading="eager"/>
                  </button>
                  <h3>{label(spotlightFlavor.slug)}</h3>
                  <p>{descriptions[locale][spotlightFlavor.slug as keyof typeof descriptions.es]}</p>
                  <button type="button" className="walk-primary walk-add-action" disabled={!canAdd(spotlightFlavor.slug)}
                    onClick={(event) => add(spotlightFlavor.slug,event)}>{pack.packType==="single"?t.choose:t.add}<Plus size={18}/></button>
                  <button type="button" className="walk-quiet" onClick={() => move("build")}>{t.viewBox}<ArrowRight size={16}/></button>
                </aside>
              </div>
            </div>
          </section>

          <section className={"walk-frame walk-build" + (scene === "build" ? " is-active" : "")}
            aria-hidden={scene !== "build"} id="arma-tu-caja">
            <div className="walk-build-top">
              <div><span className="walk-eyebrow">{t.builderEyebrow}</span><h2 tabIndex={-1}>{t.builderTitle}</h2><p>{t.builderBody}</p></div>
              <button type="button" className="walk-quiet" onClick={() => move("counter")}><ArrowLeft size={16}/>{t.back}</button>
            </div>
            <div className="walk-pack-options store-pack-options" role="group" aria-label={t.format}>
              {packs.map((option) => (
                <button key={option.slug} type="button" className={"walk-pack store-pack" + (packSlug===option.slug?" active":"")}
                  aria-pressed={packSlug===option.slug} onClick={() => changePack(option.slug)}>
                  <span>{option.units} BAGELS</span>
                  <strong>{packCopy[locale][option.slug].name}</strong>
                  <b>S/{option.amount}</b>
                  <small>{option.packType==="single"?t.single:t.mixed}</small>
                </button>
              ))}
            </div>
            <p className="walk-pack-warning">{t.switchResets}</p>
            <div className="walk-workbench">
              <div className="walk-workbench-left">
                <div className="walk-metal-table">
                  <div className="store-box-scene" aria-label={t.box+": "+count+"/"+pack.units}>
                    <div className="store-box-lid"><strong>BAGELITO</strong><span>CLASSIC GRINGO BAGELS</span></div>
                    <div ref={boxTrayRef} className="store-box-tray">
                      {Array.from({length:pack.units},(_,index)=>{
                        const slug=slots[index];
                        return (
                          <button type="button" className={"store-box-slot"+(slug?" filled":"")} key={index}
                            aria-label={slug ? (locale==="es"?"Quitar ":"Remove ")+label(slug)+(locale==="es"?" de la caja":" from the box") : (locale==="es"?"Espacio vacío, elegir sabor":"Empty slot, pick a flavor")}
                            onClick={() => slug ? updateFlavor(slug,-1) : document.querySelector<HTMLElement>(".walk-mix-tray")?.scrollIntoView({block:"nearest",behavior:"smooth"})}>
                            {slug ? <Image src={flavorImages[slug]} alt="" fill sizes="(max-width:760px) 19vw, 110px" quality={75}/> : <Plus size={22} aria-hidden="true"/>}
                          </button>
                        );
                      })}
                    </div>
                    <div className="store-box-front"><span>MADE IN LIMA · MADE TO SHARE</span><strong>{count}/{pack.units}</strong></div>
                  </div>
                </div>
                <div className="walk-mix-section">
                  <div><strong>{t.addFast}</strong><span>{remaining===0?t.full:remaining+" "+t.openSpaces}</span></div>
                  <div className="walk-mix-tray">
                    {flavors.map((f)=>(
                      <button key={f.slug} type="button" disabled={!canAdd(f.slug)} onClick={(event)=>add(f.slug,event)}
                        aria-label={t.add+": "+label(f.slug)}>
                        <Image src={flavorImages[f.slug]} alt="" width={80} height={80} sizes="60px" quality={75} loading="lazy"/>
                        <span>{label(f.slug)}</span><Plus size={13}/>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <aside className="walk-cart store-cart" aria-label={t.box}>
                <span className="walk-eyebrow">{t.boxProgress}</span><h3>{packCopy[locale][packSlug].name}</h3>
                <div className="store-cart-meter" role="progressbar" aria-label={t.box} aria-valuemin={0}
                  aria-valuemax={pack.units} aria-valuenow={count}><span style={{width:(count/pack.units*100)+"%"}}/></div>
                <p className="store-cart-count" aria-live="polite">{count}/{pack.units} · {remaining===0?t.full:remaining+" "+t.slotsLeft}</p>
                <div className="store-cart-lines">
                  {!slots.length ? <p className="store-empty-message">{t.noItems}</p> :
                    flavors.filter((f)=>slots.includes(f.slug)).map((f)=>{
                      const amount = pack.packType==="single" ? pack.units : quantities[f.slug]??0;
                      return (
                        <div className="store-cart-line" key={f.slug}>
                          <Image src={flavorImages[f.slug]} alt="" width={44} height={44} quality={75}/>
                          <strong>{label(f.slug)}</strong>
                          <div className="store-item-controls">
                            <button type="button" onClick={()=>updateFlavor(f.slug,-1)} aria-label={t.edit+" - "+label(f.slug)}><Minus size={14}/></button>
                            <b>{amount}</b>
                            <button type="button" disabled={!canAdd(f.slug)} onClick={(event)=>add(f.slug,event)} aria-label={t.add+" - "+label(f.slug)}><Plus size={14}/></button>
                          </div>
                        </div>
                      );
                    })}
                </div>
                <div className="store-cart-total"><span>{t.total}</span><strong>S/{pack.amount}</strong></div>
                <button type="button" className="walk-primary store-checkout" onClick={()=>move("cashier")}
                  disabled={!filled}>{t.nextCashier}<ArrowRight size={19}/></button>
                {!filled?<p className="store-cart-help">{remaining+" "+t.openSpaces}</p>:null}
              </aside>
            </div>
          </section>

          <section className={"walk-frame walk-cashier" + (scene==="cashier"?" is-active":"")}
            aria-hidden={scene!=="cashier"} id="caja">
            <div className="walk-register-room" aria-hidden="true">
              <div className="walk-register-wall">BAGELITO</div><div className="walk-register-metal"/>
            </div>
            <div className="walk-cashier-stage">
              <div className="walk-cashier-copy">
                <span className="walk-eyebrow">{t.checkoutEyebrow}</span>
                <h2 tabIndex={-1}>{t.checkoutTitle}</h2><p>{t.checkoutBody}</p>
                <div className="walk-checkout-machine" aria-hidden="true">
                  <div className="walk-terminal"><div className="walk-terminal-screen"><ShoppingBag size={32}/><strong>BAGELITO</strong><span>S/{total}</span></div><div className="walk-terminal-foot"/></div>
                  <div className="walk-paper-strip"><span>GOOD BAGELS</span><b>GOOD DAYS</b><span>♥ ♥ ♥</span></div>
                </div>
              </div>
              <aside className="walk-receipt" aria-label={t.receipt}>
                <span className="walk-receipt-head">BAGELITO <span>·</span> LIMA</span>
                <span className="walk-receipt-kicker">{t.receipt}</span>
                <div className="walk-receipt-row"><span>{t.package} · {packCopy[locale][packSlug].name}</span><strong>S/{pack.amount}</strong></div>
                <div className="walk-receipt-flavors">{slots.length ?
                  flavors.filter((f)=>slots.includes(f.slug)).map((f)=>(
                    <div key={f.slug}><span>{(pack.packType==="single"?pack.units:quantities[f.slug]??0)+" × "+label(f.slug)}</span></div>
                  )):<span>{t.noItems}</span>}</div>
                <label htmlFor="walk-district">{t.district}</label>
                <select id="walk-district" value={district} onChange={(event)=>setDistrict(event.target.value)}>
                  {Object.keys(districtDeliveryDistancesKm).map((d)=><option key={d} value={d}>{d==="Other"?locale==="es"?"Otro distrito":"Other district":d}</option>)}
                </select>
                <div className="walk-receipt-row"><span>{t.delivery}</span><strong>S/{deliveryFee}</strong></div>
                <div className="walk-receipt-total"><span>{t.payable}</span><strong>S/{total}</strong></div>
                <p>{t.finalDetail}</p>
                <button type="button" className="walk-primary walk-final-pay" disabled={!filled} onClick={checkout}>
                  {filled ? (reviewOnly ? t.demo : t.continue) : t.first}<ArrowRight size={19}/>
                </button>
                <button type="button" className="walk-quiet" onClick={()=>move("build")}><ArrowLeft size={17}/>{t.edit}</button>
                <Link href="/legal" className="walk-legal">{t.legal}</Link>
                {reviewOnly?<p className="walk-checkout-notice">{t.preview}</p>:null}
              </aside>
            </div>
          </section>
        </div>

        <div className="walk-bottom-bar">
          <span>{scenes.indexOf(scene)+1} / 4 <i /> {t.sections[scenes.indexOf(scene)]}</span>
          <div>
            {scene!=="entry"?<button type="button" className="walk-bottom-back" onClick={()=>move(scenes[scenes.indexOf(scene)-1])}><ArrowLeft size={17}/>{t.back}</button>:null}
            {scene!=="cashier"?<button type="button" className="walk-bottom-next" onClick={()=>move(scenes[scenes.indexOf(scene)+1])}>
              {scene==="entry"?t.enter:scene==="counter"?t.viewBox:t.nextCashier}<ArrowRight size={18}/>
            </button>:<button type="button" className="walk-bottom-next" onClick={checkout}>{filled?t.continue:t.edit}<ArrowRight size={18}/></button>}
          </div>
        </div>
        <FirstStageProgress
          step={firstStageStep}
          onEntry={() => move("entry")}
          onCategory={() => {
            if (firstStageStep === "pack-size" && window.history.state?.bagelitoFirstStage) window.history.back();
            else move("counter");
          }}
        />
      </div>
      <div className="walk-epilogue"><div><span>GOOD BAGELS, GOOD DAYS.</span><h2>{t.finalBand}</h2><p>{t.finalLine}</p></div>
        <button type="button" onClick={()=>move("counter")}>{t.counterTitle}<ArrowRight size={18}/></button>
      </div>
      <div className="walk-announcement" role="status" aria-live="polite">{announcement}</div>
      {flying?<div className="walk-flying-bagel" key={flying.key} onAnimationEnd={()=>setFlying(null)}
        style={{left:flying.x,top:flying.y,"--fly-dx":flying.dx+"px","--fly-dy":flying.dy+"px"} as CSSProperties}>
        <Image src={flavorImages[flying.slug]} alt="" width={76} height={76} quality={75}/>
      </div>:null}
      {detailedFlavor?<div className="walk-detail-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)setDetail(null)}}>
        <div className="walk-detail-dialog" role="dialog" aria-modal="true" aria-label={label(detailedFlavor.slug)}>
          <button type="button" className="walk-close-detail" aria-label={t.focusClose} ref={closeRef} onClick={()=>setDetail(null)}><X size={22}/></button>
          <div className="walk-detail-photo"><Image src={flavorImages[detailedFlavor.slug]} alt={label(detailedFlavor.slug)}
            width={490} height={490} sizes="(max-width:760px) 85vw, 440px" quality={75}/></div>
          <div className="walk-detail-copy"><span className="walk-eyebrow">{t.photo}</span>
            <h2>{label(detailedFlavor.slug)}</h2><p>{descriptions[locale][detailedFlavor.slug as keyof typeof descriptions.es]}</p>
            <span className="walk-detail-price">{t.from}</span>
            <button type="button" className="walk-primary" disabled={!canAdd(detailedFlavor.slug)}
              onClick={(event)=>{add(detailedFlavor.slug,event);setDetail(null);}}>{pack.packType==="single"?t.choose:t.add}<Plus size={19}/></button>
            <button type="button" className="walk-quiet" onClick={()=>{setDetail(null);move("build")}}>{t.viewBox}<ArrowRight size={16}/></button>
          </div>
        </div>
      </div>:null}

    </div>
  );
}
