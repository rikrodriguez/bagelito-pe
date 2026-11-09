/** Bagelito — Lima Metropolitana/Callao delivery: server-only pricing policy.
 * Source: user-approved territory 2026-11-06; rates NOT approved.
 * Do NOT replace this with straight-line distance or a hard-coded S/10/S/15.
 */
export type Province = "Lima" | "Callao";
export const LIMA_DISTRICTS = Object.freeze(["Lima", "Ancón", "Ate", "Barranco", "Breña", "Carabayllo", "Chaclacayo", "Chorrillos", "Cieneguilla", "Comas", "El Agustino", "Independencia", "Jesús María", "La Molina", "La Victoria", "Lince", "Los Olivos", "Lurigancho", "Lurín", "Magdalena del Mar", "Miraflores", "Pachacámac", "Pucusana", "Pueblo Libre", "Puente Piedra", "Punta Hermosa", "Punta Negra", "Rímac", "San Bartolo", "San Borja", "San Isidro", "San Juan de Lurigancho", "San Juan de Miraflores", "San Luis", "San Martín de Porres", "San Miguel", "Santa Anita", "Santa María del Mar", "Santa Rosa", "Santiago de Surco", "Surquillo", "Villa El Salvador", "Villa María del Triunfo"]) as readonly string[];
export const CALLAO_DISTRICTS = Object.freeze(["Callao", "Bellavista", "Carmen de la Legua Reynoso", "La Perla", "La Punta", "Ventanilla", "Mi Perú"]) as readonly string[];
export const LA_MOLINA_PRIORITY_AREAS = Object.freeze(["El Sol de La Molina", "Las Lagunas de La Molina", "La Planicie"]) as readonly string[];
export const DELIVERY_ORIGIN_DISTRICT = "Lince" as const;
export type DeliveryCoverage = {district:string;province:Province;coverageIntent:"route-quote-required"};
export type RateBracket = Readonly<{upToMeters:number;feeMinor:number}>;
export type ApprovedRateTable = Readonly<{originId:string;approvalId:string;brackets:readonly RateBracket[];maxRouteSeconds?:number}>;
export type VerifiedRoutingEvidence = Readonly<{source:"trusted-server-routing";originId:string;destinationDistrict:string;distanceMeters:number;durationSeconds:number;resolvedFullAddress:string}>;
export type MetroDeliveryQuote = Readonly<{status:"pending-address"|"pending-route"|"pending-rates"|"manual-review"|"quoted";district:string;province:Province;feeMinor:number|null;routeMeters:number|null;durationSeconds:number|null;canIncludeInCheckout:boolean}>;
export class DeliveryPolicyError extends Error{constructor(message:string){super(message);this.name="DeliveryPolicyError";}}
export function normalizeLocation(value:unknown):string{if(typeof value!=="string")return "";return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().replace(/\s+/g," ").toLocaleLowerCase("es-PE");}
const ALIASES:Readonly<Record<string,string>>=Object.freeze({
  "cercado de lima":"Lima", "lima centro":"Lima", "centro de lima":"Lima", "surco":"Santiago de Surco", "smp":"San Martín de Porres", "sjl":"San Juan de Lurigancho", "chosica":"Lurigancho", "lurigancho chosica":"Lurigancho", "magdalena":"Magdalena del Mar", "callao cercado":"Callao", "carmen de la legua":"Carmen de la Legua Reynoso"
});
const INDEX = new Map<string,DeliveryCoverage>();
for(const [province,districts] of [["Lima",LIMA_DISTRICTS],["Callao",CALLAO_DISTRICTS]] as const){for(const district of districts){const key=normalizeLocation(district);if(INDEX.has(key))throw new Error("Duplicate delivery region");INDEX.set(key,{district,province,coverageIntent:"route-quote-required"});}}
export function locateDistrict(value:unknown):DeliveryCoverage|null{const key=normalizeLocation(value);if(!key)return null;return INDEX.get(normalizeLocation(ALIASES[key]??key))??null;}
export function validateRateTable(table:ApprovedRateTable):void {
 if(!table||typeof table!=="object"||typeof table.originId!=="string"||table.originId.trim().length<2||typeof table.approvalId!=="string"||table.approvalId.trim().length<3)throw new DeliveryPolicyError("Tarifario sin origen o aprobación verificable.");
 if(!Array.isArray(table.brackets)||table.brackets.length<2||table.brackets.length>100)throw new DeliveryPolicyError("Tarifario no calibrado; definir al menos dos distancias aprobadas.");
 let prevDist=0,prevFee=-1;
 for(const band of table.brackets){if(!band||!Number.isSafeInteger(band.upToMeters)||band.upToMeters<=prevDist||!Number.isSafeInteger(band.feeMinor)||band.feeMinor<0||band.feeMinor<prevFee)throw new DeliveryPolicyError("Escalas de distancia o importes inválidos.");prevDist=band.upToMeters;prevFee=band.feeMinor;}
 if(table.maxRouteSeconds!==undefined&&(!Number.isSafeInteger(table.maxRouteSeconds)||table.maxRouteSeconds<=0))throw new DeliveryPolicyError("Límite de duración inválido.");
}
export function quoteMetropolitanDelivery(input:Readonly<{district:unknown;fullAddress:unknown;route?:VerifiedRoutingEvidence|null}>,rates:ApprovedRateTable|null):MetroDeliveryQuote {
 const area=locateDistrict(input.district);if(!area)throw new DeliveryPolicyError("Selecciona un distrito válido de Lima Metropolitana o Callao.");
 const pending=(status:MetroDeliveryQuote["status"],r?:VerifiedRoutingEvidence|null):MetroDeliveryQuote=>({status,district:area.district,province:area.province,feeMinor:null,routeMeters:r?.distanceMeters??null,durationSeconds:r?.durationSeconds??null,canIncludeInCheckout:false});
 if(typeof input.fullAddress!=="string"||input.fullAddress.trim().length<8)return pending("pending-address");
 if(!input.route)return pending("pending-route");
 const route=input.route;
 if(route.source!=="trusted-server-routing"||typeof route.resolvedFullAddress!=="string"||route.resolvedFullAddress.trim().length<8||!locateDistrict(route.destinationDistrict)||locateDistrict(route.destinationDistrict)?.district!==area.district||!Number.isSafeInteger(route.distanceMeters)||route.distanceMeters<=0||!Number.isSafeInteger(route.durationSeconds)||route.durationSeconds<=0)throw new DeliveryPolicyError("Ruta no verificada o inconsistente con el distrito del cliente.");
 if(!rates)return pending("pending-rates",route);
 validateRateTable(rates);
 if(route.originId!==rates.originId)throw new DeliveryPolicyError("Origen de ruta diferente al local autorizado.");
 if(rates.maxRouteSeconds!==undefined&&route.durationSeconds>rates.maxRouteSeconds)return pending("manual-review",route);
 const fee=rates.brackets.find(b=>route.distanceMeters<=b.upToMeters)?.feeMinor;
 if(fee===undefined)return pending("manual-review",route);
 return {status:"quoted",district:area.district,province:area.province,feeMinor:fee,routeMeters:route.distanceMeters,durationSeconds:route.durationSeconds,canIncludeInCheckout:true};
}
/* SECURITY: VerifiedRoutingEvidence must be created in a server function after Google Routes/other trusted provider verification. Client JSON is not trusted merely because it matches this type.*/
