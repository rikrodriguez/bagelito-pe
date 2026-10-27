"use client";

import { useRef } from "react";
import { BookOpen, X } from "lucide-react";
import menu from "@/data/verified-menu-reference.json";
import type { VisitCategory } from "@/lib/photo-visit";

type Props = { category: VisitCategory; locale: "es" | "en" };

/** Reference menu only. It never changes a cart, price calculation, order or payment. */
export function VerifiedMenu({ category, locale }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const es = locale === "es";
  const title = category === "packs" ? "Packs" : category === "combos" ? "Combos" : "Schmears";
  const close = () => { dialog.current?.close(); trigger.current?.focus(); };
  const open = () => { if (!dialog.current?.open) dialog.current?.showModal(); };
  return <div className="pv-menu-reference">
    <button ref={trigger} className="pv-menu-trigger" type="button" aria-haspopup="dialog" onClick={open}>
      <BookOpen size={15} aria-hidden="true" />{es ? "Ver carta de " : "View "}{title}
    </button>
    <dialog ref={dialog} className="pv-menu-dialog" aria-labelledby="pv-menu-title" onClose={() => trigger.current?.focus()}
      onClick={(event) => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } }}>
      <div className="pv-menu-heading"><div><span>BAGELITO / {es ? "CARTA" : "MENU"}</span><h2 id="pv-menu-title">{title}</h2></div>
        <button type="button" className="pv-menu-close" aria-label={es ? "Cerrar carta" : "Close menu"} onClick={close} autoFocus><X size={21} /></button>
      </div>
      <div className="pv-menu-content">
        {category === "packs" && <>
          <p>{es ? "Bagels de tamaño regular" : "Regular-size bagels"}</p>
          <dl className="pv-menu-prices">{menu.packs.map(p => <div key={p.id}><dt>{p.units} bagels · {p.flavorMode === "mixed" ? (es ? "sabores mixtos" : "mixed flavors") : (es ? "un sabor" : "one flavor")}</dt><dd>S/{p.price}</dd></div>)}</dl>
          <h3>Mini bagels</h3><dl className="pv-menu-prices">{menu.miniPacks.map(p => <div key={p.units}><dt>{p.units} mini bagels<small>{es ? "Mixtos / un sabor" : "Mixed / one flavor"}</small></dt><dd>S/{p.mixed} / S/{p.single}</dd></div>)}</dl>
          <p className="pv-menu-note">{es ? "Mini bagels y colores personalizados están registrados en la carta; su configuración no forma parte de este tramo." : "Mini bagels and custom colors are recorded in the menu; configuring them is outside this stage."}</p>
        </>}
        {category === "combos" && <>
          <p>{es ? "Bagels mixtos + schmears. Sin bebida ni sándwich." : "Mixed bagels + schmears. No drink or sandwich included."}</p>
          <dl className="pv-menu-prices">{menu.combos.map(c => <div key={c.id}><dt>{c.name}<small>{c.bagels} {es ? "bagels mixtos" : "mixed bagels"} + {c.schmearCount} {c.schmearCount === 1 ? "schmear" : "schmears"} · {c.schmearGrams} g {es ? "c/u" : "each"}</small></dt><dd>S/{c.price}</dd></div>)}</dl>
          <p className="pv-menu-note">{es ? "Aquí revisas las opciones reales. La elección de sabores dentro del combo se implementará en su tramo correspondiente." : "These are the actual menu options. Flavor selection within a combo belongs to the next implementation stage."}</p>
        </>}
        {category === "schmears" && <>
          <p>{es ? "Cinco sabores de la carta adjunta" : "Five flavors from the supplied menu"}</p>
          <ul className="pv-menu-flavors">{menu.schmears.map(s => <li key={s.id}>{s.name}</li>)}</ul>
          <div className="pv-menu-table-scroll"><table><caption>{es ? "Precio por tarrina" : "Price per tub"}</caption><thead><tr><th scope="col">{es ? "Tamaño" : "Size"}</th><th scope="col">Original</th><th scope="col">{es ? "Saborizado" : "Flavored"}</th></tr></thead><tbody>{menu.schmearSizes.map(s => <tr key={s.grams}><th scope="row">{s.grams} g<small>{s.name}</small></th><td>S/{s.original}</td><td>S/{s.flavored}</td></tr>)}</tbody></table></div>
          <p className="pv-menu-note">{es ? "Herbs & Roasted Garlic, Ají Amarillo, Honey Cinnamon y Classic Strawberry corresponden a la columna Saborizado." : "Herbs & Roasted Garlic, Ají Amarillo, Honey Cinnamon and Classic Strawberry use the Flavored column."}</p>
        </>}
      </div>
      <p className="pv-menu-disclaimer">{es ? "Carta de referencia · Esta preview no crea pedidos ni cobra." : "Reference menu · This preview creates no orders or charges."}</p>
    </dialog>
  </div>;
}
