import type { Metadata } from "next";
import { StoreEntryFlow } from "@/components/StoreEntryFlow";
import "./store-entry-flow.css";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  title: "Bagelito | Classic Gringo Bagels en Lima",
  description: "Entra a Bagelito, acércate a la vitrina y empieza tu pedido con Packs, Combos o Schmears.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function HomePage() {
  return <StoreEntryFlow />;
}
