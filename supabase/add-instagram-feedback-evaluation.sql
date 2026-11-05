create table if not exists public.instagram_ai_feedback_reviews (
  ai_run_id uuid primary key references public.instagram_ai_runs(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','processing','completed','error')),
  human_edit_type text
    check (human_edit_type is null or human_edit_type in (
      'exact','style_only','sales_strategy','factual_difference',
      'safety_handoff','media','mixed'
    )),
  latest_question_score integer check (latest_question_score is null or latest_question_score between 0 and 100),
  dawn_voice_score integer check (dawn_voice_score is null or dawn_voice_score between 0 and 100),
  sales_progression_score integer check (sales_progression_score is null or sales_progression_score between 0 and 100),
  factual_safety_score integer check (factual_safety_score is null or factual_safety_score between 0 and 100),
  handoff_score integer check (handoff_score is null or handoff_score between 0 and 100),
  media_score integer check (media_score is null or media_score between 0 and 100),
  overall_score numeric(5,2) check (overall_score is null or overall_score between 0 and 100),
  ai_better_or_equal boolean,
  behavioral_categories jsonb not null default '[]'::jsonb,
  human_additions jsonb not null default '[]'::jsonb,
  safe_lesson text,
  evaluator_model text,
  error_message text,
  evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.instagram_ai_feedback_reviews enable row level security;
revoke all on public.instagram_ai_feedback_reviews from anon, authenticated;
grant select, insert, update, delete on public.instagram_ai_feedback_reviews to service_role;

create index if not exists instagram_ai_feedback_reviews_status_idx
  on public.instagram_ai_feedback_reviews(status, updated_at)
  where status in ('pending','error');

create or replace function public.instagram_feedback_reviews_touch_updated_at()
returns trigger language plpgsql set search_path=public
as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

drop trigger if exists instagram_ai_feedback_reviews_touch_updated_at
on public.instagram_ai_feedback_reviews;
create trigger instagram_ai_feedback_reviews_touch_updated_at
before update on public.instagram_ai_feedback_reviews
for each row execute function public.instagram_feedback_reviews_touch_updated_at();

create or replace function public.notify_instagram_feedback_evaluation()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_token text;
  v_request_id bigint;
begin
  if new.human_final_reply is null
     or new.status not in ('edited','approved') then
    return new;
  end if;

  if old.human_final_reply is not distinct from new.human_final_reply
     and old.human_final_media is not distinct from new.human_final_media
     and old.status is not distinct from new.status then
    return new;
  end if;

  insert into public.instagram_ai_feedback_reviews(ai_run_id,status,error_message)
  values(new.id,'pending',null)
  on conflict(ai_run_id) do update
    set status='pending',
        error_message=null,
        updated_at=now();

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name='instagram_sales_internal_token'
  limit 1;

  if v_token is null then
    return new;
  end if;

  select net.http_post(
    url := 'https://enqpahoanbthnkrxfnxf.supabase.co/functions/v1/instagram-feedback-evaluate',
    headers := jsonb_build_object(
      'content-type','application/json',
      'x-internal-token',v_token
    ),
    body := jsonb_build_object('ai_run_id',new.id),
    timeout_milliseconds := 8000
  ) into v_request_id;

  return new;
exception when others then
  raise warning 'instagram_feedback_evaluation_notify_failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists instagram_ai_runs_notify_feedback_evaluation
on public.instagram_ai_runs;
create trigger instagram_ai_runs_notify_feedback_evaluation
after update of human_final_reply, human_final_media, status
on public.instagram_ai_runs
for each row execute function public.notify_instagram_feedback_evaluation();

create or replace view public.instagram_feedback_learning_summary
with (security_invoker = true)
as
select
  r.human_edit_type,
  a.intent,
  a.sales_stage,
  count(*)::integer as reviewed_runs,
  round(avg(r.overall_score),1) as average_overall_score,
  round(avg(r.latest_question_score),1) as average_latest_question_score,
  round(avg(r.dawn_voice_score),1) as average_dawn_voice_score,
  round(avg(r.sales_progression_score),1) as average_sales_progression_score,
  round(avg(r.factual_safety_score),1) as average_factual_safety_score,
  count(*) filter (where r.ai_better_or_equal=true)::integer as ai_better_or_equal_count
from public.instagram_ai_feedback_reviews r
join public.instagram_ai_runs a on a.id=r.ai_run_id
where r.status='completed'
group by r.human_edit_type,a.intent,a.sales_stage;

revoke all on public.instagram_feedback_learning_summary from anon, authenticated;
grant select on public.instagram_feedback_learning_summary to service_role;

revoke all on function public.notify_instagram_feedback_evaluation()
from public, anon, authenticated;
grant execute on function public.notify_instagram_feedback_evaluation()
to service_role;
