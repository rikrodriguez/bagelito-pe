export type FirstStageStep = "entry" | "category" | "pack-size" | "pack-config";
export type PackFamily = "large" | "mini";
export type PackMode = "mixed" | "single";
export type PackConfigId =
  | "large-6-mixed" | "large-6-single" | "large-12-mixed" | "large-12-single"
  | "mini-6-mixed" | "mini-6-single" | "mini-12-mixed" | "mini-12-single" | "mini-24-mixed" | "mini-24-single";

export type PackConfig = {
  id: PackConfigId;
  family: PackFamily;
  units: 6 | 12 | 24;
  mode: PackMode;
  amount: number;
};

export const LARGE_PACK_CONFIGS: readonly PackConfig[] = [
  { id: "large-6-mixed", family: "large", units: 6, mode: "mixed", amount: 60 },
  { id: "large-6-single", family: "large", units: 6, mode: "single", amount: 50 },
  { id: "large-12-mixed", family: "large", units: 12, mode: "mixed", amount: 115 },
  { id: "large-12-single", family: "large", units: 12, mode: "single", amount: 100 },
];

export const MINI_PACK_CONFIGS: readonly PackConfig[] = [
  { id: "mini-6-mixed", family: "mini", units: 6, mode: "mixed", amount: 25 },
  { id: "mini-6-single", family: "mini", units: 6, mode: "single", amount: 20 },
  { id: "mini-12-mixed", family: "mini", units: 12, mode: "mixed", amount: 40 },
  { id: "mini-12-single", family: "mini", units: 12, mode: "single", amount: 35 },
  { id: "mini-24-mixed", family: "mini", units: 24, mode: "mixed", amount: 75 },
  { id: "mini-24-single", family: "mini", units: 24, mode: "single", amount: 70 },
];

export const FIRST_STAGE_PROGRESS = [
  "Entrada",
  "Categoría",
  "Tamaño",
  "Selecciona",
  "Revisa",
  "Pago",
] as const;

const hashes: Record<Exclude<FirstStageStep, "pack-config">, string> = {
  entry: "#entrar",
  category: "#mostrador",
  "pack-size": "#packs",
};

export function getFirstStageFromHash(hash: string): FirstStageStep {
  if (hash === hashes.category) return "category";
  if (hash === hashes["pack-size"]) return "pack-size";
  if (hash === "#packs-grandes" || hash === "#packs-minis") return "pack-config";
  return "entry";
}

export function getPackFamilyFromHash(hash: string): PackFamily | null {
  if (hash === "#packs-grandes") return "large";
  if (hash === "#packs-minis") return "mini";
  return null;
}

export function hashForFirstStage(step: Exclude<FirstStageStep, "pack-config">): string {
  return hashes[step];
}

export function hashForPackFamily(family: PackFamily): string {
  return family === "large" ? "#packs-grandes" : "#packs-minis";
}

export function configsForFamily(family: PackFamily): readonly PackConfig[] {
  return family === "large" ? LARGE_PACK_CONFIGS : MINI_PACK_CONFIGS;
}

export function progressPosition(step: FirstStageStep): number {
  if (step === "category") return 1;
  if (step === "pack-size") return 2;
  if (step === "pack-config") return 3;
  return 0;
}
