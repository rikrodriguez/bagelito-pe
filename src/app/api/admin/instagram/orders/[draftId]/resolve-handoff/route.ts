import { NextRequest, NextResponse } from "next/server";
import { createAdminToken, getAdminCookieName } from "@/lib/admin/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowed=new Set([
  "approved_standard_pricing",
  "declined_continue_standard",
  "resume_standard_flow",
  "resolved_no_resume",
]);

function isAuthorized(request:NextRequest){
  const expected=createAdminToken();
  const actual=request.cookies.get(getAdminCookieName())?.value??"";
  return Boolean(expected)&&actual===expected;
}

export async function POST(
  request:NextRequest,
  context:{params:Promise<{draftId:string}>},
){
  if(!isAuthorized(request)){
    return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  }
  const {draftId}=await context.params;
  if(!uuidPattern.test(draftId)){
    return NextResponse.json({ok:false,error:"invalid_draft_id"},{status:400});
  }
  const body=await request.json().catch(()=>({}));
  const resolution=typeof body?.resolution==="string"?body.resolution.trim():"";
  if(!allowed.has(resolution)){
    return NextResponse.json({ok:false,error:"invalid_resolution"},{status:400});
  }
  const resolvedBy=typeof body?.resolvedBy==="string"&&body.resolvedBy.trim()
    ?body.resolvedBy.trim().slice(0,120)
    :"Bagelito admin";

  const supabase=createSupabaseAdminClient();
  const {data,error}=await supabase.rpc("resolve_instagram_sales_handoff",{
    p_draft_id:draftId,
    p_resolution:resolution,
    p_resolved_by:resolvedBy,
  });
  if(error){
    const known=["draft_not_found","invalid_handoff_resolution"].some(code=>error.message.includes(code));
    return NextResponse.json(
      {ok:false,error:error.message.split(":")[0]},
      {status:known?409:500},
    );
  }
  return NextResponse.json(
    {ok:true,resolution:data},
    {headers:{"Cache-Control":"no-store"}},
  );
}
