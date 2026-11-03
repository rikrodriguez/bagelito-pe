type Bagel = {id: string; name: string}

/** A view of the existing selection, never a second cart or order state. */
export function SelectionBox({bagels, counts, target, singleFlavor = false, onRemove}: {
  bagels: Bagel[]
  counts: Record<string, number>
  target: number
  singleFlavor?: boolean
  onRemove: (id: string) => void
}) {
  const selected = bagels.flatMap(bagel => Array.from({length: counts[bagel.id] || 0}, () => bagel))
  return <aside className="boutique-selection-box" aria-label="Tu caja de bagels">
    <div className="boutique-box-heading"><strong>Tu caja</strong><span role="status" aria-live="polite" aria-atomic="true">{selected.length} de {target} elegidos</span></div>
    <div className="boutique-box-tray" data-large={target > 12 ? 'true' : 'false'}>
      {Array.from({length: target}, (_, index) => {
        const bagel = selected[index]
        return bagel && singleFlavor ? <span key={index} className="boutique-box-slot is-filled" aria-hidden="true">
          <img src={`/images/bagel-${bagel.id}.webp`} alt="" width={72} height={72} />
        </span> : bagel ? <button type="button" key={index} className="boutique-box-slot is-filled" onClick={() => onRemove(bagel.id)} aria-label={`Sacar ${bagel.name} de la caja`}>
          <img src={`/images/bagel-${bagel.id}.webp`} alt="" width={72} height={72} /><span aria-hidden="true">−</span>
        </button> : <span key={index} className="boutique-box-slot is-empty" aria-hidden="true"><i /></span>
      })}
    </div>
    {singleFlavor && selected.length > 0 && <button type="button" className="boutique-box-clear" onClick={() => onRemove(selected[0].id)}>Vaciar caja de {selected.length} bagels</button>}
    <p>{selected.length === target ? 'Tu caja está lista. Sigue para elegir tu schmear.' : 'Toca un bagel de la vitrina para sumarlo.'}</p>
  </aside>
}
