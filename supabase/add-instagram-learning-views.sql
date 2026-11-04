create or replace view public.instagram_ai_feedback_examples
with (security_invoker = true)
as
select
  r.id as ai_run_id,
  r.conversation_id,
  r.triggering_message_id,
  m.text_content as latest_customer_message,
  r.intent,
  r.language,
  r.confidence,
  r.sales_stage,
  r.next_best_action,
  r.handoff_reason,
  r.proposed_reply,
  r.proposed_messages,
  r.proposed_media,
  r.human_final_reply,
  r.human_final_media,
  r.voice_score,
  r.voice_pass,
  r.status,
  r.execution_mode,
  r.created_at,
  r.sales_enriched_at
from public.instagram_ai_runs r
left join public.instagram_messages m
  on m.id = r.triggering_message_id
where r.status in ('approved','edited')
  and (
    nullif(trim(coalesce(r.human_final_reply,'')), '') is not null
    or jsonb_array_length(coalesce(r.human_final_media,'[]'::jsonb)) > 0
  );

create or replace view public.instagram_ai_quality_summary
with (security_invoker = true)
as
select
  coalesce(intent,'unknown') as intent,
  coalesce(sales_stage,'unknown') as sales_stage,
  coalesce(next_best_action,'unknown') as next_best_action,
  count(*)::integer as total_runs,
  count(*) filter (where status = 'approved')::integer as approved_count,
  count(*) filter (where status = 'edited')::integer as edited_count,
  count(*) filter (where status = 'sent')::integer as sent_count,
  count(*) filter (where status = 'error')::integer as error_count,
  round(avg(voice_score)::numeric, 1) as average_voice_score,
  round(
    100.0 * avg(case when voice_pass is true then 1.0 else 0.0 end)::numeric,
    1
  ) as voice_pass_rate,
  round(
    100.0 * avg(case when status = 'edited' then 1.0 else 0.0 end)::numeric,
    1
  ) as human_edit_rate,
  max(created_at) as latest_run_at
from public.instagram_ai_runs
group by
  coalesce(intent,'unknown'),
  coalesce(sales_stage,'unknown'),
  coalesce(next_best_action,'unknown');

revoke all on public.instagram_ai_feedback_examples from anon, authenticated;
revoke all on public.instagram_ai_quality_summary from anon, authenticated;
grant select on public.instagram_ai_feedback_examples to service_role;
grant select on public.instagram_ai_quality_summary to service_role;
