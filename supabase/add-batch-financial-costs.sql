-- Bagelito finance costs. Run once in the Supabase SQL Editor.
alter table public.batches add column if not exists ingredient_cost_per_bagel numeric not null default 3.20;
alter table public.batches add column if not exists packaging_cost_per_pack numeric not null default 1.50;
alter table public.batches add column if not exists actual_delivery_cost numeric not null default 0;
alter table public.batches add column if not exists other_batch_cost numeric not null default 0;

alter table public.batches drop constraint if exists batches_finance_costs_nonnegative;
alter table public.batches
  add constraint batches_finance_costs_nonnegative
  check (
    ingredient_cost_per_bagel >= 0
    and packaging_cost_per_pack >= 0
    and actual_delivery_cost >= 0
    and other_batch_cost >= 0
  );
