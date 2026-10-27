export type FirstStageStep = "entry" | "category" | "pack-size";
export type PackFamily = "large" | "mini";

export const FIRST_STAGE_PROGRESS = [
  "Entrada",
  "Categoría",
  "Tamaño",
  "Selecciona",
  "Revisa",
  "Pago",
] as const;

const hashes: Record<FirstStageStep, string> = {
  entry: "#entrar",
  category: "#mostrador",
  "pack-size": "#packs",
};

export function getFirstStageFromHash(hash: string): FirstStageStep {
  if (hash === hashes.category) return "category";
  if (hash === hashes["pack-size"]) return "pack-size";
  return "entry";
}

export function hashForFirstStage(step: FirstStageStep): string {
  return hashes[step];
}

export function progressPosition(step: FirstStageStep): number {
  if (step === "category") return 1;
  if (step === "pack-size") return 2;
  return 0;
}
