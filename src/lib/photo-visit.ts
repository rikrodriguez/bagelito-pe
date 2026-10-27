export const VISIT_STORAGE_KEY = "bagelito:photo-visit:step1";
export const VISIT_CATEGORIES = ["packs", "combos", "schmears"] as const;
export type VisitCategory = typeof VISIT_CATEGORIES[number];
export type VisitPhase = "entrada" | "acercando" | "elige";
export type VisitState = { phase: VisitPhase; category: VisitCategory | null };
export type VisitEvent =
  | { type: "ENTER" }
  | { type: "ARRIVE" }
  | { type: "QUICK" }
  | { type: "CHOOSE"; category: string }
  | { type: "CLEAR" }
  | { type: "RESET" }
  | { type: "RESTORE"; state: VisitState };
export const initialVisit: VisitState = { phase: "entrada", category: null };
export function validCategory(value: unknown): value is VisitCategory {
  return typeof value === "string" && VISIT_CATEGORIES.some((category) => category === value);
}
export function visitReducer(state: VisitState, event: VisitEvent): VisitState {
  switch (event.type) {
    case "ENTER": return state.phase === "entrada" ? { phase: "acercando", category: state.category } : state;
    case "ARRIVE": return state.phase === "acercando" ? { ...state, phase: "elige" } : state;
    case "QUICK": return { ...state, phase: "elige" };
    case "CHOOSE": return state.phase === "elige" && validCategory(event.category) ? { phase: "elige", category: event.category } : state;
    case "CLEAR": return { ...state, category: null };
    case "RESET": return { ...initialVisit };
    case "RESTORE": return { phase: event.state.phase === "elige" ? "elige" : "entrada", category: validCategory(event.state.category) ? event.state.category : null };
    default: return state;
  }
}
export function readVisitHash(hash: string): VisitState | null {
  const route = hash.replace(/^#/, "");
  if (route === "entrada") return { ...initialVisit };
  if (route === "vitrina" || route === "elige") return { phase: "elige", category: null };
  if (validCategory(route)) return { phase: "elige", category: route };
  return null;
}
export function readVisitDraft(raw: string | null): VisitState | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const data = value as Record<string, unknown>;
    if (data.version !== 1) return null;
    if (data.phase !== "entrada" && data.phase !== "elige") return null;
    return { phase: data.phase, category: validCategory(data.category) ? data.category : null };
  } catch { return null; }
}
