"use client";
import Image from "next/image";
import { ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { getShopCheckoutHref, SHOP_DRAFT_UPDATED_EVENT } from "@/lib/shop-draft";
import Link from "next/link";
import { useBatchAvailability } from "./BatchAvailabilityProvider";
import { LanguageToggle } from "./LanguageToggle";
import { useLanguage } from "./LanguageProvider";
import { merchantReviewCopy } from "@/lib/merchant-review";

export function Header() {
  const { copy, locale } = useLanguage();
  const { merchantReviewOnly, accepting } = useBatchAvailability();
  const review = merchantReviewCopy[locale];
  const [checkoutHref, setCheckoutHref] = useState("/checkout?pack=6-mixed");

  useEffect(() => {
    function updateCheckoutHref() {
      setCheckoutHref(getShopCheckoutHref((key) => window.localStorage.getItem(key)));
    }
    updateCheckoutHref();
    window.addEventListener(SHOP_DRAFT_UPDATED_EVENT, updateCheckoutHref);
    window.addEventListener("storage", updateCheckoutHref);
    return () => {
      window.removeEventListener(SHOP_DRAFT_UPDATED_EVENT, updateCheckoutHref);
      window.removeEventListener("storage", updateCheckoutHref);
    };
  }, []);
  const label = merchantReviewOnly
    ? review.cta
    : locale === "es" ? (accepting ? "Ver checkout" : "Explorar checkout") : (accepting ? "View checkout" : "Explore checkout");

  return (
    <header className={"site-header" + (merchantReviewOnly ? " merchant-review-header" : "")}>
      <Link href="/" className="logo-link" aria-label={copy.header.homeLabel}>
        <Image src="/images/bagelito-logo.svg" alt="Bagelito Classic Gringo Bagels" width={671} height={178} priority />
      </Link>
      <nav className="store-header-navigation" aria-label={locale === "es" ? "Navegación de tienda" : "Store navigation"}>
        <Link href="/#mostrador">{locale === "es" ? "Sabores" : "Flavors"}</Link>
        <Link href="/#arma-tu-caja">{locale === "es" ? "Arma tu caja" : "Build a box"}</Link>
      </nav>
      <div className="header-actions">
        <Link className="header-checkout-link" href={checkoutHref} aria-label={label}><span className="header-checkout-text">{label}</span><ShoppingBag className="header-checkout-icon" size={19} aria-hidden="true" /></Link>
        <LanguageToggle />
      </div>
    </header>
  );
}
