const trays = [
  {id:'plain',name:'Plain',x:216,y:361},
  {id:'everything',name:'Everything',x:481,y:361},
  {id:'sesame',name:'Sesame',x:747,y:361},
  {id:'classic-onion',name:'Classic Onion',x:1014,y:361},
  {id:'jalapeno-cheddar',name:'Jalapeño Cheddar',x:192,y:567},
  {id:'cheddar',name:'Cheddar',x:480,y:567},
  {id:'cinnamon-raisin',name:'Cinnamon Raisin',x:746,y:567},
  {id:'blueberry',name:'Blueberry',x:1021,y:567},
]

/** Each product tray is a real button over the photographic display. */
export function BagelVitrine({counts,onAdd}: {counts:Record<string,number>;onAdd:(id:string)=>void}) {
  return <div className="boutique-live-vitrine">
    <div className="boutique-live-glass">
      <svg className="boutique-live-photo" viewBox="0 169 1165 493" aria-hidden="true">
        <image href="/images/rebuilt-aligned-counter.webp" width="2020" height="778" />
        {trays.map((tray,index)=><text key={tray.id} x={tray.x} y={tray.y+9} textAnchor="middle" className="boutique-tray-number">{String(index+1).padStart(2,'0')}</text>)}
      </svg>
      <div className="boutique-tray-hotspots">
        {trays.map(tray=><button type="button" key={tray.id} data-bagel-id={tray.id} data-selected={!!counts[tray.id]}
          onClick={()=>onAdd(tray.id)} aria-label={'Agregar '+tray.name}>
          <span className="boutique-tray-badge" aria-hidden="true">{counts[tray.id] || '+'}</span>
        </button>)}
      </div>
    </div>
    <div className="boutique-live-legend" aria-label="Sabores de la vitrina">
      {trays.map((tray,index)=><span key={tray.id}><i>{String(index+1).padStart(2,'0')}</i><span>{tray.name}</span>{counts[tray.id] > 0 && <b>{counts[tray.id]}</b>}</span>)}
    </div>
  </div>
}
