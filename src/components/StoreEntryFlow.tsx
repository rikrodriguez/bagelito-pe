"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  CreditCard,
  FileText,
  PackageOpen,
  ShoppingBag,
  Store,
  Tag,
} from "lucide-react";
import {
  categoryOptions,
  nextEntryState,
  packSizeOptions,
  type EntryFlowAction,
  type EntryFlowState,
} from "@/lib/store-entry-flow";

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

  function transition(action: EntryFlowAction) {
    const target = nextEntryState(state, action);
    if (state === "entry" && action === "enter") {
      setEntering(true);
      timer.current = window.setTimeout(() => {
        setEntering(false);
        setState(target);
        setNotice("");
      }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 720);
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
        src="/images/store-entry-door.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="entry-flow-photo entry-flow-photo-entry"
      />
      <Image
        src="/images/store-category-flow.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="entry-flow-photo entry-flow-photo-counter"
      />
      <div className="entry-flow-shade" aria-hidden="true" />

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

      <section className="entry-flow-entry" aria-hidden={state !== "entry"}>
        <div className="entry-flow-glass" aria-hidden="true">
          <div className="entry-flow-door entry-flow-door-left"><span /></div>
          <div className="entry-flow-door entry-flow-door-right"><span /></div>
        </div>
        <div className="entry-flow-entry-copy">
          <Image
            src="/images/bagelito-logo.svg"
            alt="Bagelito Classic Gringo Bagels"
            width={671}
            height={178}
            className="entry-flow-logo"
            priority
          />
          <p>Entra, acércate a la vitrina y elige con los ojos.</p>
          <button type="button" className="entry-flow-primary" disabled={entering} onClick={() => transition("enter")}>
            {entering ? "Entrando…" : "Entrar a Bagelito"}
            <ArrowRight size={20} aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="entry-flow-decision" aria-hidden={state === "entry"}>
        <div className="entry-flow-panel">
          {state === "categories" ? (
            <>
              <span className="entry-flow-kicker">EN LA VITRINA</span>
              <h1>¿Qué te provoca hoy?</h1>
              <p className="entry-flow-intro">Elige por dónde empezar. La tienda se queda contigo durante todo el pedido.</p>
              <div className="entry-flow-category-grid" aria-label="Opciones de compra: Packs, Combos, Schmears">
                {categoryOptions.map((item) => (
                  <button
                    type="button"
                    className={"entry-flow-choice entry-flow-choice-" + item.id}
                    key={item.id}
                    onClick={() => chooseCategory(item.id)}
                  >
                    <span className="entry-flow-choice-art" aria-hidden="true">
                      {item.id === "packs" ? <Box size={42} /> : item.id === "combos" ? <PackageOpen size={42} /> : <span className="entry-flow-schmear-scoop">●</span>}
                    </span>
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                    {item.id === "combos" ? <em>Bagels + schmears</em> : null}
                    <span className="entry-flow-choice-arrow"><ArrowRight size={18} /></span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button type="button" className="entry-flow-back" onClick={goBack}>
                <ArrowLeft size={17} aria-hidden="true" /> Volver
              </button>
              <span className="entry-flow-kicker">PACKS</span>
              <h1>¿Grandes o Minis?</h1>
              <p className="entry-flow-intro">Primero elige el tamaño. Los sabores vienen en el siguiente paso.</p>
              <div className="entry-flow-size-grid">
                {packSizeOptions.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    aria-pressed={selectedSize === item.id}
                    className={"entry-flow-size-card" + (selectedSize === item.id ? " is-selected" : "")}
                    onClick={() => choosePackSize(item.id)}
                  >
                    <span className={"entry-flow-size-bagels " + item.id} aria-hidden="true">
                      <i /><i /><i /><i /><i />
                    </span>
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                    <span className="entry-flow-choice-arrow"><ArrowRight size={18} /></span>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="entry-flow-notice" role="status" aria-live="polite">{notice}</div>
        </div>
      </section>

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
