"use client";

import { useMemo, useState } from "react";
import {
  calculateCostScenario,
  cheddarSliceAssumption,
  costFlavorCatalog,
  defaultCostScenario,
  type CostScenarioState,
  packModes,
  type PackModeKey,
} from "@/lib/bagelito-costing";

type CostCalculatorProps = {
  initialScenario?: Partial<CostScenarioState>;
};

const moneyFormatter = new Intl.NumberFormat("es-PE", {
  currency: "PEN",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "currency",
});

const integerFormatter = new Intl.NumberFormat("es-PE");
const percentFormatter = new Intl.NumberFormat("es-PE", {
  maximumFractionDigits: 1,
  style: "percent",
});

function money(value: number) {
  return moneyFormatter.format(Number.isFinite(value) ? value : 0);
}

function integer(value: number) {
  return integerFormatter.format(Math.round(Number.isFinite(value) ? value : 0));
}

function percent(value: number) {
  return percentFormatter.format(Number.isFinite(value) ? value : 0);
}

function cleanNumber(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function mergeScenario(initialScenario?: Partial<CostScenarioState>): CostScenarioState {
  return {
    ...defaultCostScenario,
    ...initialScenario,
    fixedCosts: {
      ...defaultCostScenario.fixedCosts,
      ...initialScenario?.fixedCosts,
    },
    prices: {
      ...defaultCostScenario.prices,
      ...initialScenario?.prices,
    },
    quantities: {
      ...defaultCostScenario.quantities,
      ...initialScenario?.quantities,
    },
  };
}

export function CostCalculator({ initialScenario }: CostCalculatorProps) {
  const [scenario, setScenario] = useState<CostScenarioState>(() =>
    mergeScenario(initialScenario),
  );
  const [quickMode, setQuickMode] = useState<PackModeKey>("mixed6");
  const model = useMemo(() => calculateCostScenario(scenario), [scenario]);
  const cheddarWithMerma =
    cheddarSliceAssumption.pricePerSlice * (1 + scenario.mermaPct / 100);

  function setQuantity(mode: PackModeKey, value: string) {
    setScenario((current) => ({
      ...current,
      quantities: {
        ...current.quantities,
        [mode]: Math.round(cleanNumber(value)),
      },
    }));
  }

  function setPrice(mode: PackModeKey, value: string) {
    setScenario((current) => ({
      ...current,
      prices: {
        ...current.prices,
        [mode]: cleanNumber(value),
      },
    }));
  }

  function setFixedCost(field: keyof CostScenarioState["fixedCosts"], value: string) {
    setScenario((current) => ({
      ...current,
      fixedCosts: {
        ...current.fixedCosts,
        [field]: cleanNumber(value),
      },
    }));
  }

  function applyQuickVolume(volume: number) {
    setScenario((current) => ({
      ...current,
      quantities: {
        mixed6: 0,
        mixed12: 0,
        single6: 0,
        single12: 0,
        [quickMode]: volume,
      },
    }));
  }

  function clearScenario() {
    setScenario((current) => ({
      ...current,
      quantities: {
        mixed6: 0,
        mixed12: 0,
        single6: 0,
        single12: 0,
      },
    }));
  }

  function loadCurrentScenario() {
    setScenario(mergeScenario(initialScenario));
  }

  const fixedSpreadText = model.totals.totalBagels
    ? `${money(model.fixedTotal)} / ${integer(model.totals.totalBagels)} bagels = ${money(
        model.fixedPerBagel,
      )} por bagel. Escenario: ${integer(model.totals.totalPacks)} packs.`
    : `${money(model.fixedTotal)} de fijos todavia no se reparte porque el escenario tiene 0 bagels.`;

  return (
    <section className="admin-card cost-calculator-panel">
      <div className="admin-card-head">
        <div>
          <p className="kicker">Calculadora</p>
          <h2>Costos, ingresos y utilidad por pack</h2>
          <p>
            Simula desde 1 pack hasta volumen mayorista. Delivery queda fuera; los fijos se
            reparten solo contra los bagels del escenario activo.
          </p>
        </div>
        <span className="status-pill neutral">{integer(model.totals.totalPacks)} packs</span>
      </div>

      <div className="calculator-hero-grid">
        <div className="calculator-main-kpi">
          <span>Utilidad neta</span>
          <strong>{money(model.totals.netProfit)}</strong>
          <small>{percent(model.totals.netMarginPct)} margen neto despues de fijos</small>
        </div>
        <div>
          <span>Ingresos</span>
          <strong>{money(model.totals.revenue)}</strong>
          <small>{integer(model.totals.totalBagels)} bagels vendidos</small>
        </div>
        <div>
          <span>Costo variable</span>
          <strong>{money(model.totals.variableCost)}</strong>
          <small>{percent(model.totals.contributionMarginPct)} margen contribucion</small>
        </div>
        <div>
          <span>Fijos repartidos</span>
          <strong>{money(model.fixedPerBagel)}</strong>
          <small>{fixedSpreadText}</small>
        </div>
      </div>

      <div className="calculator-layout">
        <section className="calculator-control-card">
          <div className="admin-card-head compact">
            <h3>Simula volumen</h3>
            <p>Elige formato, cantidad, precios y sabor base para packs de un sabor.</p>
          </div>

          <div className="quick-volume-box">
            <div className="quick-mode-grid">
              {packModes.map((mode) => (
                <button
                  className={quickMode === mode.key ? "active" : ""}
                  key={mode.key}
                  onClick={() => setQuickMode(mode.key)}
                  type="button"
                >
                  {mode.shortLabel}
                </button>
              ))}
            </div>
            <div className="quick-volume-buttons">
              {[1, 20, 100, 1000, 20000].map((volume) => (
                <button key={volume} onClick={() => applyQuickVolume(volume)} type="button">
                  {integer(volume)}
                </button>
              ))}
            </div>
          </div>

          <div className="calculator-input-grid">
            {packModes.map((mode) => (
              <label key={mode.key}>
                <span>{mode.shortLabel}</span>
                <input
                  inputMode="numeric"
                  min={0}
                  onChange={(event) => setQuantity(mode.key, event.target.value)}
                  type="number"
                  value={scenario.quantities[mode.key]}
                />
              </label>
            ))}
          </div>

          <label className="calculator-wide-field">
            <span>Sabor para packs de un sabor</span>
            <select
              onChange={(event) =>
                setScenario((current) => ({
                  ...current,
                  singleFlavorSlug: event.target.value,
                }))
              }
              value={scenario.singleFlavorSlug}
            >
              <option value="average">Promedio de sabores</option>
              {costFlavorCatalog.map((flavor) => (
                <option key={flavor.slug} value={flavor.slug}>
                  {flavor.name}
                </option>
              ))}
            </select>
          </label>

          <div className="calculator-input-grid price-grid">
            {packModes.map((mode) => (
              <label key={mode.key}>
                <span>Precio {mode.shortLabel}</span>
                <input
                  inputMode="decimal"
                  min={0}
                  onChange={(event) => setPrice(mode.key, event.target.value)}
                  step="0.01"
                  type="number"
                  value={scenario.prices[mode.key]}
                />
              </label>
            ))}
          </div>

          <div className="calculator-action-row">
            <button className="status-action paid" onClick={loadCurrentScenario} type="button">
              Pedidos actuales
            </button>
            <button className="mini-link" onClick={clearScenario} type="button">
              Limpiar volumen
            </button>
          </div>
        </section>

        <section className="calculator-control-card">
          <div className="admin-card-head compact">
            <h3>Costos base</h3>
            <p>Fijos mensuales y merma. No incluye delivery.</p>
          </div>

          <div className="calculator-input-grid">
            <label>
              <span>Luz</span>
              <input
                min={0}
                onChange={(event) => setFixedCost("luz", event.target.value)}
                step="0.01"
                type="number"
                value={scenario.fixedCosts.luz}
              />
            </label>
            <label>
              <span>Publicidad</span>
              <input
                min={0}
                onChange={(event) => setFixedCost("publicidad", event.target.value)}
                step="0.01"
                type="number"
                value={scenario.fixedCosts.publicidad}
              />
            </label>
            <label>
              <span>Mano obra</span>
              <input
                min={0}
                onChange={(event) => setFixedCost("manoObra", event.target.value)}
                step="0.01"
                type="number"
                value={scenario.fixedCosts.manoObra}
              />
            </label>
            <label>
              <span>Merma %</span>
              <input
                min={0}
                onChange={(event) =>
                  setScenario((current) => ({
                    ...current,
                    mermaPct: cleanNumber(event.target.value),
                  }))
                }
                step="0.1"
                type="number"
                value={scenario.mermaPct}
              />
            </label>
          </div>

          <div className="calculator-cheddar-note">
            <span>Cheddar</span>
            <strong>{money(cheddarSliceAssumption.pricePerSlice)} por rodaja</strong>
            <small>
              Crystal Farms {integer(cheddarSliceAssumption.slicesPerPack)} rodajas /{" "}
              {money(cheddarSliceAssumption.packPrice)}. Con merma:{" "}
              {money(cheddarWithMerma)} por bagel con cheddar.
            </small>
          </div>

          <div className="calculator-fixed-note">
            <strong>Como leer los fijos</strong>
            <p>{fixedSpreadText}</p>
          </div>
        </section>
      </div>

      <div className="calculator-table-wrap">
        <table className="calculator-table">
          <thead>
            <tr>
              <th>Formato</th>
              <th>Cant.</th>
              <th>Ingreso</th>
              <th>Costo variable / pack</th>
              <th>Costo real / pack</th>
              <th>Utilidad / pack</th>
              <th>Utilidad / bagel</th>
              <th>Margen neto</th>
              <th>Break-even</th>
            </tr>
          </thead>
          <tbody>
            {model.modeRows.map((row) => (
              <tr key={row.key}>
                <td><strong>{row.shortLabel}</strong><small>{row.units} bagels</small></td>
                <td>{integer(row.quantity)}</td>
                <td>{money(row.revenue)}</td>
                <td>{money(row.variableCostPerPack)}</td>
                <td>{money(row.fullCostPerPack)}</td>
                <td className={row.netProfitPerPack >= 0 ? "positive" : "negative"}>
                  {money(row.netProfitPerPack)}
                </td>
                <td className={row.netProfitPerBagel >= 0 ? "positive" : "negative"}>
                  {money(row.netProfitPerBagel)}
                </td>
                <td>{percent(row.netMarginPct)}</td>
                <td>{row.breakEvenPacks ? `${integer(row.breakEvenPacks)} packs` : "No cubre"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="calculator-flavor-card">
        <div className="admin-card-head compact">
          <h3>Costo unitario por sabor</h3>
          <p>Variable por bagel y contribucion para vender packs de un sabor sin fijos.</p>
        </div>
        <div className="flavor-profit-grid">
          {model.flavorRows.map((flavor) => (
            <div className="flavor-profit-row" key={flavor.slug}>
              <div>
                <strong>{flavor.name}</strong>
                <span>{money(flavor.unitCost)} variable / bagel</span>
              </div>
              <div>
                <small>Pack 6</small>
                <b>{money(flavor.pack6Contribution)}</b>
                <span>{percent(flavor.pack6MarginPct)}</span>
              </div>
              <div>
                <small>Pack 12</small>
                <b>{money(flavor.pack12Contribution)}</b>
                <span>{percent(flavor.pack12MarginPct)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
