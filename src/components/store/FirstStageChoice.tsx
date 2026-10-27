"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, PackageOpen } from "lucide-react";
import type { FirstStageStep, PackFamily } from "@/lib/storefront-first-stage";

type Props = {
  step: Exclude<FirstStageStep, "entry">;
  selectedFamily: PackFamily | null;
  onPacks: () => void;
  onBack: () => void;
  onFamily: (family: PackFamily) => void;
};

export function FirstStageChoice({ step, selectedFamily, onPacks, onBack, onFamily }: Props) {
  return (
    <div className="first-stage-shell" data-step={step}>
      <div className="first-stage-counter-visual" aria-hidden="true">
        <div className="first-stage-glass first-stage-bagel-case">
          {[
            ["everything", "/images/bagel-everything.webp"],
            ["sesame", "/images/bagel-sesame.webp"],
            ["plain", "/images/bagel-plain.webp"],
            ["onion", "/images/bagel-classic-onion.webp"],
            ["jalapeño", "/images/bagel-jalapeno-cheddar.webp"],
            ["blueberry", "/images/bagel-blueberry.webp"],
          ].map(([name, src]) => (
            <span className="first-stage-food-bin" key={name}>
              <Image src={src} alt="" width={150} height={150} sizes="110px" quality={70} />
              <small>{name}</small>
            </span>
          ))}
        </div>
        <div className="first-stage-glass first-stage-schmear-case">
          {["Original", "Ají Amarillo", "Herb & Garlic", "Honey Cinnamon", "Strawberry"].map((name, index) => (
            <span className={"first-stage-schmear-well schmear-" + index} key={name}><i /><small>{name}</small></span>
          ))}
        </div>
      </div>

      {step === "category" ? (
        <section className="first-stage-card first-stage-category-card" aria-labelledby="first-stage-heading">
          <span className="first-stage-kicker">EN LA VITRINA</span>
          <h2 id="first-stage-heading" tabIndex={-1}>¿Qué te provoca hoy?</h2>
          <div className="first-stage-category-grid">
            <button type="button" className="first-stage-category-option is-live" data-category="packs" onClick={onPacks}>
              <span className="first-stage-category-image"><Image src="/images/pack-6-mixed.webp" alt="" width={230} height={160} sizes="180px" quality={75} /></span>
              <strong>Packs</strong><small>6 o 12 grandes · minis disponibles</small><ArrowRight size={19} />
            </button>
            <button type="button" className="first-stage-category-option" data-category="combos" disabled>
              <span className="first-stage-combo-visual"><Image src="/images/bagel-everything.webp" alt="" width={105} height={105} quality={72} /><i /></span>
              <strong>Combos</strong><small>2 bagels + 1 schmear</small><em>Próxima etapa</em>
            </button>
            <button type="button" className="first-stage-category-option" data-category="schmears" disabled>
              <span className="first-stage-schmear-bowl" aria-hidden="true"><i /></span>
              <strong>Schmears</strong><small>Tarrinas individuales</small><em>Próxima etapa</em>
            </button>
          </div>
        </section>
      ) : (
        <section className="first-stage-card first-stage-size-card" aria-labelledby="pack-size-heading">
          <button type="button" className="first-stage-back" onClick={onBack}><ArrowLeft size={17} /> Categorías</button>
          <span className="first-stage-kicker">PACKS</span>
          <h2 id="pack-size-heading" tabIndex={-1}>¿Grandes o Minis?</h2>
          <p>Primero elige el formato. Después configuraremos cantidad y sabores.</p>
          <div className="first-stage-size-grid">
            <button type="button" aria-pressed={selectedFamily === "large"} className={"first-stage-size-option" + (selectedFamily === "large" ? " selected" : "")} onClick={() => onFamily("large")}>
              <span className="first-stage-size-visual large"><Image src="/images/pack-6-mixed.webp" alt="" width={260} height={180} sizes="210px" quality={75} /></span>
              <strong>Bagels grandes</strong><small>6 o 12 bagels</small><ArrowRight size={19} />
            </button>
            <button type="button" aria-pressed={selectedFamily === "mini"} className={"first-stage-size-option" + (selectedFamily === "mini" ? " selected" : "")} onClick={() => onFamily("mini")}>
              <span className="first-stage-mini-visual" aria-hidden="true">
                <Image src="/images/bagel-everything.webp" alt="" width={80} height={80} quality={70} />
                <Image src="/images/bagel-sesame.webp" alt="" width={80} height={80} quality={70} />
                <Image src="/images/bagel-plain.webp" alt="" width={80} height={80} quality={70} />
              </span>
              <strong>Mini bagels</strong><small>6, 12 o 24 mini bagels</small><ArrowRight size={19} />
            </button>
          </div>
          {selectedFamily ? (
            <div className="first-stage-selection-confirmation" role="status">
              <PackageOpen size={18} />
              <span>Elegiste <strong>{selectedFamily === "large" ? "Bagels grandes" : "Mini bagels"}</strong>. La configuración de cantidad y sabores es el siguiente paso.</span>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
