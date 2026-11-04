create or replace view public.instagram_sales_judge_calibration
with (security_invoker=true)
as
select
  a.intent,
  a.sales_stage,
  j.pass as judge_pass,
  count(*)::integer as reviewed_runs,
  count(*) filter (where a.status='edited')::integer as human_edited_count,
  count(*) filter (where a.status='approved')::integer as human_approved_count,
  count(*) filter (
    where j.pass=true
      and a.status='edited'
      and coalesce(f.human_edit_type,'') in ('sales_strategy','factual_difference','safety_handoff','mixed')
  )::integer as judge_pass_but_human_edited,
  count(*) filter (
    where j.pass=false
      and f.ai_better_or_equal=true
  )::integer as judge_hold_but_ai_better_or_equal,
  round(avg(j.overall_score),1) as average_judge_score,
  round(avg(f.overall_score),1) as average_human_feedback_score,
  round(avg(f.sales_progression_score),1) as average_feedback_sales_progression,
  round(avg(f.factual_safety_score),1) as average_feedback_factual_safety,
  round(avg(f.handoff_score),1) as average_feedback_handoff
from public.instagram_sales_judge_reviews j
join public.instagram_ai_runs a on a.id=j.ai_run_id
left join public.instagram_ai_feedback_reviews f
  on f.ai_run_id=j.ai_run_id and f.status='completed'
where j.status='completed'
group by a.intent,a.sales_stage,j.pass;

create or replace view public.instagram_sales_judge_misses
with (security_invoker=true)
as
select
  j.ai_run_id,
  a.intent,
  a.sales_stage,
  a.next_best_action,
  a.status as ai_run_status,
  j.overall_score as judge_score,
  j.issues as judge_issues,
  j.recommended_action,
  f.human_edit_type,
  f.overall_score as human_feedback_score,
  f.sales_progression_score,
  f.factual_safety_score,
  f.handoff_score,
  f.behavioral_categories,
  f.safe_lesson,
  f.evaluated_at
from public.instagram_sales_judge_reviews j
join public.instagram_ai_runs a on a.id=j.ai_run_id
join public.instagram_ai_feedback_reviews f
  on f.ai_run_id=j.ai_run_id and f.status='completed'
where j.status='completed'
  and (
    (j.pass=true and a.status='edited'
      and f.human_edit_type in ('sales_strategy','factual_difference','safety_handoff','mixed'))
    or
    (j.pass=false and f.ai_better_or_equal=true)
  )
order by coalesce(f.evaluated_at,a.updated_at) desc;

revoke all on public.instagram_sales_judge_calibration from anon, authenticated;
revoke all on public.instagram_sales_judge_misses from anon, authenticated;
grant select on public.instagram_sales_judge_calibration to service_role;
grant select on public.instagram_sales_judge_misses to service_role;
