import type { Metadata } from "next";
import { PhotoVisit } from "@/components/visit/PhotoVisit";
import "./brand-fonts.css";
import "./visit.css";
import "./packs.css";
import "./verified-menu.css";

export const metadata: Metadata = {
  title: "Bagelito · Entra a la tienda | Carta verificada",
  description: "Preview conceptual: entra, acércate a la vitrina y elige Packs, Combos o Schmears. Carta basada en las capturas aportadas; sin pedidos ni cobros.",
  robots: { index: false, follow: false },
};

export default function VisitPreviewPage() {
  return <PhotoVisit />;
}
