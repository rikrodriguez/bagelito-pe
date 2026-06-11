import { flavors } from "@/data/flavors";
import { packs, type PackSlug } from "@/data/packs";

export { flavors, packs };
export type { Flavor } from "@/data/flavors";
export type { Pack, PackSlug } from "@/data/packs";

export function getPackBySlug(slug: string | null | undefined) {
  return packs.find((pack) => pack.slug === slug);
}

export function getValidPack(slug: string | null | undefined) {
  return getPackBySlug(slug) ?? packs[0];
}

export function getFlavorBySlug(slug: string | null | undefined) {
  return flavors.find((flavor) => flavor.slug === slug);
}

export function isPackSlug(value: string): value is PackSlug {
  return packs.some((pack) => pack.slug === value);
}
