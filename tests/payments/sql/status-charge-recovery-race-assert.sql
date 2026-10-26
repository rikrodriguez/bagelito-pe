begin;
select set_config('bagelito.status_charge_case', :'scenario', true);
do $$
declare n integer:=current_setting('bagelito.status_charge_case')::integer; active_count integer;
begin
  if current_database()<>'bagelito_test'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  if n=4 then
    if exists(select 1 from public.culqi_status_charge_receipts
        where order_id='00000000-0000-4000-8000-000000009911')
      or exists(select 1 from public.order_status_history
        where order_id='00000000-0000-4000-8000-000000009911' and changed_by='culqi status charge GET')
      or not exists(select 1 from public.orders where id='00000000-0000-4000-8000-000000009911'
        and payment_status='pending' and status='payment_pending_review' and payment_charge_state='submitted'
        and payment_charge_attempt_id='00000000-0000-4000-8000-000000009915'
        and payment_charge_source_id='tkn_test_SYNTHETICFutureOther')
      or not exists(select 1 from public.payment_attempts where id='00000000-0000-4000-8000-000000009913'
        and status='pending' and paid_at is null) then
      raise exception 'Stale status GET altered the current claim or its attempt';
    end if;
  elsif n=6 then
    if exists(select 1 from public.culqi_status_charge_receipts
        where order_id='00000000-0000-4000-8000-000000009911')
      or exists(select 1 from public.order_status_history
        where order_id='00000000-0000-4000-8000-000000009911')
      or not exists(select 1 from public.orders where id='00000000-0000-4000-8000-000000009911'
        and payment_status='pending' and status='payment_pending_review' and payment_paid_at is null
        and payment_charge_state='submitted' and payment_reconciliation_required
        and payment_reconciliation_reason='known_pending_refund'
        and payment_charge_attempt_id='00000000-0000-4000-8000-000000009914'
        and payment_charge_source_id='tkn_test_SYNTHETICFutureSource')
      or not exists(select 1 from public.payment_attempts where id='00000000-0000-4000-8000-000000009913'
        and status='pending' and paid_at is null and amount_minor=8500) then
      raise exception 'Refund racing with status GET changed money, claims, provenance or history';
    end if;
  else
    if (select count(*) from public.culqi_status_charge_receipts
        where order_id='00000000-0000-4000-8000-000000009911')<>1
      or not exists(select 1 from public.culqi_status_charge_receipts
        where order_id='00000000-0000-4000-8000-000000009911'
          and applied_confirmation and provenance='culqi_charge_get'
          and amount_minor=8500 and current_amount_minor=8500 and currency_code='PEN')
      or (select count(*) from public.order_status_history
        where order_id='00000000-0000-4000-8000-000000009911' and changed_by='culqi status charge GET')<>1
      or not exists(select 1 from public.payment_attempts where id='00000000-0000-4000-8000-000000009913'
        and status='paid' and paid_at is not null and amount_minor=8500) then
      raise exception 'Status GET duplicated or lost its generic receipt, history or paid attempt';
    end if;
    if n=1 and not exists(select 1 from public.orders where id='00000000-0000-4000-8000-000000009911'
      and payment_status='paid' and status='payment_confirmed' and not payment_reconciliation_required) then
      raise exception 'Duplicate status GET lost the confirmed state';
    end if;
    if n in (2,3,5) and not exists(select 1 from public.orders where id='00000000-0000-4000-8000-000000009911'
      and payment_status='paid' and status='cancelled' and payment_reconciliation_required
      and payment_reconciliation_reason='payment_after_reservation_release') then
      raise exception 'Late status GET lost its reservation quarantine';
    end if;
    if n=3 then
      select count(*) into active_count from public.orders
        where batch_id='00000000-0000-4000-8000-000000009910' and status<>'cancelled'
          and not(payment_provider='culqi' and payment_status in ('pending','failed')
            and payment_expires_at<=clock_timestamp());
      if active_count<>1 or not exists(select 1 from public.orders
        where order_code='BAG-FUTURE-QA-REPLACEMENT-8500' and status<>'cancelled') then
        raise exception 'Status GET oversold the replacement capacity';
      end if;
    end if;
    if n=5 and not exists(select 1 from public.orders o join public.payment_attempts a on a.order_id=o.id
      where o.id='00000000-0000-4000-8000-000000009911'
        and o.payment_expires_at>clock_timestamp() and a.expires_at<clock_timestamp()
        and o.status='cancelled' and o.payment_status='paid') then
      raise exception 'Status GET ignored the original attempt expiry after an order deadline extension';
    end if;
  end if;
  if exists(select 1 from public.payment_webhook_events
      where provider_order_id='chr_test_SYNTHETICFuture8500')
    or exists(select 1 from public.culqi_charge_get_receipts
      where order_id='00000000-0000-4000-8000-000000009911') then
    raise exception 'Status GET fabricated a webhook event or changed the pilot receipt table';
  end if;
  update public.culqi_status_charge_recovery_policy set enabled=false
    where qa_project_ref='qaahskendqdkynwtylho';
end $$;
commit;
