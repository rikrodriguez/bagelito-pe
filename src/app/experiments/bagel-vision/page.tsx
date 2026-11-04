import type { Metadata } from "next";
import { BagelVisionLab } from "@/features/bagel-vision/BagelVisionLab";
import "./bagel-vision.css";

export const metadata: Metadata = {
  title: "Bagel Vision Lab | Bagelito",
  description: "Laboratorio visual experimental de Bagelito. Convierte tus videos en clips creativos.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function BagelVisionPage() {
  return <BagelVisionLab />;
}
