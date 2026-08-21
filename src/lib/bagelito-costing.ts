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
  | "Flour"
  | "Sugar"
  | "Salt"
  | "Yeast"
  | "Baking soda"
  | "Cheddar cheese"
  | "Raisins"
  | "Blueberries"
  | "Ground cinnamon"
  | "Jalapenos"
  | "Everything seeds"
  | "Sesame seeds"
  | "Onion flakes"
  | "Food coloring";

type Recipe = Partial<Record<IngredientName, number>>;

export type IngredientSource = {
  ingredient: IngredientName;
  provider: string;
  product: string;
  format: string;
  pricePerKg: number;
  link: string;
  note: string;
  appliesTo: string;
};

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
  Flour: 2.04,
  Sugar: 2.16,
  Salt: 0.64,
  Yeast: 18.6,
  "Baking soda": 4.65,
  "Cheddar cheese": cheddarSliceAssumption.pricePerKg,
  Raisins: 13,
  Blueberries: 14.9,
  "Ground cinnamon": 54,
  Jalapenos: 57.3427,
  "Everything seeds": 12.11,
  "Sesame seeds": 7,
  "Onion flakes": 18,
  "Food coloring": 66.6667,
};

const ingredientSupplierMeta: Record<
  IngredientName,
  Omit<IngredientSource, "ingredient" | "pricePerKg" | "appliesTo">
> = {
  Flour: {
    provider: "Alimentos Cielo",
    product: "Harina Especial Panadera Del Cielo",
    format: "50 kg sack",
    link: "https://alimentoscielo.com/p/harina-especial-panadera-del-cielo-50-kg/",
    note: "Best clean public price found for bread flour.",
  },
  Sugar: {
    provider: "Makro",
    product: "Azucar Rubia San Jacinto",
    format: "50 kg sack",
    link: "https://www.makro.plazavea.com.pe/abarrotes/azucar-y-endulzantes/san-jacinto",
    note: "Best verified public price found for brown sugar.",
  },
  Salt: {
    provider: "Mundo Abarrotes",
    product: "Sal Yodada La Nueva Milagrosa",
    format: "50 kg sack",
    link: "https://mundoabarrotes.com/producto/sal-yodada-la-nueva-milagrosa-50kg/",
    note: "Very strong bulk price; listing appears geared to industrial use.",
  },
  Yeast: {
    provider: "Makro",
    product: "Levadura Instantanea Nicolini",
    format: "500 g bag",
    link: "https://www.makro.plazavea.com.pe/panaderia-y-pasteleria/nicolini/instant",
    note: "Best verified public price found for instant yeast suitable for bakery use.",
  },
  "Baking soda": {
    provider: "Campo Grande Peru",
    product: "Bicarbonato de sodio",
    format: "25 kg",
    link: "https://campograndeperu.com/producto/bicarbonato-de-sodio/",
    note: "Best public bulk price found among the checked options.",
  },
  "Cheddar cheese": {
    provider: "Tottus",
    product: "Queso cheddar en laminas Crystal Farms",
    format: "198 g pack / 10 slices",
    link: "https://www.tottus.com.pe/tottus-pe/articulo/145813801/queso-cheddar-en-laminas-crystal-farms-empaque-198-g/145813802",
    note: "Target quality chosen by Ricardo. Each cheddar bagel uses one full slice.",
  },
  Raisins: {
    provider: "La Peregrina",
    product: "Pasa Sultanina Argentina Mediana Santis Frut",
    format: "10 kg box",
    link: "https://laperegrina.pe/producto/pasa-sultanina-argentina-mediana-santis-frut-x-10-kg/",
    note: "Best clearly usable public price found for volume raisins.",
  },
  Blueberries: {
    provider: "The Greens",
    product: "Arandanos congelados",
    format: "1 kg promo",
    link: "https://www.instagram.com/reel/DZ_W8bXMTci/",
    note: "Best public price found without negotiation; promo validity should be checked.",
  },
  "Ground cinnamon": {
    provider: "Tanas Frut",
    product: "Canela molida puro",
    format: "1 kg bag",
    link: "https://tanasfrutperu.com/producto/canela-molida-puro-x-1kg/",
    note: "Best clean public price found for ground cinnamon.",
  },
  Jalapenos: {
    provider: "Corporacion Lider Peru",
    product: "Valle Fertil jalapenos en rodajas",
    format: "290 g jar",
    link: "https://corporacionliderperu.com/conservas-/16749-valle-fertil-jalapenos-x-290-gr-en-rodajas.html",
    note: "Best direct public price found for jarred jalapenos.",
  },
  "Everything seeds": {
    provider: "Combinado Tanas + Mundo Abarrotes",
    product: "House blend base without poppy seeds",
    format: "35% white sesame + 15% black sesame + 20% onion + 20% garlic + 10% salt",
    link: "https://tanasfrutperu.com/producto/ajonjoli-extra-x-1kg/ | https://tanasfrutperu.com/ | https://tanasfrutperu.com/producto/cebolla-molida-x-1kg/ | https://tanasfrutperu.com/producto/ajos-molido-x-1kg/ | https://mundoabarrotes.com/producto/sal-yodada-la-nueva-milagrosa-50kg/",
    note: "The house blend is the lowest-cost route for bagels and does not include poppy seeds.",
  },
  "Sesame seeds": {
    provider: "Tanas Frut",
    product: "Ajonjoli blanco",
    format: "5 kg",
    link: "https://tanasfrutperu.com/producto/ajonjoli-extra-x-1kg/",
    note: "Best public price found for white sesame.",
  },
  "Onion flakes": {
    provider: "Tanas Frut",
    product: "Cebolla molida",
    format: "1 kg bag",
    link: "https://tanasfrutperu.com/producto/cebolla-molida-x-1kg/",
    note: "Best clean public price found for dehydrated ground onion.",
  },
  "Food coloring": {
    provider: "JL DecoStore",
    product: "Colorante liquido Quality",
    format: "30 ml bottle",
    link: "https://www.jldecostore.com.pe/producto/colorante-liquido-30ml-quality/",
    note: "Best public multi-color option found for rainbow at the lowest cost.",
  },
};

export const costFlavorCatalog = flavors.map((flavor) => ({
  slug: flavor.slug,
  name: flavor.name,
}));

const baseRecipe: Recipe = {
  Flour: FLOUR_PER_BAGEL_KG,
  Sugar: 0.004,
  Salt: 0.002,
  Yeast: 0.001,
  "Baking soda": 0.0015,
};

export const recipeByFlavor: Record<string, Recipe> = {
  plain: baseRecipe,
  cheddar: {
    ...baseRecipe,
    "Cheddar cheese": CHEDDAR_SLICE_WEIGHT_KG,
  },
  sesame: {
    ...baseRecipe,
    "Sesame seeds": 0.005,
  },
  "everything-bagel": {
    ...baseRecipe,
    "Everything seeds": 0.005,
  },
  "cinnamon-raisin": {
    ...baseRecipe,
    Sugar: 0.006,
    Raisins: 0.015,
    "Ground cinnamon": 0.0012,
  },
  blueberry: {
    ...baseRecipe,
    Blueberries: 0.015,
  },
  "jalapeno-cheddar": {
    ...baseRecipe,
    "Cheddar cheese": CHEDDAR_SLICE_WEIGHT_KG,
    Jalapenos: 0.006,
  },
  "classic-onion": {
    ...baseRecipe,
    "Onion flakes": 0.0035,
  },
  "rainbow-custom-colors": {
    ...baseRecipe,
    "Food coloring": 0.0004,
  },
  snickerdoodle: {
    ...baseRecipe,
    Sugar: 0.009,
    "Ground cinnamon": 0.0012,
  },
};

function getIngredientUsageLabel(ingredient: IngredientName) {
  const matchingFlavors = flavors
    .filter((flavor) => (recipeByFlavor[flavor.slug] ?? baseRecipe)[ingredient])
    .map((flavor) => flavor.name);

  if (matchingFlavors.length === 0) {
    return "Reference only";
  }

  if (matchingFlavors.length === flavors.length) {
    return "All flavors";
  }

  return matchingFlavors.join(", ");
}

export const ingredientSourceCatalog: IngredientSource[] = (
  Object.keys(defaultIngredientPrices) as IngredientName[]
).map((ingredient) => ({
  ingredient,
  pricePerKg: defaultIngredientPrices[ingredient],
  appliesTo: getIngredientUsageLabel(ingredient),
  ...ingredientSupplierMeta[ingredient],
}));

export const packModes = [
  {
    key: "mixed6",
    label: "Pack 6 mixed",
    shortLabel: "6 mixed",
    units: 6,
    type: "mixed",
    packSlug: "6-mixed",
  },
  {
    key: "mixed12",
    label: "Pack 12 mixed",
    shortLabel: "12 mixed",
    units: 12,
    type: "mixed",
    packSlug: "12-mixed",
  },
  {
    key: "single6",
    label: "Pack 6 single flavor",
    shortLabel: "6 single flavor",
    units: 6,
    type: "single",
    packSlug: "6-single",
  },
  {
    key: "single12",
    label: "Pack 12 single flavor",
    shortLabel: "12 single flavor",
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
