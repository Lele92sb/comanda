-- ============================================================================
-- LA QUINTA FETTA: fornitori e fatture.
--
-- Console Supabase → SQL Editor → incolla → Run. Ripetibile senza danni.
--
-- QUESTE TRE SEZIONI SONO RISERVATE PER INTERO, non a metà.
-- `sezione_visibile` lo dice già oggi, con la ragione accanto: «Fornitori e
-- fatture SONO dati economici: se il titolare ha tolto i costi, toglierli a
-- metà lascerebbe la porta aperta dal retro». Chi non vede i prezzi non deve
-- nemmeno sapere da chi si compra — dal fornitore si risale al prezzo con una
-- telefonata.
--
-- Quindi qui non servono due tabelle: la riservatezza è la tabella intera, e
-- la policy di lettura è `vede_costi` e basta.
-- ============================================================================


create table if not exists public.fornitori (
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  id         text not null,
  name       text not null,
  piva       text,
  phone      text,
  email      text,
  address    text,
  aggiornato_il timestamptz not null default now(),
  primary key (kitchen_id, id)
);

-- Le impronte delle fatture già importate. Servono a non importare due volte
-- la stessa: è un elenco di identificativi, niente altro.
create table if not exists public.fatture_importate (
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  documento  text not null,
  primary key (kitchen_id, documento)
);

-- Lo storico: le ultime importazioni, con quello che serve per annullarle.
create table if not exists public.importazioni (
  kitchen_id  uuid not null references public.kitchens(id) on delete cascade,
  id          text not null,
  fornitore   text,
  etichetta   text,
  quando      timestamptz not null default now(),
  -- Cosa ha creato e cosa ha cambiato, con i valori di PRIMA: è quello che
  -- permette di tornare indietro. Resta JSON perché è una fotografia di un
  -- momento, non una collezione su cui si cerca.
  creati      jsonb not null default '[]'::jsonb,
  aggiornati  jsonb not null default '[]'::jsonb,
  primary key (kitchen_id, id)
);

alter table public.fornitori         enable row level security;
alter table public.fatture_importate enable row level security;
alter table public.importazioni      enable row level security;

-- Tre tabelle, una regola sola: chi vede i costi. E per scriverle non basta
-- poter modificare — «non si scrive ciò che non si può leggere».
drop policy if exists fornitori_select on public.fornitori;
create policy fornitori_select on public.fornitori
  for select using (public.vede_costi(kitchen_id));

drop policy if exists fornitori_insert on public.fornitori;
create policy fornitori_insert on public.fornitori
  for insert with check (public.can_write(kitchen_id) and public.vede_costi(kitchen_id));

drop policy if exists fornitori_update on public.fornitori;
create policy fornitori_update on public.fornitori
  for update using (public.can_write(kitchen_id) and public.vede_costi(kitchen_id)) with check (public.can_write(kitchen_id) and public.vede_costi(kitchen_id));

drop policy if exists fornitori_delete on public.fornitori;
create policy fornitori_delete on public.fornitori
  for delete using (public.can_write(kitchen_id) and public.vede_costi(kitchen_id));

drop policy if exists fatture_importate_select on public.fatture_importate;
create policy fatture_importate_select on public.fatture_importate
  for select using (public.vede_costi(kitchen_id));

drop policy if exists fatture_importate_insert on public.fatture_importate;
create policy fatture_importate_insert on public.fatture_importate
  for insert with check (public.can_write(kitchen_id) and public.vede_costi(kitchen_id));

drop policy if exists fatture_importate_update on public.fatture_importate;
create policy fatture_importate_update on public.fatture_importate
  for update using (public.can_write(kitchen_id) and public.vede_costi(kitchen_id)) with check (public.can_write(kitchen_id) and public.vede_costi(kitchen_id));

drop policy if exists fatture_importate_delete on public.fatture_importate;
create policy fatture_importate_delete on public.fatture_importate
  for delete using (public.can_write(kitchen_id) and public.vede_costi(kitchen_id));

drop policy if exists importazioni_select on public.importazioni;
create policy importazioni_select on public.importazioni
  for select using (public.vede_costi(kitchen_id));

drop policy if exists importazioni_insert on public.importazioni;
create policy importazioni_insert on public.importazioni
  for insert with check (public.can_write(kitchen_id) and public.vede_costi(kitchen_id));

drop policy if exists importazioni_update on public.importazioni;
create policy importazioni_update on public.importazioni
  for update using (public.can_write(kitchen_id) and public.vede_costi(kitchen_id)) with check (public.can_write(kitchen_id) and public.vede_costi(kitchen_id));

drop policy if exists importazioni_delete on public.importazioni;
create policy importazioni_delete on public.importazioni
  for delete using (public.can_write(kitchen_id) and public.vede_costi(kitchen_id));


create or replace function public.leggi_fornitori(p_kitchen uuid)
returns table (id text, name text, piva text, phone text, email text, address text)
language sql security invoker stable set search_path = public as $$
  select id, name, piva, phone, email, address
    from public.fornitori where kitchen_id = p_kitchen order by lower(name);
$$;
grant execute on function public.leggi_fornitori(uuid) to authenticated;

create or replace function public.salva_fornitori(p_kitchen uuid, p_righe jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare r jsonb; n integer := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_righe,'[]'::jsonb)) loop
    insert into public.fornitori as f
      (kitchen_id, id, name, piva, phone, email, address, aggiornato_il)
    values (p_kitchen, r->>'id', coalesce(r->>'name',''), nullif(r->>'piva',''),
            nullif(r->>'phone',''), nullif(r->>'email',''), nullif(r->>'address',''), now())
    on conflict (kitchen_id, id) do update
      set name = excluded.name, piva = excluded.piva, phone = excluded.phone,
          email = excluded.email, address = excluded.address, aggiornato_il = now();
    n := n + 1;
  end loop;
  return n;
end; $$;
grant execute on function public.salva_fornitori(uuid, jsonb) to authenticated;

-- Le impronte si mandano come INSIEME, come i giorni pubblicati: è quello che
-- sono, e sono al massimo qualche centinaio.
create or replace function public.salva_fatture_importate(p_kitchen uuid, p_documenti jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  delete from public.fatture_importate
   where kitchen_id = p_kitchen
     and documento not in (select jsonb_array_elements_text(coalesce(p_documenti,'[]'::jsonb)));
  insert into public.fatture_importate (kitchen_id, documento)
  select p_kitchen, d from jsonb_array_elements_text(coalesce(p_documenti,'[]'::jsonb)) d
  on conflict do nothing;
  select count(*) into n from public.fatture_importate where kitchen_id = p_kitchen;
  return n;
end; $$;
grant execute on function public.salva_fatture_importate(uuid, jsonb) to authenticated;

create or replace function public.leggi_importazioni(p_kitchen uuid)
returns table (id text, fornitore text, etichetta text, quando timestamptz,
               creati jsonb, aggiornati jsonb)
language sql security invoker stable set search_path = public as $$
  select id, fornitore, etichetta, quando, creati, aggiornati
    from public.importazioni where kitchen_id = p_kitchen order by quando;
$$;
grant execute on function public.leggi_importazioni(uuid) to authenticated;

create or replace function public.salva_importazioni(p_kitchen uuid, p_righe jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare r jsonb; n integer := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_righe,'[]'::jsonb)) loop
    insert into public.importazioni as i
      (kitchen_id, id, fornitore, etichetta, quando, creati, aggiornati)
    values (p_kitchen, r->>'id', nullif(r->>'fornitore',''), nullif(r->>'etichetta',''),
            coalesce(nullif(r->>'quando','')::timestamptz, now()),
            coalesce(r->'creati','[]'::jsonb), coalesce(r->'aggiornati','[]'::jsonb))
    on conflict (kitchen_id, id) do update
      set fornitore = excluded.fornitore, etichetta = excluded.etichetta,
          creati = excluded.creati, aggiornati = excluded.aggiornati;
    n := n + 1;
  end loop;
  return n;
end; $$;
grant execute on function public.salva_importazioni(uuid, jsonb) to authenticated;


-- ============================================================================
-- CONTROLLO
--   select * from public.leggi_fornitori('<id cucina>');
-- ============================================================================
