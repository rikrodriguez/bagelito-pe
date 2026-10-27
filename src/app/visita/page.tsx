import type { Metadata } from "next";
import { PhotoVisit } from "@/components/visit/PhotoVisit";
import "./visit.css";

export const metadata: Metadata = {
  title: "Bagelito · Entra a la tienda | Preview 01",
  description: "Preview conceptual: entra, acércate a la vitrina y elige Packs, Combos o Schmears. Sin pedidos ni cobros.",
  robots: { index: false, follow: false },
};

export default function VisitPreviewPage() {
  return <PhotoVisit />;
}
