/**
 * BAGELITO — DELIVERY POLICY V2 / USER-APPROVED 2026-11-06.
 *
 * PUBLIC METADATA ONLY: The exact dispatch address is a private business secret.
 * It is NOT used by this district/sector tariff module. Do not add a dispatch
 * street, coordinates, contact or recognizable pickup landmark here, to GitHub,
 * to browser bundles, to GHL CRM contact data, to order receipts, or to logs.
 *
 * This service is designed to be called in a server function. Customer-supplied
 * district/sector labels are untrusted; checkout uses a trusted address match
 * returned by a private, server-only geocoder / operator verification stage.
 */
import {locateDistrict, normalizeLocation, LIMA_DISTRICTS, CALLAO_DISTRICTS} from './delivery-metropolitan.js';

export const PUBLIC_DISPATCH_AREA = 'Lince, Lima' as const;
export const TARIFF_VERSION = 'BAGELITO-DELIVERY-2026-11-06-v2' as const;

const NEIGHBORING = [
  'Lince', 'Jesús María', 'San Isidro', 'La Victoria', 'Lima',
] as const;
const REGULAR = [
  'Breña', 'Pueblo Libre', 'Magdalena del Mar', 'Miraflores',
  'Surquillo', 'San Borja', 'San Luis', 'San Miguel',
  'Rímac', 'Barranco', 'Santiago de Surco', 'El Agustino',
] as const;
const DISTANT = [
  'Ate', 'Chorrillos', 'Independencia', 'Santa Anita',
  'San Martín de Porres', 'Los Olivos', 'San Juan de Lurigancho',
  'La Molina', 'Callao', 'Bellavista', 'Carmen de la Legua Reynoso',
  'La Perla', 'La Punta', 'San Juan de Miraflores',
  'Villa María del Triunfo', 'Villa El Salvador',
] as const;
const VERY_DISTANT = [
  'Carabayllo', 'Cieneguilla', 'Comas', 'Puente Piedra',
  'Ventanilla', 'Mi Perú', 'Lurín', 'Pachacámac',
] as const;
/** These remain selectable for coverage inquiry, but NOT automatically charged.
 * Their delivery distances can exceed the economics of a fixed S/20 fee. */
const HUMAN_REVIEW = [
  'Ancón', 'Chaclacayo', 'Lurigancho', 'Pucusana', 'Punta Hermosa',
  'Punta Negra', 'San Bartolo', 'Santa María del Mar', 'Santa Rosa',
] as const;
export type TierLabel='adjacent'|'regular'|'distant'|'very-distant'|'manual';
export type Bucket = Readonly<{tier:TierLabel;feeMinor:number|null}>;
const feeByTier:Readonly<Record<TierLabel,number|null>>=Object.freeze({
  adjacent:800,regular:1000,distant:1500,'very-distant':2000,manual:null,
});
const index = new Map<string,Bucket>();
for (const [tier,names] of [
  ['adjacent',NEIGHBORING],['regular',REGULAR],['distant',DISTANT],
  ['very-distant',VERY_DISTANT],['manual',HUMAN_REVIEW],
] as const) {
  for (const district of names){
    const key=normalizeLocation(district);
    if(index.has(key))throw new Error('Tariff duplicated district');
    index.set(key,Object.freeze({tier,feeMinor:feeByTier[tier]}));
  }
}
const allDistricts=[...LIMA_DISTRICTS,...CALLAO_DISTRICTS];
if(index.size!==allDistricts.length || allDistricts.some(d=>!index.has(normalizeLocation(d))))
  throw new Error('Tariff map must cover every Lima and Callao district exactly once');

/** Sector increases tariff only, it must come from trusted server validation.
 * String matching is intentionally conservative and normalized for accents. */
const LA_MOLINA_FAR_SECTORS = [
  'Sol de La Molina', 'El Sol de La Molina', 'Las Lagunas',
  'Las Lagunas de La Molina', 'La Planicie',
] as const;
const farSectors=new Set<string>(LA_MOLINA_FAR_SECTORS.map(normalizeLocation));

export class DeliveryTierError extends Error {
  constructor(message:string){super(message);this.name='DeliveryTierError';}
}
export interface SafeTierPreview {
  district:string;
  province:'Lima'|'Callao';
  tier:TierLabel;
  estimatedFeeMinor:number|null;
  status:'estimate-only'|'manual-review';
  requiresVerifiedAddress:true;
  tariffVersion:typeof TARIFF_VERSION;
}

/** Estimated district tier for public selector. NEVER authorizes payment. */
export function previewDeliveryTier(district:unknown):SafeTierPreview {
  const loc=locateDistrict(district);
  if(!loc)throw new DeliveryTierError('Selecciona un distrito válido de Lima Metropolitana o Callao.');
  const bucket=index.get(normalizeLocation(loc.district));
  if(!bucket)throw new DeliveryTierError('Distrito pendiente de tarifario.');
  return Object.freeze({
    district:loc.district,province:loc.province,tier:bucket.tier,
    estimatedFeeMinor:bucket.feeMinor,
    status:bucket.tier==='manual'?'manual-review':'estimate-only',
    requiresVerifiedAddress:true,tariffVersion:TARIFF_VERSION,
  });
}

/** Created in a trusted server route/address validator or a private staff panel,
 * NEVER accepted directly in API JSON from a client. */
export interface TrustedDestinationEvidence {
  source:'internal-geocode-or-operator';
  verifiedDistrict:string;
  verifiedFullAddress:string;
  verifiedSector?:string|null;
  /** Distance from a non-sensitive Lince reference point (not actual kitchen).
   * Optional; omit until server routing is configured.*/
  roadDistanceFromPublicLinceMeters?:number;
}
export interface TierDeliveryQuote {
  district:string;
  province:'Lima'|'Callao';
  feeMinor:number|null;
  tier:TierLabel;
  status:'pending-address'|'pending-verification'|'manual-review'|'quoted';
  payable:boolean;
  tariffVersion:typeof TARIFF_VERSION;
  /** No address, precise origin, route coordinates, phone, or customer personal data. */
}
function pending(look:SafeTierPreview,status:TierDeliveryQuote['status']):TierDeliveryQuote {
  return {district:look.district,province:look.province,feeMinor:null,tier:look.tier,status,payable:false,tariffVersion:TARIFF_VERSION};
}
function normalizedAddress(value:unknown):string{
  if(typeof value!=='string')return '';
  return normalizeLocation(value.replace(/[.,#]/g,' '));
}
/** Server-only quote. All response fields are safe to return to a customer.
 * The server route / geocoder must attest that evidence is not supplied by the browser. */
export function quoteDeliveryTier(input:Readonly<{
  district:unknown;
  fullAddress:unknown;
  verifiedDestination?:TrustedDestinationEvidence|null;
}>):TierDeliveryQuote {
  if(!input||typeof input!=='object')throw new DeliveryTierError('Cotización inválida.');
  const preview=previewDeliveryTier(input.district);
  if(preview.tier==='manual')return pending(preview,'manual-review');
  const full=normalizedAddress(input.fullAddress);
  if(full.length<8)return pending(preview,'pending-address');
  const ev=input.verifiedDestination;
  if(!ev)return pending(preview,'pending-verification');
  if(ev.source!=='internal-geocode-or-operator')throw new DeliveryTierError('Dirección no verificada por el servidor.');
  const district=locateDistrict(ev.verifiedDistrict);
  if(!district||district.district!==preview.district)throw new DeliveryTierError('El distrito no coincide con la dirección verificada.');
  if(normalizedAddress(ev.verifiedFullAddress)!==full)throw new DeliveryTierError('La dirección verificada no coincide con la cotización.');
  if(ev.roadDistanceFromPublicLinceMeters!==undefined&&
     (!Number.isSafeInteger(ev.roadDistanceFromPublicLinceMeters)||ev.roadDistanceFromPublicLinceMeters<1))
    throw new DeliveryTierError('Distancia de ruta no válida.');
  let tier=preview.tier;
  let fee=preview.estimatedFeeMinor;
  if(tier!=='adjacent') {
    // Distance is from a PUBLIC approximate zone marker in Lince, not the kitchen.
    // Overrides increase, never lower, the district base price.
    const km=ev.roadDistanceFromPublicLinceMeters;
    if(km!==undefined){
      if(km>40000)return pending(preview,'manual-review');
      if(km>25000){tier='very-distant';fee=Math.max(fee??0,2000);}
      else if(km>15000){if(fee===1000){tier='distant';fee=1500;}}
    }
    if(preview.district==='La Molina'){
      if(ev.verifiedSector && farSectors.has(normalizeLocation(ev.verifiedSector))){
        tier='very-distant';fee=2000;
      } else if(!ev.verifiedSector && km===undefined) {
        // La Molina can vary widely; avoid underpricing far inner sectors.
        return pending(preview,'pending-verification');
      }
    }
  }
  if(fee===null)return pending(preview,'manual-review');
  return Object.freeze({district:preview.district,province:preview.province,
    tier,feeMinor:fee,status:'quoted',payable:true,tariffVersion:TARIFF_VERSION});
}

/** Public and client-safe manifest: intentionally contains no dispatch address. */
export const PUBLIC_DELIVERY_POLICY = Object.freeze({
  originArea:PUBLIC_DISPATCH_AREA,
  tariffVersion:TARIFF_VERSION,
  neighboringDistricts:NEIGHBORING,
  pricesMinor:Object.freeze({adjacent:800,regular:1000,distant:1500,veryDistant:2000}),
  manualReviewDistricts:HUMAN_REVIEW,
  specialAreas:Object.freeze({laMolinaFarSectors:LA_MOLINA_FAR_SECTORS}),
});
