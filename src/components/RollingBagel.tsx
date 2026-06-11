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
};

const sizeClass = {
  sm: "bagel-sm",
  md: "bagel-md",
  lg: "bagel-lg",
  xl: "bagel-xl",
};

const imageByVariant: Record<BagelVariant, string> = {
  plain: "/images/bagel-plain.png",
  sesame: "/images/bagel-sesame.png",
  everything: "/images/bagel-everything.png",
  rainbow: "/images/bagel-rainbow.png",
  jalapeno: "/images/bagel-jalapeno-cheddar.png",
  cheddar: "/images/bagel-cheddar.png",
  blueberry: "/images/bagel-blueberry.png",
  cinnamon: "/images/bagel-cinnamon-raisin.png",
  onion: "/images/bagel-classic-onion.png",
  snickerdoodle: "/images/bagel-snickerdoodle.png",
};

export function RollingBagel({ variant = "plain", size = "md", className = "", style, label }: Props) {
  const { scrollYProgress } = useScroll();
  const rotate = useTransform(scrollYProgress, [0, 1], [-80, 360]);
  const alt = label ?? `${variant} bagel without filling`;

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
        width={1100}
        height={1100}
        sizes={size === "xl" ? "(max-width: 768px) 72vw, 330px" : "(max-width: 768px) 30vw, 150px"}
        priority={size === "xl"}
        className="bagel-photo-img"
      />
    </motion.div>
  );
}
