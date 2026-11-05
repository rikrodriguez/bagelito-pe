import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function respond(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8"}});
}
function text(value:unknown){return typeof value==="string"?value.trim():"";}
function extractOutputText(payload:any){
  const parts:string[]=[];
  for(const item of payload?.output??[]){
    if(item?.type!=="message") continue;
    for(const content of item?.content??[]){
      if(content?.type==="output_text"&&typeof content.text==="string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}
function normalizeEvaluatorScore(value:unknown){
  const n=Number(value);
  if(!Number.isFinite(n)) return null;
  const normalized=n>=0 && n<=5 ? n*20 : n;
  return Math.max(0,Math.min(100,Math.round(normalized)));
}

Deno.serve(async(req)=>{
  if(req.method==="GET") return respond({ok:true,function:"instagram-feedback-evaluate",autoAppliesLessons:false});
  if(req.method!=="POST") return respond({ok:false,error:"method_not_allowed"},405);

  const supabaseUrl=Deno.env.get("SUPABASE_URL")?.trim()??"";
  const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim()??"";
  const apiKey=Deno.env.get("OPENAI_API_KEY")?.trim()??"";
  const model=Deno.env.get("INSTAGRAM_AI_MODEL")?.trim()||"gpt-6-luna";
  if(!supabaseUrl||!serviceRole||!apiKey) return respond({ok:false,error:"configuration_missing"},503);

  const db=createClient(supabaseUrl,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
  const internalToken=req.headers.get("x-internal-token")?.trim()??"";
  const {data:tokenValid,error:tokenError}=await db.rpc(
    "verify_instagram_sales_internal_token",{p_token:internalToken}
  );
  if(tokenError||!tokenValid) return respond({ok:false,error:"unauthorized"},401);

  const body=await req.json().catch(()=>({}));
  const aiRunId=text(body?.ai_run_id);
  if(!/^[0-9a-f-]{36}$/i.test(aiRunId)) return respond({ok:false,error:"invalid_ai_run_id"},400);

  const {data:review,error:claimError}=await db
    .from("instagram_ai_feedback_reviews")
    .update({status:"processing",error_message:null})
    .eq("ai_run_id",aiRunId)
    .in("status",["pending","error"])
    .select("*")
    .maybeSingle();
  if(claimError) return respond({ok:false,error:"feedback_claim_failed"},500);
  if(!review) return respond({ok:true,duplicate:true});

  try{
    const {data:run,error:runError}=await db
      .from("instagram_ai_runs")
      .select("id,conversation_id,triggering_message_id,intent,language,confidence,proposed_reply,proposed_messages,proposed_media,human_final_reply,human_final_media,sales_stage,next_best_action,handoff_reason,facts_used,created_at,updated_at")
      .eq("id",aiRunId)
      .single();
    if(runError||!run) throw new Error("ai_run_lookup_failed");
    if(!text(run.human_final_reply)) throw new Error("human_reply_missing");

    const {data:messages,error:messagesError}=await db
      .from("instagram_messages")
      .select("direction,text_content,message_type,sent_at")
      .eq("conversation_id",run.conversation_id)
      .order("sent_at",{ascending:false})
      .limit(16);
    if(messagesError) throw new Error("conversation_context_failed");

    const recentMessages=[...(messages??[])].reverse();
    const instructions=[
      "You evaluate an AI draft against Dawn @ Bagelito's actual human reply for behavioral learning.",
      "This evaluator NEVER changes prompts, agent facts, prices, menu, availability, delivery, payment or customer state.",
      "Human text is evidence of Dawn's conversational choice, but any historical price, promo, payment method, availability or exception in the human reply must not become current operational truth.",
      "Assess behavior: latest-question handling, Dawn voice/format, sales progression, factual restraint, handoff judgment and media choice.",
      "Use a 0–100 scale for every score, not a 0–5 scale: 100=excellent, 80=good, 60=material improvement needed, 40=poor, 20=very poor, 0=failed.",
      "Do not reward the human merely for being human. The AI may be better or equally good.",
      "Classify why the reply differs. A wording difference alone can be style_only rather than a sales failure.",
      "A safe_lesson must be generalized behavioral guidance only. It must not contain customer names, phone numbers, addresses, historical prices, promo amounts, payment destinations or order-specific facts.",
      "Return JSON only matching the schema."
    ].join("\n");

    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json"},
      body:JSON.stringify({
        model,store:false,instructions,
        input:JSON.stringify({
          RECENT_MESSAGES:recentMessages,
          AI_DRAFT:{
            intent:run.intent,language:run.language,confidence:run.confidence,
            proposed_messages:run.proposed_messages,proposed_media:run.proposed_media,
            sales_stage:run.sales_stage,next_best_action:run.next_best_action,
            handoff_reason:run.handoff_reason,facts_used:run.facts_used
          },
          DAWN_ACTUAL:{
            text:run.human_final_reply,media:run.human_final_media
          }
        }),
        max_output_tokens:1200,
        text:{format:{
          type:"json_schema",name:"bagelito_feedback_review",strict:true,
          schema:{
            type:"object",additionalProperties:false,
            properties:{
              human_edit_type:{type:"string",enum:["exact","style_only","sales_strategy","factual_difference","safety_handoff","media","mixed"]},
              latest_question_score:{type:"integer",minimum:0,maximum:100},
              dawn_voice_score:{type:"integer",minimum:0,maximum:100},
              sales_progression_score:{type:"integer",minimum:0,maximum:100},
              factual_safety_score:{type:"integer",minimum:0,maximum:100},
              handoff_score:{type:"integer",minimum:0,maximum:100},
              media_score:{type:"integer",minimum:0,maximum:100},
              ai_better_or_equal:{type:"boolean"},
              behavioral_categories:{type:"array",maxItems:8,items:{type:"string",enum:["tone","format","latest_question","next_step","progressive_disclosure","objection","handoff","media","factuality","payment","other"]}},
              human_additions:{type:"array",maxItems:5,items:{type:"string"}},
              safe_lesson:{type:"string"}
            },
            required:["human_edit_type","latest_question_score","dawn_voice_score","sales_progression_score","factual_safety_score","handoff_score","media_score","ai_better_or_equal","behavioral_categories","human_additions","safe_lesson"]
          }
        }}
      })
    });
    const raw=await response.text();
    if(!response.ok) throw new Error(`openai_${response.status}:${raw.slice(0,500)}`);
    const output=extractOutputText(JSON.parse(raw));
    if(!output) throw new Error("feedback_output_empty");
    const evaluation=JSON.parse(output);
    const scores=[
      normalizeEvaluatorScore(evaluation.latest_question_score),
      normalizeEvaluatorScore(evaluation.dawn_voice_score),
      normalizeEvaluatorScore(evaluation.sales_progression_score),
      normalizeEvaluatorScore(evaluation.factual_safety_score),
      normalizeEvaluatorScore(evaluation.handoff_score),
      normalizeEvaluatorScore(evaluation.media_score)
    ].filter((v):v is number=>v!==null);
    const overall=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null;

    const {error:updateError}=await db
      .from("instagram_ai_feedback_reviews")
      .update({
        status:"completed",
        human_edit_type:evaluation.human_edit_type,
        latest_question_score:normalizeEvaluatorScore(evaluation.latest_question_score),
        dawn_voice_score:normalizeEvaluatorScore(evaluation.dawn_voice_score),
        sales_progression_score:normalizeEvaluatorScore(evaluation.sales_progression_score),
        factual_safety_score:normalizeEvaluatorScore(evaluation.factual_safety_score),
        handoff_score:normalizeEvaluatorScore(evaluation.handoff_score),
        media_score:normalizeEvaluatorScore(evaluation.media_score),
        overall_score:overall,
        ai_better_or_equal:Boolean(evaluation.ai_better_or_equal),
        behavioral_categories:Array.isArray(evaluation.behavioral_categories)?evaluation.behavioral_categories:[],
        human_additions:Array.isArray(evaluation.human_additions)?evaluation.human_additions:[],
        safe_lesson:text(evaluation.safe_lesson).slice(0,1200),
        evaluator_model:model,
        evaluated_at:new Date().toISOString(),
        error_message:null
      })
      .eq("ai_run_id",aiRunId);
    if(updateError) throw new Error(`feedback_store_failed:${updateError.message}`);

    return respond({ok:true,aiRunId,overallScore:overall,editType:evaluation.human_edit_type});
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    await db.from("instagram_ai_feedback_reviews")
      .update({status:"error",error_message:message.slice(0,1200)})
      .eq("ai_run_id",aiRunId);
    console.error("instagram_feedback_evaluation_failed",message);
    return respond({ok:false,error:"feedback_evaluation_failed"},500);
  }
});
