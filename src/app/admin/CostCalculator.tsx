"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateCostScenario,
  cheddarSliceAssumption,
  costFlavorCatalog,
  defaultCostScenario,
  ingredientSourceCatalog,
  type CostScenarioState,
  packModes,
  type PackModeKey,
} from "@/lib/bagelito-costing";

type CostCalculatorProps = {
  initialScenario?: Partial<CostScenarioState>;
};

type CostCalculatorDraftState = {
  quantities: Record<PackModeKey, string>;
  prices: Record<PackModeKey, string>;
  fixedCosts: Record<keyof CostScenarioState["fixedCosts"], string>;
  mermaPct: string;
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

function splitSourceLinks(link: string) {
  return link
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function shortLinkLabel(link: string, index: number, total: number) {
  try {
    const host = new URL(link).hostname.replace(/^www\./, "");
    return total > 1 ? `${host} ${index + 1}` : host;
  } catch {
    return total > 1 ? `Source ${index + 1}` : "Source";
  }
}

function cleanNumber(value: string) {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function createDraftState(scenario: CostScenarioState): CostCalculatorDraftState {
  return {
    quantities: Object.fromEntries(
      packModes.map((mode) => [mode.key, String(scenario.quantities[mode.key])]),
    ) as Record<PackModeKey, string>,
    prices: Object.fromEntries(
      packModes.map((mode) => [mode.key, String(scenario.prices[mode.key])]),
    ) as Record<PackModeKey, string>,
    fixedCosts: {
      luz: String(scenario.fixedCosts.luz),
      publicidad: String(scenario.fixedCosts.publicidad),
      manoObra: String(scenario.fixedCosts.manoObra),
    },
    mermaPct: String(scenario.mermaPct),
  };
}

function isIntegerDraft(value: string) {
  return /^\d*$/.test(value);
}

function isDecimalDraft(value: string) {
  return /^\d*(?:[.,]\d*)?$/.test(value);
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
  const [draft, setDraft] = useState<CostCalculatorDraftState>(() =>
    createDraftState(mergeScenario(initialScenario)),
  );
  const [quickMode, setQuickMode] = useState<PackModeKey>("mixed6");
  const model = useMemo(() => calculateCostScenario(scenario), [scenario]);
  const cheddarWithMerma =
    cheddarSliceAssumption.pricePerSlice * (1 + scenario.mermaPct / 100);
  const includedIngredientsText =
    "Flour, sugar, salt, yeast, and baking soda are always included. Depending on the flavor, the model adds cheddar, sesame, everything seeds, raisins, blueberries, cinnamon, jalapenos, onion, or food coloring.";
  const mixedCostText = `Mixed packs use the current average across ${integer(
    costFlavorCatalog.length,
  )} flavors in the current catalog.`;
  const selectedSingleFlavorLabel =
    scenario.singleFlavorSlug === "average"
      ? "Catalog average"
      : costFlavorCatalog.find((flavor) => flavor.slug === scenario.singleFlavorSlug)?.name ??
        "Catalog average";

  useEffect(() => {
    setDraft(createDraftState(scenario));
  }, [scenario]);

  function setQuantity(mode: PackModeKey, value: string) {
    if (!isIntegerDraft(value)) return;
    setDraft((current) => ({
      ...current,
      quantities: {
        ...current.quantities,
        [mode]: value,
      },
    }));
  }

  function commitQuantity(mode: PackModeKey, value = draft.quantities[mode]) {
    setScenario((current) => ({
      ...current,
      quantities: {
        ...current.quantities,
        [mode]: Math.round(cleanNumber(value)),
      },
    }));
  }

  function setPrice(mode: PackModeKey, value: string) {
    if (!isDecimalDraft(value)) return;
    setDraft((current) => ({
      ...current,
      prices: {
        ...current.prices,
        [mode]: value,
      },
    }));
  }

  function commitPrice(mode: PackModeKey, value = draft.prices[mode]) {
    setScenario((current) => ({
      ...current,
      prices: {
        ...current.prices,
        [mode]: cleanNumber(value),
      },
    }));
  }

  function setFixedCost(field: keyof CostScenarioState["fixedCosts"], value: string) {
    if (!isDecimalDraft(value)) return;
    setDraft((current) => ({
      ...current,
      fixedCosts: {
        ...current.fixedCosts,
        [field]: value,
      },
    }));
  }

  function commitFixedCost(
    field: keyof CostScenarioState["fixedCosts"],
    value = draft.fixedCosts[field],
  ) {
    setScenario((current) => ({
      ...current,
      fixedCosts: {
        ...current.fixedCosts,
        [field]: cleanNumber(value),
      },
    }));
  }

  function setMerma(value: string) {
    if (!isDecimalDraft(value)) return;
    setDraft((current) => ({
      ...current,
      mermaPct: value,
    }));
  }

  function commitMerma(value = draft.mermaPct) {
    setScenario((current) => ({
      ...current,
      mermaPct: cleanNumber(value),
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
      )} per bagel. Scenario: ${integer(model.totals.totalPacks)} packs.`
    : `${money(model.fixedTotal)} in fixed costs is not allocated yet because the scenario has 0 bagels.`;

  return (
    <section className="admin-card cost-calculator-panel">
      <div className="admin-card-head">
        <div>
          <p className="kicker">Calculator</p>
          <h2>Cost, revenue, and profit by pack</h2>
          <p>
            Simulate from 1 pack to wholesale volume. Delivery stays outside this model, and
            fixed costs are spread only across the bagels in the active scenario.
          </p>
        </div>
        <span className="status-pill neutral">{integer(model.totals.totalPacks)} packs</span>
      </div>

      <div className="calculator-hero-grid">
        <div className="calculator-main-kpi">
          <span>Net profit</span>
          <strong>{money(model.totals.netProfit)}</strong>
          <small>{percent(model.totals.netMarginPct)} net margin after fixed costs</small>
        </div>
        <div>
          <span>Revenue</span>
          <strong>{money(model.totals.revenue)}</strong>
          <small>{integer(model.totals.totalBagels)} bagels sold</small>
        </div>
        <div>
          <span>Variable cost</span>
          <strong>{money(model.totals.variableCost)}</strong>
          <small>{percent(model.totals.contributionMarginPct)} contribution margin</small>
        </div>
        <div>
          <span>Fixed spread</span>
          <strong>{money(model.fixedPerBagel)}</strong>
          <small>{fixedSpreadText}</small>
        </div>
      </div>

      <div className="calculator-layout">
        <section className="calculator-control-card">
          <div className="admin-card-head compact">
            <h3>Simulate volume</h3>
            <p>Choose format, quantity, prices, and the base flavor for single-flavor packs.</p>
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
                  onChange={(event) => setQuantity(mode.key, event.target.value)}
                  onBlur={(event) => commitQuantity(mode.key, event.currentTarget.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  spellCheck={false}
                  type="text"
                  value={draft.quantities[mode.key]}
                />
              </label>
            ))}
          </div>

          <label className="calculator-wide-field">
            <span>Flavor for single-flavor packs</span>
            <select
              onChange={(event) =>
                setScenario((current) => ({
                  ...current,
                  singleFlavorSlug: event.target.value,
                }))
              }
              value={scenario.singleFlavorSlug}
            >
              <option value="average">Catalog average</option>
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
                <span>Price {mode.shortLabel}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => setPrice(mode.key, event.target.value)}
                  onBlur={(event) => commitPrice(mode.key, event.currentTarget.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  spellCheck={false}
                  type="text"
                  value={draft.prices[mode.key]}
                />
              </label>
            ))}
          </div>

          <div className="calculator-action-row">
            <button className="status-action paid" onClick={loadCurrentScenario} type="button">
              Current orders
            </button>
            <button className="mini-link" onClick={clearScenario} type="button">
              Clear volume
            </button>
          </div>
        </section>

        <section className="calculator-control-card">
          <div className="admin-card-head compact">
            <h3>Base costs</h3>
            <p>Monthly fixed costs and waste. Delivery is excluded.</p>
          </div>

          <div className="calculator-input-grid">
            <label>
              <span>Electricity</span>
              <input
                onChange={(event) => setFixedCost("luz", event.target.value)}
                onBlur={(event) => commitFixedCost("luz", event.currentTarget.value)}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                spellCheck={false}
                type="text"
                value={draft.fixedCosts.luz}
              />
            </label>
            <label>
              <span>Marketing</span>
              <input
                onChange={(event) => setFixedCost("publicidad", event.target.value)}
                onBlur={(event) => commitFixedCost("publicidad", event.currentTarget.value)}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                spellCheck={false}
                type="text"
                value={draft.fixedCosts.publicidad}
              />
            </label>
            <label>
              <span>Labor</span>
              <input
                onChange={(event) => setFixedCost("manoObra", event.target.value)}
                onBlur={(event) => commitFixedCost("manoObra", event.currentTarget.value)}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                spellCheck={false}
                type="text"
                value={draft.fixedCosts.manoObra}
              />
            </label>
            <label>
              <span>Waste %</span>
              <input
                onChange={(event) => setMerma(event.target.value)}
                onBlur={(event) => commitMerma(event.currentTarget.value)}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                spellCheck={false}
                type="text"
                value={draft.mermaPct}
              />
            </label>
          </div>

          <div className="calculator-ingredient-note">
            <span>Included ingredients</span>
            <strong>Base dough + flavor add-ons</strong>
            <small>{includedIngredientsText}</small>
            <small>{mixedCostText}</small>
            <div className="calculator-assumption-inline">
              <b>Cheddar</b>
              <p>
                Special case: {money(cheddarSliceAssumption.pricePerSlice)} per slice using
                Crystal Farms {integer(cheddarSliceAssumption.slicesPerPack)} slices /{" "}
                {money(cheddarSliceAssumption.packPrice)}. With waste applied:{" "}
                {money(cheddarWithMerma)} per cheddar bagel.
              </p>
            </div>
          </div>

          <div className="calculator-fixed-note">
            <strong>How to read fixed costs</strong>
            <p>{fixedSpreadText}</p>
          </div>
        </section>
      </div>

      <div className="calculator-table-wrap">
        <table className="calculator-table">
          <thead>
            <tr>
              <th>Format</th>
              <th>Qty.</th>
              <th>Revenue</th>
              <th>Variable cost / pack</th>
              <th>Real cost / pack</th>
              <th>Profit / pack</th>
              <th>Profit / bagel</th>
              <th>Net margin</th>
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
                <td>{row.breakEvenPacks ? `${integer(row.breakEvenPacks)} packs` : "Not covered"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="calculator-flavor-card">
        <div className="admin-card-head compact">
          <h3>Unit cost by flavor</h3>
          <p>Variable cost per bagel and contribution margin for selling single-flavor packs before fixed costs.</p>
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

      <div className="calculator-source-card">
        <div className="admin-card-head compact">
          <div>
            <h3>Ingredient cost sources</h3>
            <p>
              Operating reference for the model: base cost, supplier, and source used to
              calculate each flavor.
            </p>
          </div>
        </div>

        <div className="calculator-source-meta">
          <div>
            <span>Ingredients modeled</span>
            <strong>{integer(ingredientSourceCatalog.length)}</strong>
            <small>Base dough, toppings, and colors in the current catalog.</small>
          </div>
          <div>
            <span>Mixed packs</span>
            <strong>{integer(costFlavorCatalog.length)} flavors</strong>
            <small>{mixedCostText}</small>
          </div>
          <div>
            <span>Single flavor</span>
            <strong>{selectedSingleFlavorLabel}</strong>
            <small>This selector changes the cost for single-flavor packs.</small>
          </div>
          <div>
            <span>Delivery</span>
            <strong>Excluded</strong>
            <small>This table only covers ingredients and sourcing references.</small>
          </div>
        </div>

        <div className="calculator-supplier-wrap">
          <table className="calculator-supplier-table">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Base cost</th>
                <th>Supplier</th>
                <th>Used for</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {ingredientSourceCatalog.map((source) => {
                const links = splitSourceLinks(source.link);

                return (
                  <tr key={source.ingredient}>
                    <td>
                      <strong>{source.ingredient}</strong>
                      <small>{source.note}</small>
                    </td>
                    <td>
                      <strong>{money(source.pricePerKg)} / kg</strong>
                      {source.ingredient === "Cheddar cheese" ? (
                        <small>{money(cheddarSliceAssumption.pricePerSlice)} / slice</small>
                      ) : null}
                    </td>
                    <td>
                      <strong>{source.provider}</strong>
                      <small>
                        {source.product}
                        <br />
                        {source.format}
                      </small>
                    </td>
                    <td>
                      <strong>{source.appliesTo}</strong>
                    </td>
                    <td>
                      <div className="calculator-link-stack">
                        {links.map((link, index) => (
                          <a
                            href={link}
                            key={`${source.ingredient}-${index}`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {shortLinkLabel(link, index, links.length)}
                          </a>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
