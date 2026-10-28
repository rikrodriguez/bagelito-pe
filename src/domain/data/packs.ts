export type PackSlug = "12-mixed" | "6-mixed" | "12-single" | "6-single";

export type Pack = {
  slug: PackSlug;
  name: string;
  units: number;
  amount: number;
  packType: "mixed" | "single";
  description: string;
  accent: "pink" | "orange" | "mint" | "purple";
  mostWanted?: boolean;
};

export const packs: Pack[] = [
  { slug: "12-mixed", name: "12 mixed", units: 12, amount: 115, packType: "mixed", description: "The easiest way to try more flavors and share.", accent: "pink", mostWanted: true },
  { slug: "6-mixed", name: "6 mixed", units: 6, amount: 60, packType: "mixed", description: "Perfect if this is your first Bagelito batch.", accent: "orange" },
  { slug: "12-single", name: "12 single flavor", units: 12, amount: 100, packType: "single", description: "Best if you already know your favorite.", accent: "mint" },
  { slug: "6-single", name: "6 single flavor", units: 6, amount: 50, packType: "single", description: "Simple, clean, and batch-friendly.", accent: "purple" }
];
