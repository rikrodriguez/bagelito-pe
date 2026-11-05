create or replace function public.instagram_mark_quote_sent_on_draft()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_run_status text;
  v_action text;
begin
  if new.quote_sent_at is null
     and new.quote_verified = true
     and new.last_ai_run_id is not null then
    select r.status,
           r.facts_used #>> '{preflight_sales,action}'
      into v_run_status, v_action
    from public.instagram_ai_runs r
    where r.id = new.last_ai_run_id;

    if v_run_status = 'sent' and v_action = 'quote_order' then
      new.quote_sent_at = now();
      new.sales_stage = 'payment_pending';
      new.status = 'payment_pending';
      if new.payment_status = 'none' then
        new.payment_status = 'pending';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists instagram_order_drafts_mark_quote_sent
on public.instagram_order_drafts;
create trigger instagram_order_drafts_mark_quote_sent
before insert or update of last_ai_run_id, quote_verified, quote_sent_at
on public.instagram_order_drafts
for each row execute function public.instagram_mark_quote_sent_on_draft();

create or replace function public.instagram_mark_quote_sent_on_ai_run()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status is distinct from new.status
     and new.status = 'sent'
     and new.facts_used #>> '{preflight_sales,action}' = 'quote_order' then
    update public.instagram_order_drafts d
    set quote_sent_at = coalesce(d.quote_sent_at, now()),
        sales_stage = 'payment_pending',
        status = 'payment_pending',
        payment_status = case
          when d.payment_status = 'none' then 'pending'
          else d.payment_status
        end
    where d.last_ai_run_id = new.id
      and d.quote_verified = true
      and d.quote_sent_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists instagram_ai_runs_mark_quote_sent
on public.instagram_ai_runs;
create trigger instagram_ai_runs_mark_quote_sent
after update of status
on public.instagram_ai_runs
for each row execute function public.instagram_mark_quote_sent_on_ai_run();

revoke all on function public.instagram_mark_quote_sent_on_draft()
from public, anon, authenticated;
revoke all on function public.instagram_mark_quote_sent_on_ai_run()
from public, anon, authenticated;
grant execute on function public.instagram_mark_quote_sent_on_draft()
to service_role;
grant execute on function public.instagram_mark_quote_sent_on_ai_run()
to service_role;
