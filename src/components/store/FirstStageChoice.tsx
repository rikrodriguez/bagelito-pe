"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, Check, PackageOpen } from "lucide-react";
import {
  configsForFamily,
  type FirstStageStep,
  type PackConfigId,
  type PackFamily,
} from "@/lib/storefront-first-stage";

type Props = {
  step: Exclude<FirstStageStep, "entry">;
  selectedFamily: PackFamily | null;
  selectedConfig: PackConfigId | null;
  onPacks: () => void;
  onBack: () => void;
  onFamily: (family: PackFamily) => void;
  onConfig: (config: PackConfigId) => void;
};

export function FirstStageChoice({
  step,
  selectedFamily,
  selectedConfig,
  onPacks,
  onBack,
  onFamily,
  onConfig,
}: Props) {
  const packConfigs = selectedFamily ? configsForFamily(selectedFamily) : [];

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
            <span className={"first-stage-schmear-well schmear-" + index} key={name}>
              <i /><small>{name}</small>
            </span>
          ))}
        </div>
      </div>

      {step === "category" ? (
        <section className="first-stage-card first-stage-category-card" aria-labelledby="first-stage-heading">
          <span className="first-stage-kicker">EN LA VITRINA</span>
          <h2 id="first-stage-heading" tabIndex={-1}>¿Qué te provoca hoy?</h2>
          <div className="first-stage-category-grid">
            <button type="button" className="first-stage-category-option is-live" data-category="packs" onClick={onPacks}>
              <span className="first-stage-category-image">
                <Image src="/images/pack-6-mixed.webp" alt="" width={230} height={160} sizes="180px" quality={75} />
              </span>
              <strong>Packs</strong>
              <small>Grandes o minis</small>
              <ArrowRight size={19} />
            </button>

            <button type="button" className="first-stage-category-option" data-category="combos" aria-disabled="true">
              <span className="first-stage-combo-visual">
                <Image src="/images/bagel-everything.webp" alt="" width={105} height={105} quality={72} /><i />
              </span>
              <strong>Combos</strong>
              <small>Bagels + schmears</small>
              <em>Próxima etapa</em>
            </button>

            <button type="button" className="first-stage-category-option" data-category="schmears" aria-disabled="true">
              <span className="first-stage-schmear-bowl" aria-hidden="true"><i /></span>
              <strong>Schmears</strong>
              <small>Tarrinas individuales</small>
              <em>Próxima etapa</em>
            </button>
          </div>
        </section>
      ) : step === "pack-size" ? (
        <section className="first-stage-card first-stage-size-card" aria-labelledby="pack-size-heading">
          <button type="button" className="first-stage-back" onClick={onBack}><ArrowLeft size={17} /> Categorías</button>
          <span className="first-stage-kicker">PACKS</span>
          <h2 id="pack-size-heading" tabIndex={-1}>¿Grandes o Minis?</h2>
          <p>Elige el formato. Después seleccionas cantidad y si quieres mixtos o de un solo sabor.</p>

          <div className="first-stage-size-grid">
            <button
              type="button"
              aria-pressed={selectedFamily === "large"}
              className={"first-stage-size-option" + (selectedFamily === "large" ? " selected" : "")}
              onClick={() => onFamily("large")}
            >
              <span className="first-stage-size-visual large">
                <Image src="/images/pack-6-mixed.webp" alt="" width={260} height={180} sizes="210px" quality={75} />
              </span>
              <strong>Bagels grandes</strong>
              <small>6 o 12 bagels</small>
              <ArrowRight size={19} />
            </button>

            <button
              type="button"
              aria-pressed={selectedFamily === "mini"}
              className={"first-stage-size-option" + (selectedFamily === "mini" ? " selected" : "")}
              onClick={() => onFamily("mini")}
            >
              <span className="first-stage-mini-visual" aria-hidden="true">
                <Image src="/images/bagel-everything.webp" alt="" width={80} height={80} quality={70} />
                <Image src="/images/bagel-sesame.webp" alt="" width={80} height={80} quality={70} />
                <Image src="/images/bagel-plain.webp" alt="" width={80} height={80} quality={70} />
              </span>
              <strong>Mini bagels</strong>
              <small>6, 12 o 24 minis</small>
              <ArrowRight size={19} />
            </button>
          </div>
        </section>
      ) : (
        <section className="first-stage-card first-stage-config-card" aria-labelledby="pack-config-heading">
          <button type="button" className="first-stage-back" onClick={onBack}><ArrowLeft size={17} /> Grandes / Minis</button>
          <span className="first-stage-kicker">PACKS · {selectedFamily === "mini" ? "MINIS" : "GRANDES"}</span>
          <h2 id="pack-config-heading" tabIndex={-1}>
            {selectedFamily === "mini" ? "Elige tu pack de minis" : "Elige tu pack"}
          </h2>
          <p>Selecciona cantidad y formato. Los sabores se eligen en el siguiente paso.</p>

          <div className={"first-stage-config-grid " + (selectedFamily === "mini" ? "is-mini" : "is-large")}>
            {packConfigs.map((config) => {
              const selected = selectedConfig === config.id;
              return (
                <button
                  type="button"
                  key={config.id}
                  aria-pressed={selected}
                  className={"first-stage-config-option" + (selected ? " selected" : "")}
                  onClick={() => onConfig(config.id)}
                >
                  <span className="first-stage-config-units">{config.units}</span>
                  <span className="first-stage-config-bagels">{selectedFamily === "mini" ? "MINI BAGELS" : "BAGELS"}</span>
                  <strong>{config.mode === "mixed" ? "Mixtos" : "Un sabor"}</strong>
                  <b>S/{config.amount}</b>
                  <span className="first-stage-config-check">{selected ? <Check size={17} /> : <ArrowRight size={17} />}</span>
                </button>
              );
            })}
          </div>

          {selectedConfig ? (
            <div className="first-stage-selection-confirmation" role="status">
              <PackageOpen size={18} />
              <span>
                Pack seleccionado. <strong>Siguiente paso: elegir los sabores.</strong>
              </span>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
