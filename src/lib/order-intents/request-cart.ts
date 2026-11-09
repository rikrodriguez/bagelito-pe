/** Client-side cart mapping for nonpayable, manually reviewed requests.
 * Validation is repeated authoritatively in the server contract.
 */
import {
  ALLOWED_PACKS, ALLOWED_SCHMEARS, REVIEW_ONLY_CATEGORIES,
  type IntentLine,
} from "./contract.js";

const ALL = new Set<string>([...ALLOWED_PACKS,...ALLOWED_SCHMEARS,...REVIEW_ONLY_CATEGORIES]);
const CORE = new Set(["plain","everything","sesame","classic-onion","jalapeno-cheddar",
  "cheddar","cinnamon-raisin","blueberry"]);
const MINI_EXCLUDED = new Set(["jalapeno-cheddar","cheddar"]);

export function buildRequestCartLine(
  sku: string,
  quantity: number,
  flavors: Record<string,number>,
  schmearFlavor: string,
): IntentLine {
  if(!ALL.has(sku) || !Number.isSafeInteger(quantity) || quantity<1 || quantity>20)
    throw new TypeError("Selecciona un producto y cantidad válida.");
  if(sku.startsWith("pack-")){
    const count=Number(sku.match(/^pack-(?:grande|mini)-(6|12|24)-/)?.[1] ?? 0);
    const composition=Object.entries(flavors).filter(([,n])=>n>0).map(([flavor,n])=>{
      if(!CORE.has(flavor)||!Number.isSafeInteger(n)||n>count||
        (sku.startsWith("pack-mini-")&&MINI_EXCLUDED.has(flavor)))
        throw new TypeError("Sabor o cantidad no autorizado para este pack.");
      return {flavor,quantity:n};
    });
    const total=composition.reduce((sum,line)=>sum+line.quantity,0);
    if(total!==count ||
      (sku.endsWith("-mixto")&&composition.length<2) ||
      (sku.endsWith("-un-sabor")&&composition.length!==1))
      throw new TypeError(`Distribuye exactamente ${count} bagels según el tipo de pack.`);
    return {sku,quantity,flavors:composition};
  }
  if(sku.startsWith("schmear-")&&sku.endsWith("saborizado")){
    const slug=schmearFlavor.trim().toLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"-");
    if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug))
      throw new TypeError("Indica un sabor válido de schmear para revisión.");
    return {sku,quantity,schmearFlavor:slug};
  }
  return {sku,quantity};
}

export function appendRequestCartLine(cart: readonly IntentLine[],line:IntentLine):IntentLine[] {
  if(cart.length>=20 || cart.some(item=>JSON.stringify(item)===JSON.stringify(line)))
    throw new TypeError("La solicitud está completa o contiene un producto duplicado.");
  const units=cart.reduce((sum,item)=>sum+item.quantity,0)+line.quantity;
  if(units>40)throw new TypeError("Máximo 40 packs o unidades por solicitud.");
  return [...cart,line];
}
