import { flavors, packs } from "@/lib/catalog";

export type PackModeKey = "mixed6" | "mixed12" | "single6" | "single12";

export type CostScenarioState = {
  quantities: Record<PackModeKey, number>;
  prices: Record<PackModeKey, number>;
  fixedCosts: {
    luz: number;
    publicidad: number;
    manoObra: number;
  };
  mermaPct: number;
  singleFlavorSlug: string;
};

type IngredientName =
  | "Harina"
  | "Azucar"
  | "Sal"
  | "Levadura"
  | "Bicarbonato de sodio"
  | "Queso cheddar"
  | "Pasas"
  | "Blueberries"
  | "Canela en polvo"
  | "Jalapenos"
  | "Everything seeds"
  | "Sesamo / ajonjoli"
  | "Onion / cebolla"
  | "Colorantes";

type Recipe = Partial<Record<IngredientName, number>>;

const FLOUR_PER_BAGEL_KG = 1 / 12;
const CHEDDAR_PACK_PRICE = 21.9;
const CHEDDAR_PACK_WEIGHT_KG = 0.198;
const CHEDDAR_SLICES_PER_PACK = 10;
const CHEDDAR_SLICE_WEIGHT_KG = CHEDDAR_PACK_WEIGHT_KG / CHEDDAR_SLICES_PER_PACK;

export const cheddarSliceAssumption = {
  packPrice: CHEDDAR_PACK_PRICE,
  packWeightKg: CHEDDAR_PACK_WEIGHT_KG,
  slicesPerPack: CHEDDAR_SLICES_PER_PACK,
  sliceWeightKg: CHEDDAR_SLICE_WEIGHT_KG,
  pricePerSlice: CHEDDAR_PACK_PRICE / CHEDDAR_SLICES_PER_PACK,
  pricePerKg: CHEDDAR_PACK_PRICE / CHEDDAR_PACK_WEIGHT_KG,
};

export const defaultIngredientPrices: Record<IngredientName, number> = {
  Harina: 2.04,
  Azucar: 2.16,
  Sal: 0.64,
  Levadura: 18.6,
  "Bicarbonato de sodio": 4.65,
  "Queso cheddar": cheddarSliceAssumption.pricePerKg,
  Pasas: 13,
  Blueberries: 14.9,
  "Canela en polvo": 54,
  Jalapenos: 57.3427,
  "Everything seeds": 12.11,
  "Sesamo / ajonjoli": 7,
  "Onion / cebolla": 18,
  Colorantes: 66.6667,
};

export const costFlavorCatalog = flavors.map((flavor) => ({
  slug: flavor.slug,
  name: flavor.name,
}));

const baseRecipe: Recipe = {
  Harina: FLOUR_PER_BAGEL_KG,
  Azucar: 0.004,
  Sal: 0.002,
  Levadura: 0.001,
  "Bicarbonato de sodio": 0.0015,
};

export const recipeByFlavor: Record<string, Recipe> = {
  plain: baseRecipe,
  cheddar: {
    ...baseRecipe,
    "Queso cheddar": CHEDDAR_SLICE_WEIGHT_KG,
  },
  sesame: {
    ...baseRecipe,
    "Sesamo / ajonjoli": 0.005,
  },
  "everything-bagel": {
    ...baseRecipe,
    "Everything seeds": 0.005,
  },
  "cinnamon-raisin": {
    ...baseRecipe,
    Azucar: 0.006,
    Pasas: 0.015,
    "Canela en polvo": 0.0012,
  },
  blueberry: {
    ...baseRecipe,
    Blueberries: 0.015,
  },
  "jalapeno-cheddar": {
    ...baseRecipe,
    "Queso cheddar": CHEDDAR_SLICE_WEIGHT_KG,
    Jalapenos: 0.006,
  },
  "classic-onion": {
    ...baseRecipe,
    "Onion / cebolla": 0.0035,
  },
  "rainbow-custom-colors": {
    ...baseRecipe,
    Colorantes: 0.0004,
  },
  snickerdoodle: {
    ...baseRecipe,
    Azucar: 0.009,
    "Canela en polvo": 0.0012,
  },
};

export const packModes = [
  {
    key: "mixed6",
    label: "Pack 6 mixtos",
    shortLabel: "6 mixtos",
    units: 6,
    type: "mixed",
    packSlug: "6-mixed",
  },
  {
    key: "mixed12",
    label: "Pack 12 mixtos",
    shortLabel: "12 mixtos",
    units: 12,
    type: "mixed",
    packSlug: "12-mixed",
  },
  {
    key: "single6",
    label: "Pack 6 un sabor",
    shortLabel: "6 un sabor",
    units: 6,
    type: "single",
    packSlug: "6-single",
  },
  {
    key: "single12",
    label: "Pack 12 un sabor",
    shortLabel: "12 un sabor",
    units: 12,
    type: "single",
    packSlug: "12-single",
  },
] as const;

const packPriceBySlug = Object.fromEntries(packs.map((pack) => [pack.slug, pack.amount]));

export const defaultCostScenario: CostScenarioState = {
  quantities: {
    mixed6: 0,
    mixed12: 0,
    single6: 0,
    single12: 0,
  },
  prices: {
    mixed6: packPriceBySlug["6-mixed"] ?? 60,
    mixed12: packPriceBySlug["12-mixed"] ?? 115,
    single6: packPriceBySlug["6-single"] ?? 50,
    single12: packPriceBySlug["12-single"] ?? 100,
  },
  fixedCosts: {
    luz: 200,
    publicidad: 400,
    manoObra: 150,
  },
  mermaPct: 5,
  singleFlavorSlug: "average",
};

function clampNumber(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function safeDivide(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}

export function getFlavorVariableUnitCost(flavorSlug: string, mermaPct: number) {
  const recipe = recipeByFlavor[flavorSlug] ?? baseRecipe;
  const directCost = Object.entries(recipe).reduce((total, [ingredient, kg]) => {
    return total + (kg ?? 0) * (defaultIngredientPrices[ingredient as IngredientName] ?? 0);
  }, 0);

  return directCost * (1 + mermaPct / 100);
}

export function getAverageFlavorUnitCost(mermaPct: number) {
  const total = costFlavorCatalog.reduce((sum, flavor) => {
    return sum + getFlavorVariableUnitCost(flavor.slug, mermaPct);
  }, 0);

  return safeDivide(total, costFlavorCatalog.length);
}

export function calculateCostScenario(input: CostScenarioState) {
  const fixedTotal =
    clampNumber(input.fixedCosts.luz) +
    clampNumber(input.fixedCosts.publicidad) +
    clampNumber(input.fixedCosts.manoObra);
  const mixedUnitCost = getAverageFlavorUnitCost(input.mermaPct);
  const singleUnitCost =
    input.singleFlavorSlug === "average"
      ? mixedUnitCost
      : getFlavorVariableUnitCost(input.singleFlavorSlug, input.mermaPct);

  const totalPacks = packModes.reduce((sum, mode) => {
    return sum + clampNumber(input.quantities[mode.key]);
  }, 0);
  const totalBagels = packModes.reduce((sum, mode) => {
    return sum + clampNumber(input.quantities[mode.key]) * mode.units;
  }, 0);
  const fixedPerBagel = safeDivide(fixedTotal, totalBagels);

  const modeRows = packModes.map((mode) => {
    const quantity = clampNumber(input.quantities[mode.key]);
    const price = clampNumber(input.prices[mode.key]);
    const unitCost = mode.type === "mixed" ? mixedUnitCost : singleUnitCost;
    const variableCostPerPack = unitCost * mode.units;
    const fixedCostPerPack = fixedPerBagel * mode.units;
    const fullCostPerPack = variableCostPerPack + fixedCostPerPack;
    const contributionPerPack = price - variableCostPerPack;
    const netProfitPerPack = price - fullCostPerPack;
    const revenue = quantity * price;
    const variableCost = quantity * variableCostPerPack;
    const allocatedFixedCost = quantity * fixedCostPerPack;
    const netProfit = revenue - variableCost - allocatedFixedCost;

    return {
      ...mode,
      quantity,
      price,
      revenue,
      variableCost,
      allocatedFixedCost,
      fullCost: variableCost + allocatedFixedCost,
      contribution: revenue - variableCost,
      netProfit,
      variableCostPerBagel: unitCost,
      variableCostPerPack,
      fixedCostPerPack,
      fullCostPerPack,
      contributionPerPack,
      netProfitPerPack,
      contributionPerBagel: safeDivide(contributionPerPack, mode.units),
      netProfitPerBagel: safeDivide(netProfitPerPack, mode.units),
      contributionMarginPct: safeDivide(contributionPerPack, price),
      netMarginPct: safeDivide(netProfitPerPack, price),
      breakEvenPacks:
        contributionPerPack > 0 ? Math.ceil(fixedTotal / contributionPerPack) : null,
    };
  });

  const revenue = modeRows.reduce((sum, row) => sum + row.revenue, 0);
  const variableCost = modeRows.reduce((sum, row) => sum + row.variableCost, 0);
  const contribution = revenue - variableCost;
  const totalCost = variableCost + fixedTotal;
  const netProfit = revenue - totalCost;

  const flavorRows = costFlavorCatalog.map((flavor) => {
    const unitCost = getFlavorVariableUnitCost(flavor.slug, input.mermaPct);
    const pack6Price = input.prices.single6;
    const pack12Price = input.prices.single12;
    const pack6VariableCost = unitCost * 6;
    const pack12VariableCost = unitCost * 12;

    return {
      ...flavor,
      unitCost,
      pack6VariableCost,
      pack12VariableCost,
      pack6Contribution: pack6Price - pack6VariableCost,
      pack12Contribution: pack12Price - pack12VariableCost,
      pack6MarginPct: safeDivide(pack6Price - pack6VariableCost, pack6Price),
      pack12MarginPct: safeDivide(pack12Price - pack12VariableCost, pack12Price),
    };
  });

  return {
    fixedTotal,
    fixedPerBagel,
    mixedUnitCost,
    singleUnitCost,
    modeRows,
    flavorRows,
    totals: {
      revenue,
      variableCost,
      contribution,
      fixedCost: fixedTotal,
      totalCost,
      netProfit,
      totalPacks,
      totalBagels,
      averageTicket: safeDivide(revenue, totalPacks),
      contributionMarginPct: safeDivide(contribution, revenue),
      netMarginPct: safeDivide(netProfit, revenue),
      contributionPerPack: safeDivide(contribution, totalPacks),
      contributionPerBagel: safeDivide(contribution, totalBagels),
    },
  };
}
