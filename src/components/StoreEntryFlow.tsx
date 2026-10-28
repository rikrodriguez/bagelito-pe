"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CreditCard, FileText, PackageOpen, ShoppingBag, Store, Tag } from "lucide-react";
import { nextEntryState, type EntryFlowAction, type EntryFlowState } from "@/lib/store-entry-flow";

const progress = ["Entrada", "Categoría", "Selecciona", "Revisa", "Pago"] as const;
const progressIcons = [Store, Tag, PackageOpen, FileText, CreditCard] as const;

export function StoreEntryFlow() {
  const [state, setState] = useState<EntryFlowState>("entry");
  const [entering, setEntering] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedSize, setSelectedSize] = useState<"large" | "mini" | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const stepIndex = state === "entry" ? 0 : state === "categories" ? 1 : 2;
  const sceneImage = state === "entry" ? "/images/store-entry-door.webp" : "/images/store-category-flow.webp";

  function transition(action: EntryFlowAction) {
    const target = nextEntryState(state, action);
    if (state === "entry" && action === "enter") {
      setEntering(true);
      timer.current = window.setTimeout(() => {
        setEntering(false);
        setState(target);
        setNotice("");
      }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 620);
      return;
    }
    setState(target);
    setNotice("");
    setSelectedSize(null);
  }

  function chooseCategory(id: "packs" | "combos" | "schmears") {
    if (id === "packs") {
      transition("packs");
      return;
    }
    setNotice(
      id === "combos"
        ? "Combos: bagels + schmears. Lo configuramos en el siguiente bloque."
        : "Schmears: tarrinas individuales. Lo configuramos en el siguiente bloque.",
    );
  }

  function choosePackSize(id: "large" | "mini") {
    setSelectedSize(id);
    setNotice(
      id === "large"
        ? "Grandes seleccionado · siguiente: configurar 6 o 12 bagels."
        : "Minis seleccionado · siguiente: configurar 6, 12 o 24 mini bagels.",
    );
  }

  function goBack() {
    transition("back");
  }

  return (
    <main className="entry-flow" data-state={state} data-entering={entering}>
      <Image
        src={sceneImage}
        alt=""
        fill
        priority
        sizes="100vw"
        className="entry-flow-photo"
      />
      <div className="entry-flow-vignette" aria-hidden="true" />

      <div className="entry-flow-topbar">
        <button type="button" className="entry-flow-round-button" aria-label="Menú">
          <span aria-hidden="true">☰</span>
        </button>
        <div className="entry-flow-review">Preview · No se registran pedidos ni cobros</div>
        <button type="button" className="entry-flow-cart" aria-label="Tu pedido, 0 productos">
          <ShoppingBag size={19} aria-hidden="true" />
          <span>Tu pedido (0)</span>
        </button>
      </div>

      {state === "entry" ? (
        <section className="entry-flow-entry" aria-label="Entrada a Bagelito">
          <button
            type="button"
            className="entry-flow-entry-hotspot"
            disabled={entering}
            onClick={() => transition("enter")}
            aria-label="Entrar a Bagelito"
          >
            <span>{entering ? "Entrando…" : "Entrar"}</span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </section>
      ) : null}

      {state === "categories" ? (
        <section className="entry-flow-category-hotspots" aria-label="¿Qué te provoca hoy? Packs, Combos o Schmears">
          <button type="button" className="entry-flow-category-hotspot packs" onClick={() => chooseCategory("packs")}>
            <span className="entry-flow-hotspot-label">Packs</span>
          </button>
          <button type="button" className="entry-flow-category-hotspot combos" onClick={() => chooseCategory("combos")}>
            <span className="entry-flow-hotspot-label">Combos · Bagels + schmears</span>
          </button>
          <button type="button" className="entry-flow-category-hotspot schmears" onClick={() => chooseCategory("schmears")}>
            <span className="entry-flow-hotspot-label">Schmears · Tarrinas individuales</span>
          </button>
        </section>
      ) : null}

      {state === "pack-size" ? (
        <section className="entry-flow-pack-selector" aria-label="Packs: ¿Grandes o Minis?">
          <button type="button" className="entry-flow-back" onClick={goBack}>
            <ArrowLeft size={17} aria-hidden="true" /> Volver
          </button>
          <div className="entry-flow-pack-heading">
            <span>PACKS</span>
            <strong>¿Grandes o Minis?</strong>
          </div>
          <div className="entry-flow-pack-hotspots">
            <button
              type="button"
              className={"entry-flow-pack-option" + (selectedSize === "large" ? " is-selected" : "")}
              aria-pressed={selectedSize === "large"}
              onClick={() => choosePackSize("large")}
            >
              <span className="entry-flow-pack-art large">
                <Image src="/images/pack-6-mixed.webp" alt="" width={180} height={120} sizes="160px" />
              </span>
              <span className="entry-flow-pack-copy">
                <strong>Grandes</strong>
                <small>6 o 12 bagels</small>
              </span>
              <span className="entry-flow-pack-arrow"><ArrowRight size={19} /></span>
            </button>
            <button
              type="button"
              className={"entry-flow-pack-option" + (selectedSize === "mini" ? " is-selected" : "")}
              aria-pressed={selectedSize === "mini"}
              onClick={() => choosePackSize("mini")}
            >
              <span className="entry-flow-pack-art mini" aria-hidden="true">
                <Image src="/images/bagel-everything.webp" alt="" width={70} height={70} />
                <Image src="/images/bagel-sesame.webp" alt="" width={70} height={70} />
                <Image src="/images/bagel-blueberry.webp" alt="" width={70} height={70} />
              </span>
              <span className="entry-flow-pack-copy">
                <strong>Minis</strong>
                <small>6, 12 o 24 mini bagels</small>
              </span>
              <span className="entry-flow-pack-arrow"><ArrowRight size={19} /></span>
            </button>
          </div>
        </section>
      ) : null}

      {notice ? <div className="entry-flow-notice" role="status" aria-live="polite">{notice}</div> : null}

      <nav className="entry-flow-progress" aria-label="Progreso del pedido">
        {progress.map((label, index) => {
          const Icon = progressIcons[index];
          const active = index === stepIndex;
          const done = index < stepIndex;
          return (
            <div className={"entry-flow-progress-item" + (active ? " is-active" : "") + (done ? " is-done" : "")} key={label}>
              <span className="entry-flow-progress-icon"><Icon size={17} aria-hidden="true" /></span>
              <span>{label}</span>
            </div>
          );
        })}
      </nav>
    </main>
  );
}
