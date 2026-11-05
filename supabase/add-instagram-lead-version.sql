alter table public.instagram_leads
add column if not exists version integer not null default 1 check (version >= 1);

create or replace function public.instagram_bump_lead_version()
returns trigger
language plpgsql
as $$
begin
  if row(new.*) is distinct from row(old.*) then
    new.version = old.version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists instagram_leads_bump_version on public.instagram_leads;
create trigger instagram_leads_bump_version
before update on public.instagram_leads
for each row execute function public.instagram_bump_lead_version();
