-- Formora – Update 1: Obergrenzen pro Konto (für bereits eingerichtete Projekte, einmal ausführen)
-- Obergrenzen pro Konto (Schutz vor Missbrauch, die Registrierung ist offen):
-- ein Dokument höchstens 300 KB, ein Konto höchstens 50.000 Dokumente (reicht für viele Jahre).
alter table public.docs drop constraint if exists docs_size;
alter table public.docs add constraint docs_size check (octet_length(data::text) <= 300000);

create or replace function public.docs_limit() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if (select count(*) from public.docs where user_id = new.user_id) >= 50000 then
    raise exception 'Zu viele Einträge in diesem Konto (Grenze 50000)';
  end if;
  return new;
end $$;

drop trigger if exists docs_limit on public.docs;
create trigger docs_limit before insert on public.docs
  for each row execute function public.docs_limit();
