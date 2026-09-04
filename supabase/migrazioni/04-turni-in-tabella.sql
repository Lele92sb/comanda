-- ============================================================================
-- LA TERZA FETTA: i turni, e i giorni pubblicati.
--
-- Console Supabase → SQL Editor → incolla → Run. Ripetibile senza danni.
--
-- È LA SEZIONE PIÙ SCRITTA DELL'APP. Si tocca una cella alla volta — «Marco,
-- giovedì, spezzato» — e ogni tocco riscriveva l'intero prospetto di tutti.
-- Venti persone per trenta giorni sono seicento celle in un blob solo.
--
-- ED È ANCHE LA PIÙ FACILE DA PROTEGGERE, perché qui la redazione è già per
-- RIGA e non per campo: chi ha sola lettura vede i giorni pubblicati e basta.
-- Nel blob era una funzione che ricostruiva la mappa saltando i giorni non
-- pubblicati; qui è una policy, e la fa il database senza che nessuno debba
-- ricordarsene.
-- ============================================================================


-- ---- 1. I giorni pubblicati ------------------------------------------------
-- Vengono PRIMA dei turni perché le policy dei turni li interrogano.
-- Un elenco di date, niente altro: «questo giorno la brigata lo vede».
create table if not exists public.giorni_pubblicati (
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  giorno     date not null,
  primary key (kitchen_id, giorno)
);

alter table public.giorni_pubblicati enable row level security;

-- Lo vedono tutti: sapere QUALI giorni sono pubblicati non rivela nessun
-- turno, e serve a chi guarda per capire perché il resto non c'è.
drop policy if exists pubblicati_select on public.giorni_pubblicati;
create policy pubblicati_select on public.giorni_pubblicati
  for select using (public.my_role(kitchen_id) is not null);

drop policy if exists pubblicati_insert on public.giorni_pubblicati;
create policy pubblicati_insert on public.giorni_pubblicati
  for insert with check (public.can_write(kitchen_id));

drop policy if exists pubblicati_delete on public.giorni_pubblicati;
create policy pubblicati_delete on public.giorni_pubblicati
  for delete using (public.can_write(kitchen_id));


-- ---- 2. I turni ------------------------------------------------------------
create table if not exists public.turni (
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  staff_id   text not null,
  giorno     date not null,
  -- La sigla: P, SP, R, F... Vuota vuol dire «cella vuota», e una cella vuota
  -- non si salva affatto: si cancella la riga. Un prospetto mezzo vuoto non
  -- deve costare righe quanto uno pieno.
  code       text not null,
  -- La partita per SERVIZIO: {"pranzo":"s1","cena":"s2"}. Chi a pranzo sta ai
  -- primi e a cena al pass fa due partite in una giornata.
  --
  -- `stationId` NON si salva, ed è deliberato: è un derivato — la prima
  -- partita in ordine di servizio — e un derivato salvato è un secondo posto
  -- in cui può essere sbagliato. Lo ricalcola `normalizzaCella` alla lettura.
  stations   jsonb not null default '{}'::jsonb,
  primary key (kitchen_id, staff_id, giorno),
  foreign key (kitchen_id, staff_id) references public.persone(kitchen_id, id) on delete cascade
);

-- Si legge per PERIODO: «dammi la settimana del 7 settembre». Senza indice,
-- con un anno di turni caricati, ogni apertura della griglia scorrerebbe tutto.
create index if not exists turni_per_giorno on public.turni(kitchen_id, giorno);

alter table public.turni enable row level security;

-- ---- 3. LA REDAZIONE, che qui è una policy --------------------------------
-- Chi può modificare vede tutto: sta costruendo il prospetto, e deve vedere
-- anche quello che non ha ancora pubblicato.
-- Chi ha sola lettura vede SOLO i giorni pubblicati. Non «vede i turni con
-- alcuni giorni nascosti»: quelle righe non gli arrivano proprio, e non gli
-- arriveranno nemmeno in tempo reale.
drop policy if exists turni_select on public.turni;
create policy turni_select on public.turni
  for select using (
    public.can_write(kitchen_id)
    or exists (
      select 1 from public.giorni_pubblicati g
       where g.kitchen_id = turni.kitchen_id and g.giorno = turni.giorno
    )
  );

drop policy if exists turni_insert on public.turni;
create policy turni_insert on public.turni
  for insert with check (public.can_write(kitchen_id));

drop policy if exists turni_update on public.turni;
create policy turni_update on public.turni
  for update using (public.can_write(kitchen_id)) with check (public.can_write(kitchen_id));

drop policy if exists turni_delete on public.turni;
create policy turni_delete on public.turni
  for delete using (public.can_write(kitchen_id));


-- ---- 4. Leggere e salvare --------------------------------------------------
-- Restituisce righe piatte: il client ricompone la mappa
-- {personaId: {giorno: cella}} che l'app usa già. Ricomporla qui vorrebbe dire
-- costruire un jsonb annidato in SQL per poi disfarlo subito, e in mezzo
-- perdere la possibilità di chiedere un solo periodo.
create or replace function public.leggi_turni(p_kitchen uuid)
returns table (staff_id text, giorno date, code text, stations jsonb)
language sql
security invoker
stable
set search_path = public
as $$
  select t.staff_id, t.giorno, t.code, t.stations
    from public.turni t
   where t.kitchen_id = p_kitchen;
$$;
grant execute on function public.leggi_turni(uuid) to authenticated;

-- Salva le celle cambiate e cancella quelle svuotate, in una transazione sola.
--
-- Dopo una generazione mensile ne cambiano seicento insieme: una chiamata per
-- cella sarebbe stata l'unica cosa peggiore del blob.
create or replace function public.salva_turni(
  p_kitchen uuid, p_celle jsonb, p_da_togliere jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  c jsonb;
  n integer := 0;
begin
  for c in select * from jsonb_array_elements(coalesce(p_celle, '[]'::jsonb)) loop
    insert into public.turni as t (kitchen_id, staff_id, giorno, code, stations)
    values (p_kitchen, c->>'staff_id', (c->>'giorno')::date,
            coalesce(c->>'code',''), coalesce(c->'stations', '{}'::jsonb))
    on conflict (kitchen_id, staff_id, giorno) do update
      set code = excluded.code, stations = excluded.stations;
    n := n + 1;
  end loop;

  for c in select * from jsonb_array_elements(coalesce(p_da_togliere, '[]'::jsonb)) loop
    delete from public.turni
     where kitchen_id = p_kitchen
       and staff_id = c->>'staff_id'
       and giorno = (c->>'giorno')::date;
    n := n + 1;
  end loop;

  return n;
end;
$$;
grant execute on function public.salva_turni(uuid, jsonb, jsonb) to authenticated;

-- I giorni pubblicati si salvano come INSIEME: è quello che sono, ed è quello
-- che l'app manda. Toglierne uno e aggiungerne un altro sono lo stesso gesto —
-- «adesso i pubblicati sono questi».
create or replace function public.salva_giorni_pubblicati(p_kitchen uuid, p_giorni jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare n integer;
begin
  delete from public.giorni_pubblicati
   where kitchen_id = p_kitchen
     and giorno not in (
       select (jsonb_array_elements_text(coalesce(p_giorni,'[]'::jsonb)))::date);

  insert into public.giorni_pubblicati (kitchen_id, giorno)
  select p_kitchen, g::date
    from jsonb_array_elements_text(coalesce(p_giorni,'[]'::jsonb)) g
  on conflict do nothing;

  select count(*) into n from public.giorni_pubblicati where kitchen_id = p_kitchen;
  return n;
end;
$$;
grant execute on function public.salva_giorni_pubblicati(uuid, jsonb) to authenticated;


-- ============================================================================
-- CONTROLLO
--   select * from public.leggi_turni('<id cucina>') limit 5;
--   select * from public.giorni_pubblicati where kitchen_id = '<id cucina>';
-- ============================================================================
