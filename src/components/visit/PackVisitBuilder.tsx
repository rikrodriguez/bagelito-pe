"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import menu from "@/data/verified-menu-reference.json";

type Family = "large" | "mini";
type ConfigId = string;

export function PackVisitBuilder({ locale, onBack }: { locale: "es" | "en"; onBack: () => void }) {
  const es = locale === "es";
  const [family, setFamily] = useState<Family | null>(null);
  const [selected, setSelected] = useState<ConfigId | null>(null);

  const regular = menu.packs.map((p) => ({
    id: "large-" + p.id,
    units: p.units,
    mode: p.flavorMode,
    amount: p.price,
  }));

  const minis = menu.miniPacks.flatMap((p) => [
    { id: "mini-" + p.units + "-mixed", units: p.units, mode: "mixed", amount: p.mixed },
    { id: "mini-" + p.units + "-single", units: p.units, mode: "single", amount: p.single },
  ]);

  const configs = family === "large" ? regular : family === "mini" ? minis : [];

  function goBack() {
    if (family) {
      setFamily(null);
      setSelected(null);
      return;
    }
    onBack();
  }

  return (
    <section className="pv-config pv-pack-first-flow" aria-label={es ? "Configurar pack" : "Configure pack"}>
      <header className="pv-config-heading">
        <button type="button" className="pv-config-back" aria-label={es ? "Regresar" : "Back"} onClick={goBack}>
          <ArrowLeft size={19} />
        </button>
        <div>
          <span>{es ? "PACKS / PASO A PASO" : "PACKS / STEP BY STEP"}</span>
          <h2>
            {!family
              ? (es ? "¿Grandes o Minis?" : "Regular or Minis?")
              : (es ? "Elige tu pack" : "Choose your pack")}
          </h2>
        </div>
      </header>

      {!family ? (
        <>
          <p className="pv-config-caption">
            {es ? "Primero elige el tamaño. No elegimos sabores todavía." : "Choose the size first. Flavors come next."}
          </p>
          <div className="pv-pack-family-grid" role="group" aria-label={es ? "Tamaño del bagel" : "Bagel size"}>
            <button type="button" className="pv-pack-family-card" onClick={() => setFamily("large")}>
              <span className="pv-pack-family-photo">
                <Image src="/images/pack-6-mixed.webp" alt="" width={280} height={190} quality={75} />
              </span>
              <span className="pv-pack-family-copy">
                <strong>{es ? "Bagels grandes" : "Regular bagels"}</strong>
                <small>{es ? "6 o 12 bagels" : "6 or 12 bagels"}</small>
              </span>
              <ArrowRight size={19} />
            </button>

            <button type="button" className="pv-pack-family-card" onClick={() => setFamily("mini")}>
              <span className="pv-pack-family-photo pv-pack-mini-photo" aria-hidden="true">
                <Image src="/images/bagel-everything.webp" alt="" width={88} height={88} quality={72} />
                <Image src="/images/bagel-sesame.webp" alt="" width={88} height={88} quality={72} />
                <Image src="/images/bagel-plain.webp" alt="" width={88} height={88} quality={72} />
              </span>
              <span className="pv-pack-family-copy">
                <strong>Mini bagels</strong>
                <small>{es ? "6, 12 o 24 minis" : "6, 12 or 24 minis"}</small>
              </span>
              <ArrowRight size={19} />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="pv-pack-family-summary">
            <span>{family === "large" ? (es ? "Bagels grandes" : "Regular bagels") : "Mini bagels"}</span>
            <button type="button" onClick={() => { setFamily(null); setSelected(null); }}>
              {es ? "Cambiar tamaño" : "Change size"}
            </button>
          </div>

          <div className={"pv-pack-config-grid " + (family === "mini" ? "is-mini" : "is-large")} role="group" aria-label={es ? "Opciones del pack" : "Pack options"}>
            {configs.map((config) => {
              const active = selected === config.id;
              return (
                <button
                  type="button"
                  key={config.id}
                  aria-pressed={active}
                  className={"pv-pack-config-card" + (active ? " selected" : "")}
                  onClick={() => setSelected(config.id)}
                >
                  <span className="pv-pack-config-count">{config.units}</span>
                  <span className="pv-pack-config-label">{family === "mini" ? "MINI BAGELS" : "BAGELS"}</span>
                  <strong>{config.mode === "mixed" ? (es ? "Mixtos" : "Mixed") : (es ? "Un sabor" : "Single flavor")}</strong>
                  <b>S/{config.amount}</b>
                  <span className="pv-pack-config-icon">{active ? <Check size={17} /> : <ArrowRight size={17} />}</span>
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="pv-pack-next-status" role="status">
              <Check size={17} />
              <span>{es ? "Listo. El siguiente paso será elegir los sabores." : "Done. Flavor selection is the next step."}</span>
            </div>
          ) : (
            <p className="pv-config-caption">
              {es ? "Elige cantidad y si quieres sabores mixtos o un solo sabor." : "Choose quantity and mixed or single flavor."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
