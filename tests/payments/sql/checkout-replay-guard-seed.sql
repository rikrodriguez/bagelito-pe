\ir checkout-replay-guard-helpers.sql
-- Persistent synthetic seed for a NEW psql session after a rejected core1 replay.
begin;
do $$ begin
  perform pg_temp.seed_checkout_replay_guard('PersistUnknown');
  perform pg_temp.seed_checkout_replay_guard('PersistKnown','uncertain',true);
end $$;
create table public.checkout_replay_guard_baseline(label text primary key, snapshot jsonb not null);
insert into public.checkout_replay_guard_baseline values('complete',pg_temp.checkout_replay_guard_snapshot());
commit;
\echo SEEDED protected synthetic outcomes and private complete snapshot
