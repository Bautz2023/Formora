-- Formora – Supabase-Einrichtung (einmal im SQL-Editor ausführen)
-- Eine Zeile pro Dokument; jeder Benutzer sieht und ändert nur seine eigenen Zeilen.

create table if not exists public.docs (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  col        text        not null check (char_length(col) between 1 and 40),
  id         text        not null check (char_length(id) between 1 and 200),
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, col, id)
);

alter table public.docs enable row level security;

drop policy if exists "docs: eigene lesen"   on public.docs;
drop policy if exists "docs: eigene anlegen" on public.docs;
drop policy if exists "docs: eigene ändern"  on public.docs;
drop policy if exists "docs: eigene löschen" on public.docs;

create policy "docs: eigene lesen"   on public.docs for select to authenticated using (user_id = (select auth.uid()));
create policy "docs: eigene anlegen" on public.docs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "docs: eigene ändern"  on public.docs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "docs: eigene löschen" on public.docs for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.docs from anon;
grant select, insert, update, delete on public.docs to authenticated;

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

-- Fotos: privater Bucket, Ordner = Benutzer-ID
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set public = false;

drop policy if exists "fotos: eigene lesen"   on storage.objects;
drop policy if exists "fotos: eigene anlegen" on storage.objects;
drop policy if exists "fotos: eigene ändern"  on storage.objects;
drop policy if exists "fotos: eigene löschen" on storage.objects;

create policy "fotos: eigene lesen"   on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos: eigene anlegen" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos: eigene ändern"  on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos: eigene löschen" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
