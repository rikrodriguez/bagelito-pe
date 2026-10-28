export type Flavor = {
  slug: string;
  name: string;
  category: "classic" | "premium";
  price: number;
  seasonal?: boolean;
  variant: string;
};

export const flavors: Flavor[] = [
  { slug: "jalapeno-cheddar", name: "Jalapeno Cheddar", category: "classic", price: 10, variant: "jalapeno" },
  { slug: "cheddar", name: "Cheddar", category: "classic", price: 10, variant: "cheddar" },
  { slug: "sesame", name: "Sesame", category: "classic", price: 10, variant: "sesame" },
  { slug: "everything-bagel", name: "Everything Bagel", category: "classic", price: 10, variant: "everything" },
  { slug: "cinnamon-raisin", name: "Cinnamon Raisin", category: "classic", price: 10, variant: "cinnamon" },
  { slug: "blueberry", name: "Blueberry", category: "classic", price: 10, variant: "blueberry" },
  { slug: "plain", name: "Plain", category: "classic", price: 10, variant: "plain" },
  { slug: "classic-onion", name: "Classic Onion", category: "classic", price: 10, variant: "onion" },
  { slug: "rainbow-custom-colors", name: "Rainbow / Custom Colors", category: "premium", price: 12, variant: "rainbow" },
  { slug: "snickerdoodle", name: "Snickerdoodle", category: "premium", price: 12, seasonal: true, variant: "snickerdoodle" }
];
