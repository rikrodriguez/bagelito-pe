"use client";

import { useState } from "react";

type Resolution =
  | "approved_standard_pricing"
  | "declined_continue_standard"
  | "resume_standard_flow"
  | "resolved_no_resume";

export function InstagramHandoffActions({
  draftId,
  reason,
  customRequest,
}:{
  draftId:string;
  reason:string|null;
  customRequest:string|null;
}){
  const [loading,setLoading]=useState<Resolution|null>(null);
  const [error,setError]=useState<string|null>(null);

  async function resolve(resolution:Resolution){
    setLoading(resolution);
    setError(null);
    try{
      const response=await fetch(`/api/admin/instagram/orders/${draftId}/resolve-handoff`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({resolution,resolvedBy:"Bagelito admin"}),
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||!payload.ok){
        setError(payload.error||"No se pudo resolver el handoff.");
        return;
      }
      window.location.reload();
    }catch{
      setError("No se pudo resolver el handoff.");
    }finally{
      setLoading(null);
    }
  }

  const custom=reason==="custom_feasibility";
  return (
    <div className="admin-safety-card">
      <div>
        <span>Human review</span>
        <strong>{reason?.replaceAll("_"," ")||"Review required"}</strong>
        {customRequest?<p>Solicitud: {customRequest}</p>:null}
        <p>La IA permanece fuera hasta que una persona resuelva explícitamente este caso.</p>
        <div className="admin-inline-actions">
          {custom?(
            <>
              <button className="pill-button mint" disabled={Boolean(loading)} onClick={()=>resolve("approved_standard_pricing")} type="button">
                {loading==="approved_standard_pricing"?"Guardando…":"Aprobar · precio estándar"}
              </button>
              <button className="pill-button" disabled={Boolean(loading)} onClick={()=>resolve("declined_continue_standard")} type="button">
                {loading==="declined_continue_standard"?"Guardando…":"No se puede · seguir estándar"}
              </button>
            </>
          ):(
            <button className="pill-button mint" disabled={Boolean(loading)} onClick={()=>resolve("resume_standard_flow")} type="button">
              {loading==="resume_standard_flow"?"Guardando…":"Resuelto · devolver a IA"}
            </button>
          )}
          <button className="pill-button" disabled={Boolean(loading)} onClick={()=>resolve("resolved_no_resume")} type="button">
            {loading==="resolved_no_resume"?"Guardando…":"Marcar resuelto · mantener humano"}
          </button>
        </div>
        {error?<small>{error}</small>:null}
      </div>
    </div>
  );
}
