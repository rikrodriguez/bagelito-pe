"use client";

import Image from "next/image";
import { useEffect, useReducer, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, DoorOpen, Info, Layers, Package, RotateCcw, Soup, X } from "lucide-react";
import { initialVisit, readVisitDraft, readVisitHash, visitReducer, VISIT_CATEGORIES, VISIT_STORAGE_KEY, type VisitCategory } from "@/lib/photo-visit";
import { useLanguage } from "@/components/LanguageProvider";
import { PackVisitBuilder } from "@/components/visit/PackVisitBuilder";

const copy = {
  es: {
    enter: "Entra a Bagelito", near: "Acércate a la vitrina", moving: "Entrando a Bagelito…",
    quick: "Elegir rápido", back: "Volver a la entrada", intro: "Pasa. El antojo está adentro.",
    choose: "¿Qué te provoca hoy?", hint: "Elige cómo quieres armar tu pedido.",
    families: { packs: "Packs", combos: "Combos", schmears: "Schmears" },
    desc: { packs: "Tu caja de bagels", combos: "Bagels + schmears", schmears: "Tus favoritos para untar" },
    selected: "Elegiste", change: "Cambiar categoría", stop: "Primero validamos esta visita. La configuración de sabores viene en la siguiente etapa.",
    steps: ["Entrada", "Vitrina", "Elige"], future: "Luego: configura tu pedido", info: "Acerca de esta preview", close: "Cerrar información",
    scope: "Etapa 1 · Entrada y elección", disclosure: "Visualización conceptual. No es una fotografía de un local real. Esta preview no crea pedidos ni efectúa cobros.",
    more: "Paredes blancas de cuadritos, acero, bagels protegidos por vidrio y schmears tipo heladería. Se conserva el sistema de compra existente sin activarlo aquí.",
    error: "No se pudo cargar la escena.", retry: "Reintentar", loading: "Abriendo Bagelito…", reset: "Repetir la visita", moveHint: "Una tienda. Elige a tu manera.",
    image: "Visualización de la tienda Bagelito, con azulejos blancos, vitrinas de bagels y schmears tipo heladería.",
  },
  en: {
    enter: "Step into Bagelito", near: "Come to the counter", moving: "Entering Bagelito…",
    quick: "Choose quickly", back: "Back to the entrance", intro: "Come in. Something good is inside.",
    choose: "What are you craving?", hint: "Choose how to build your order.",
    families: { packs: "Packs", combos: "Combos", schmears: "Schmears" },
    desc: { packs: "Your box of bagels", combos: "Bagels + schmears", schmears: "Your favorite spreads" },
    selected: "You chose", change: "Change category", stop: "First, we are validating this visit. Flavor configuration comes in the next stage.",
    steps: ["Entrance", "Counter", "Choose"], future: "Next: configure your order", info: "About this preview", close: "Close information",
    scope: "Stage 1 · Entrance and choice", disclosure: "Concept visualization, not a photograph of an existing store. This preview creates no orders or charges.",
    more: "Small white tiles, steel, bagels behind glass, and gelato-style schmear wells. The existing purchase system remains unchanged and is not enabled here.",
    error: "The scene could not load.", retry: "Try again", loading: "Opening Bagelito…", reset: "Replay the visit", moveHint: "One store. Your choice.",
    image: "Bagelito concept store with white tiles, enclosed bagel displays, and gelato-style schmear wells.",
  },
} as const;
const icons = { packs: Package, combos: Layers, schmears: Soup };

export function PhotoVisit() {
  const { locale, setLocale } = useLanguage();
  const t = copy[locale];
  const [state, dispatch] = useReducer(visitReducer, initialVisit);
  const [hydrated, setHydrated] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showPacks, setShowPacks] = useState(false);
  const [imageKey, setImageKey] = useState(0);
  const [reduced, setReduced] = useState(false);
  const cameraRef = useRef<HTMLDivElement>(null);
  const chooseHeading = useRef<HTMLHeadingElement>(null);
  const infoClose = useRef<HTMLButtonElement>(null);
  const infoReturn = useRef<HTMLButtonElement>(null);
  const isEntry = state.phase === "entrada";
  const isMoving = state.phase === "acercando";
  const atCounter = state.phase === "elige";
  const currentStep = isEntry ? 0 : isMoving ? 1 : 2;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const changeMotion = () => setReduced(media.matches);
    media.addEventListener("change", changeMotion);
    const fromHash = readVisitHash(window.location.hash);
    let saved = null;
    try { saved = readVisitDraft(window.sessionStorage.getItem(VISIT_STORAGE_KEY)); } catch { /* Optional storage. */ }
    if (fromHash || saved) dispatch({ type: "RESTORE", state: fromHash || saved! });
    setHydrated(true);
    const onHistory = () => dispatch({ type: "RESTORE", state: readVisitHash(window.location.hash) || initialVisit });
    window.addEventListener("popstate", onHistory);
    window.addEventListener("hashchange", onHistory);
    return () => {
      media.removeEventListener("change", changeMotion);
      window.removeEventListener("popstate", onHistory);
      window.removeEventListener("hashchange", onHistory);
    };
  }, []);

  useEffect(() => {
    if (!hydrated || isMoving) return;
    try { window.sessionStorage.setItem(VISIT_STORAGE_KEY, JSON.stringify({ version: 1, ...state })); } catch { /* No identity or payment data. */ }
  }, [state, hydrated, isMoving]);

  useEffect(() => {
    if (!isMoving) return;
    const timer = window.setTimeout(() => {
      dispatch({ type: "ARRIVE" });
      if (window.location.hash !== "#vitrina") window.history.replaceState(null, "", "#vitrina");
    }, reduced ? 0 : 1700);
    return () => window.clearTimeout(timer);
  }, [isMoving, reduced]);

  useEffect(() => {
    if (atCounter && hydrated) chooseHeading.current?.focus({ preventScroll: true });
  }, [atCounter, hydrated]);

  useEffect(() => {
    if (!showInfo) return;
    infoClose.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowInfo(false);
      if (event.key === "Tab") { event.preventDefault(); infoClose.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); infoReturn.current?.focus(); };
  }, [showInfo]);

  function goEntrance() {
    setShowPacks(false);
    dispatch({ type: "RESET" });
    if (window.location.hash !== "#entrada") window.history.pushState(null, "", "#entrada");
  }
  function enter() {
    if (!loaded || imageError || isMoving) return;
    if (window.location.hash !== "#vitrina") window.history.pushState(null, "", "#vitrina");
    dispatch({ type: reduced ? "QUICK" : "ENTER" });
  }
  function quick() {
    dispatch({ type: "QUICK" });
    if (window.location.hash !== "#vitrina") window.history.pushState(null, "", "#vitrina");
  }
  function choose(category: VisitCategory) {
    setShowPacks(false);
    dispatch({ type: "CHOOSE", category });
    if (window.location.hash !== "#" + category) window.history.pushState(null, "", "#" + category);
  }
  function clear() {
    setShowPacks(false);
    dispatch({ type: "CLEAR" });
    window.history.pushState(null, "", "#vitrina");
  }

  return (
    <main className="photo-visit" data-phase={state.phase} data-selected={state.category || "none"} data-loaded={loaded} data-reduced={reduced} data-building={showPacks}>
      <h1 className="pv-sr-only">Bagelito · {t.scope}</h1>
      <div className="pv-world" aria-hidden="true">
        <div className="pv-camera" ref={cameraRef}>
          <Image key={imageKey} className="pv-scene" src="/visit/scene.webp" alt="" fill sizes="100vw" priority unoptimized
            onLoad={() => { setLoaded(true); setImageError(false); }} onError={() => setImageError(true)} />
          <div className="pv-photo-light" />
        </div>
        <div className="pv-doorway">
          <div className="pv-glass pv-glass-left"><span className="pv-handle" /></div>
          <div className="pv-glass pv-glass-right"><span className="pv-handle" /></div>
        </div>
        <div className="pv-shade" />
      </div>

      <div className="pv-toolbar" inert={showInfo}>
        <button className="pv-brand" type="button" aria-label={t.back} onClick={goEntrance}>
          <span className="pv-logo-window"><Image src="/visit/logo.jpg" alt="Bagelito" width={1080} height={1080} unoptimized /></span>
        </button>
        <div className="pv-toolbar-actions">
          {!isEntry && <button type="button" className="pv-round" onClick={goEntrance} aria-label={t.back}><ArrowLeft size={19} /></button>}
          <button type="button" className="pv-fast" onClick={quick}>{t.quick}<ChevronRight size={15} /></button>
          <button type="button" className="pv-locale" aria-label={locale === "es" ? "Switch to English" : "Cambiar a español"} onClick={() => setLocale(locale === "es" ? "en" : "es")}>{locale === "es" ? "EN" : "ES"}</button>
        </div>
      </div>

      <div className="pv-stage" inert={showInfo}>
        {isEntry && !imageError && <section className="pv-welcome" aria-label={t.intro}>
          <span className="pv-arrival-label">CLASSIC GRINGO BAGELS · LIMA</span>
          <button type="button" className="pv-enter" onClick={enter} disabled={!loaded}>
            <DoorOpen size={24} /><span>{loaded ? t.enter : t.loading}</span><ArrowRight size={21} />
          </button>
          <p>{t.intro}</p>
        </section>}
        {isMoving && <div className="pv-moving" role="status"><span className="pv-motion-dot"/>{t.near}</div>}
        {atCounter && !showPacks && <section className="pv-chooser" aria-labelledby="pv-question">
          <div className="pv-question-wrap"><span>02 / {locale === "es" ? "EN LA VITRINA" : "AT THE COUNTER"}</span><h2 id="pv-question" tabIndex={-1} ref={chooseHeading}>{t.choose}</h2></div>
          <div className="pv-families" role="group" aria-label={t.choose}>
            {VISIT_CATEGORIES.map((category) => {
              const Icon = icons[category];
              const selected = state.category === category;
              return <button type="button" className="pv-family" key={category} aria-pressed={selected} onClick={() => choose(category)}>
                <span className="pv-family-icon"><Icon size={27} strokeWidth={1.65} /></span>
                <span className="pv-family-copy"><strong>{t.families[category]}</strong><small>{t.desc[category]}</small></span>
                <span className="pv-family-check">{selected ? <Check size={18} /> : <ChevronRight size={18} />}</span>
              </button>;
            })}
          </div>
          <div className="pv-selection" aria-live="polite">
            {state.category ? <><strong><Check size={16} /> {t.selected} {t.families[state.category]}</strong><span>{state.category==="packs"?(locale==="es"?"Elige el tamaño y los bagels de tu caja.":"Choose the size and bagels for your box."):t.stop}</span>{state.category==="packs"&&<button className="pv-start-packs" type="button" onClick={()=>setShowPacks(true)}>{locale==="es"?"Armar mi pack":"Build my box"}<ArrowRight size={15}/></button>}<button type="button" onClick={clear}>{t.change}</button></> : <p>{t.hint}</p>}
          </div>
        </section>}
        {atCounter && showPacks && state.category==="packs" && <PackVisitBuilder locale={locale} onBack={()=>setShowPacks(false)}/>}
        {imageError && <div className="pv-error" role="alert"><p>{t.error}</p><button type="button" onClick={() => {setImageError(false);setLoaded(false);setImageKey((key) => key + 1);}}><RotateCcw size={17}/>{t.retry}</button></div>}
      </div>

      <nav className="pv-progress" aria-label={locale === "es" ? "Progreso de la visita" : "Visit progress"} inert={showInfo}>
        {t.steps.map((step, index) => <button type="button" key={step} aria-current={currentStep === index ? "step" : undefined}
          data-done={index < currentStep} disabled={index === 1 || (index === 2 && !atCounter)}
          onClick={() => index === 0 ? goEntrance() : quick()}>
          <span>{index < currentStep ? <Check size={13}/> : String(index + 1).padStart(2,"0")}</span><strong>{step}</strong>
        </button>)}
        <i aria-hidden="true" /><span className="pv-upcoming">{t.future}</span>
      </nav>
      <div className="pv-footnote" inert={showInfo}>
        <button type="button" ref={infoReturn} onClick={() => setShowInfo(true)}><Info size={13}/>{t.scope}</button>
        <span>{locale === "es" ? "Concepto digital · Sin pedidos ni cobros" : "Digital concept · No orders or charges"}</span>
      </div>
      {showInfo && <div className="pv-info-backdrop" onClick={(event) => { if(event.target === event.currentTarget) setShowInfo(false); }}>
        <section className="pv-info-dialog" role="dialog" aria-modal="true" aria-label={t.info}>
          <button type="button" className="pv-info-close" aria-label={t.close} ref={infoClose} onClick={() => setShowInfo(false)}><X size={21}/></button>
          <span>PREVIEW / 01</span><h2>{t.scope}</h2><p>{t.disclosure}</p><p>{t.more}</p>
        </section>
      </div>}
      <span className="pv-sr-only" role="status" aria-live="polite">{isMoving ? t.moving : atCounter ? t.choose : t.intro}</span>
    </main>
  );
}
