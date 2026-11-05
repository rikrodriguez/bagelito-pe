alter table public.instagram_runtime_settings
add column if not exists sales_judge_enabled boolean not null default true,
add column if not exists sales_judge_min_score integer not null default 85
  check (sales_judge_min_score between 0 and 100);

create table if not exists public.instagram_sales_judge_reviews (
  ai_run_id uuid primary key references public.instagram_ai_runs(id) on delete cascade,
  status text not null default 'completed'
    check (status in ('completed','error')),
  pass boolean not null default false,
  overall_score integer check (overall_score is null or overall_score between 0 and 100),
  latest_question_score integer check (latest_question_score is null or latest_question_score between 0 and 100),
  sales_progression_score integer check (sales_progression_score is null or sales_progression_score between 0 and 100),
  factual_safety_score integer check (factual_safety_score is null or factual_safety_score between 0 and 100),
  handoff_score integer check (handoff_score is null or handoff_score between 0 and 100),
  dawn_voice_score integer check (dawn_voice_score is null or dawn_voice_score between 0 and 100),
  pressure_safety_score integer check (pressure_safety_score is null or pressure_safety_score between 0 and 100),
  issues jsonb not null default '[]'::jsonb,
  recommended_action text
    check (recommended_action is null or recommended_action in ('send','hold','human_review','regenerate')),
  rationale text,
  evaluator_model text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.instagram_sales_judge_reviews enable row level security;
revoke all on public.instagram_sales_judge_reviews from anon, authenticated;
grant select, insert, update, delete on public.instagram_sales_judge_reviews to service_role;

create or replace function public.instagram_sales_judge_touch_updated_at()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

drop trigger if exists instagram_sales_judge_touch_updated_at
on public.instagram_sales_judge_reviews;
create trigger instagram_sales_judge_touch_updated_at
before update on public.instagram_sales_judge_reviews
for each row execute function public.instagram_sales_judge_touch_updated_at();

create or replace view public.instagram_sales_judge_summary
with (security_invoker=true)
as
select
  a.intent,
  a.sales_stage,
  count(*)::integer as reviewed_runs,
  count(*) filter (where j.pass)::integer as passed_runs,
  round(avg(j.overall_score),1) as average_overall_score,
  round(avg(j.latest_question_score),1) as average_latest_question_score,
  round(avg(j.sales_progression_score),1) as average_sales_progression_score,
  round(avg(j.factual_safety_score),1) as average_factual_safety_score,
  round(avg(j.handoff_score),1) as average_handoff_score,
  round(avg(j.dawn_voice_score),1) as average_dawn_voice_score,
  round(avg(j.pressure_safety_score),1) as average_pressure_safety_score
from public.instagram_sales_judge_reviews j
join public.instagram_ai_runs a on a.id=j.ai_run_id
where j.status='completed'
group by a.intent,a.sales_stage;

revoke all on public.instagram_sales_judge_summary from anon, authenticated;
grant select on public.instagram_sales_judge_summary to service_role;
