const deliveryRatePerKm = 3;
const minimumDeliveryFee = 8;
const longDistanceDiscountThreshold = 15;
const longDistanceDiscountRate = 0.3;

// Internal approximate route distances used to price each Lima delivery zone.
export const districtDeliveryDistancesKm = {
  Lince: 1.3,
  "Jesus Maria": 1.5,
  "San Isidro": 3.3,
  Miraflores: 7.1,
  "San Borja": 7.4,
  "Pueblo Libre": 3.7,
  Magdalena: 4.4,
  Surquillo: 7.9,
  "La Victoria": 3.3,
  "Cercado de Lima": 5.2,
  Brena: 3.8,
  Barranco: 10.4,
  "San Miguel": 6.4,
  Surco: 10.8,
  "Santiago de Surco": 10.8,
  "San Luis": 6.6,
  Chorrillos: 17.1,
  "La Molina": 17,
  Rimac: 8.6,
  "San Juan de Miraflores": 12.9,
  Ate: 20,
  "Los Olivos": 16.5,
  "San Martin de Porres": 16.3,
  "Villa El Salvador": 22.4,
  "Villa Maria del Triunfo": 21.1,
  Other: 10,
} as const;

export const districtOptions = Object.keys(districtDeliveryDistancesKm) as Array<keyof typeof districtDeliveryDistancesKm>;

export type DistrictOption = keyof typeof districtDeliveryDistancesKm;

export function getDeliveryDistanceKm(district: string) {
  return districtDeliveryDistancesKm[district as DistrictOption] ?? districtDeliveryDistancesKm.Other;
}

export function getDeliveryFee(district: string) {
  const baseFee = Math.ceil(getDeliveryDistanceKm(district) * deliveryRatePerKm);
  const adjustedFee = baseFee >= longDistanceDiscountThreshold ? Math.ceil(baseFee * (1 - longDistanceDiscountRate)) : baseFee;

  return Math.max(minimumDeliveryFee, adjustedFee);
}
