export const districtDeliveryFees = {
  Lince: 10,
  "Jesus Maria": 10,
  "San Isidro": 10,
  Miraflores: 10,
  "San Borja": 10,
  "Pueblo Libre": 10,
  Magdalena: 10,
  Surquillo: 10,
  "La Victoria": 15,
  "Cercado de Lima": 15,
  Brena: 15,
  Barranco: 15,
  "San Miguel": 15,
  Surco: 15,
  "Santiago de Surco": 15,
  "San Luis": 15,
  Chorrillos: 20,
  "La Molina": 20,
  Rimac: 20,
  "San Juan de Miraflores": 20,
  Ate: 25,
  "Los Olivos": 25,
  "San Martin de Porres": 25,
  "Villa El Salvador": 25,
  "Villa Maria del Triunfo": 25,
  Other: 25,
} as const;

export const districtOptions = Object.keys(districtDeliveryFees) as Array<keyof typeof districtDeliveryFees>;

export type DistrictOption = keyof typeof districtDeliveryFees;

export function getDeliveryFee(district: string) {
  return districtDeliveryFees[district as DistrictOption] ?? districtDeliveryFees.Other;
}
