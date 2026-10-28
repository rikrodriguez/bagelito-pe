export type EntryFlowState = "entry" | "categories" | "pack-size";
export type EntryFlowAction = "enter" | "packs" | "combos" | "schmears" | "back";

export const categoryOptions = [
  { id: "packs", label: "Packs", detail: "Arma una caja a tu manera" },
  { id: "combos", label: "Combos", detail: "Bagels + schmears" },
  { id: "schmears", label: "Schmears", detail: "Tarrinas individuales" },
] as const;

export const packSizeOptions = [
  { id: "large", label: "Grandes", detail: "6 o 12 bagels" },
  { id: "mini", label: "Minis", detail: "6, 12 o 24 mini bagels" },
] as const;

export function nextEntryState(state: EntryFlowState, action: EntryFlowAction): EntryFlowState {
  if (state === "entry" && action === "enter") return "categories";
  if (state === "categories" && action === "packs") return "pack-size";
  if (state === "pack-size" && action === "back") return "categories";
  if (state === "categories" && action === "back") return "entry";
  return state;
}
