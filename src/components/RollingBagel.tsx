"use client";

import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";
import type { CSSProperties } from "react";

export type BagelVariant = "plain" | "sesame" | "everything" | "rainbow" | "jalapeno" | "cheddar" | "blueberry" | "cinnamon" | "onion" | "snickerdoodle";

type Props = {
  variant?: BagelVariant;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  style?: CSSProperties;
  label?: string;
  spin?: number;
  spinOffset?: number;
};

const sizeClass = {
  sm: "bagel-sm",
  md: "bagel-md",
  lg: "bagel-lg",
  xl: "bagel-xl",
};

const imageSizeByBagelSize: Record<NonNullable<Props["size"]>, number> = {
  sm: 180,
  md: 240,
  lg: 360,
  xl: 520,
};

const imageQualityByBagelSize: Record<NonNullable<Props["size"]>, number> = {
  sm: 70,
  md: 72,
  lg: 74,
  xl: 76,
};

const imageByVariant: Record<BagelVariant, string> = {
  plain: "/images/bagel-plain.webp",
  sesame: "/images/bagel-sesame.webp",
  everything: "/images/bagel-everything.webp",
  rainbow: "/images/bagel-rainbow.webp",
  jalapeno: "/images/bagel-jalapeno-cheddar.webp",
  cheddar: "/images/bagel-cheddar.webp",
  blueberry: "/images/bagel-blueberry.webp",
  cinnamon: "/images/bagel-cinnamon-raisin.webp",
  onion: "/images/bagel-classic-onion.webp",
  snickerdoodle: "/images/bagel-snickerdoodle.webp",
};

export function RollingBagel({ variant = "plain", size = "md", className = "", style, label, spin = 1, spinOffset = 0 }: Props) {
  const { scrollYProgress } = useScroll();
  const rotate = useTransform(scrollYProgress, [0, 1], [spinOffset - 80, spinOffset + 360 * spin]);
  const alt = label ?? `${variant} bagel without filling`;
  const imageSize = imageSizeByBagelSize[size];

  return (
    <motion.div
      className={`bagel-photo bagel-variant-${variant} ${sizeClass[size]} ${className}`}
      style={{ ...style, rotate }}
      aria-label={alt}
      role="img"
    >
      <Image
        src={imageByVariant[variant]}
        alt={alt}
        width={imageSize}
        height={imageSize}
        quality={imageQualityByBagelSize[size]}
        priority={size === "xl"}
        className="bagel-photo-img"
      />
    </motion.div>
  );
}
