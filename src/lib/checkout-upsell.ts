export const checkoutExtraPackDiscountPercent = 20;

export function getCheckoutExtraPackOffer(packAmount: number) {
  const originalAmountMinor = Math.round(packAmount * 100);
  const discountedAmountMinor = Math.round(
    originalAmountMinor * (1 - checkoutExtraPackDiscountPercent / 100),
  );

  return {
    discountedAmount: discountedAmountMinor / 100,
    originalAmount: originalAmountMinor / 100,
    savingsAmount: (originalAmountMinor - discountedAmountMinor) / 100,
  };
}
