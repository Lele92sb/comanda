-- ============================================================================
-- LA PRIMA FETTA DEL MODELLO DATI: gli ingredienti.
--
-- Console Supabase → SQL Editor → incolla → Run. Ripetibile senza danni.
-- Il piano completo sta in supabase/PIANO-modello-dati.md.
--
-- ATTENZIONE: quello che c'è dentro `kitchen_data` alla chiave 'ingredients'
-- NON viene convertito. È deciso: non ci sono dati veri, e scrivere un
-- convertitore per dati che non esistono sarebbe la parte più rischiosa di
-- tutto il lavoro. Chi sta provando l'app rifà l'anagrafica.
--
-- DUE TABELLE, E LA SEPARAZIONE È LA REDAZIONE.
-- Il primo istinto sarebbe una tabella sola con una vista che mette `null` al
-- posto del prezzo per chi non lo vede. Non funziona, e si vede solo pensando
-- al tempo reale — che è il motivo per cui tutto questo si fa: Realtime legge
-- la TABELLA, non la vista. Dando la `select` sulla tabella a un editor che
-- non vede i costi, il canale gli manderebbe la riga intera a ogni modifica.
--
-- Quindi quello che non deve vedere non sta in una riga che può leggere.
-- Non c'è nessun campo da ricordarsi di nascondere.
-- ============================================================================


-- ---- 1. Quello che serve per LEGGERE UNA RICETTA ---------------------------
-- Nome, unità e resa: senza, una ricetta non si capisce e il generatore del
-- costo non sa convertire le quantità. Li vede ogni membro della cucina.
create table if not exists public.ingredienti (
  kitchen_id      uuid not null references public.kitchens(id) on delete cascade,
  -- L'id lo genera già il client (`uid()`), ed è testo: si tiene com'è invece
  -- di inventarne un altro e doverli tenere allineati.
  id              text not null,
  name            text not null,
  unit            text not null default 'kg',
  -- La parte edibile, in percentuale. È un vincolo di CUCINA, non un prezzo:
  -- un chilo di asparagi non è un chilo di asparagi puliti, e questo serve a
  -- chiunque legga la ricetta anche se non vede quanto costano.
  yield_pct       numeric not null default 100 check (yield_pct > 0 and yield_pct <= 100),
  yield_estimated boolean not null default false,
  aggiornato_il   timestamptz not null default now(),
  primary key (kitchen_id, id)
);

-- ---- 2. Quello che è RISERVATO --------------------------------------------
-- Prezzo e fornitore. Chi non vede i costi non è iscritto qui: né in tempo
-- reale, né interrogando l'API a mano.
create table if not exists public.ingredienti_costi (
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  id         text not null,
  price      numeric check (price >= 0),
  supplier   text,
  primary key (kitchen_id, id),
  -- Se sparisce l'ingrediente sparisce il suo costo: un costo orfano non
  -- vuol dire niente e resterebbe lì per sempre.
  foreign key (kitchen_id, id) references public.ingredienti(kitchen_id, id) on delete cascade
);

create index if not exists ingredienti_per_cucina on public.ingredienti(kitchen_id);

alter table public.ingredienti       enable row level security;
alter table public.ingredienti_costi enable row level security;


-- ---- 3. Chi vede cosa ------------------------------------------------------

-- Chi vede i costi: il titolare sempre, chi può modificare se il titolare non
-- glieli ha tolti. È la stessa regola di `sezione_visibile`, scritta una volta
-- sola perché adesso serve a due tabelle.
create or replace function public.vede_costi(p_kitchen uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case public.my_role(p_kitchen)
    when 'owner'  then true
    when 'editor' then coalesce((select editor_vede_costi from public.kitchens where id = p_kitchen), true)
    else false
  end;
$$;
grant execute on function public.vede_costi(uuid) to authenticated;

-- L'anagrafica: la legge chiunque sia della cucina.
drop policy if exists ingredienti_select on public.ingredienti;
create policy ingredienti_select on public.ingredienti
  for select using (public.my_role(kitchen_id) is not null);

-- La scrive chi può modificare. NON `for all`: in Postgres comprende anche la
-- SELECT, e una policy di scrittura che allarga la lettura è il modo più
-- silenzioso di aprire un buco (sta scritto in CLAUDE.md, è già costato).
drop policy if exists ingredienti_insert on public.ingredienti;
create policy ingredienti_insert on public.ingredienti
  for insert with check (public.can_write(kitchen_id));

drop policy if exists ingredienti_update on public.ingredienti;
create policy ingredienti_update on public.ingredienti
  for update using (public.can_write(kitchen_id)) with check (public.can_write(kitchen_id));

drop policy if exists ingredienti_delete on public.ingredienti;
create policy ingredienti_delete on public.ingredienti
  for delete using (public.can_write(kitchen_id));

-- I costi: solo chi li vede. E per scriverli non basta poter modificare —
-- «non si scrive ciò che non si può leggere», altrimenti chi non vede i prezzi
-- potrebbe sovrascriverli senza averli mai visti.
drop policy if exists costi_select on public.ingredienti_costi;
create policy costi_select on public.ingredienti_costi
  for select using (public.vede_costi(kitchen_id));

drop policy if exists costi_insert on public.ingredienti_costi;
create policy costi_insert on public.ingredienti_costi
  for insert with check (public.can_write(kitchen_id) and public.vede_costi(kitchen_id));

drop policy if exists costi_update on public.ingredienti_costi;
create policy costi_update on public.ingredienti_costi
  for update using (public.can_write(kitchen_id) and public.vede_costi(kitchen_id))
  with check (public.can_write(kitchen_id) and public.vede_costi(kitchen_id));

drop policy if exists costi_delete on public.ingredienti_costi;
create policy costi_delete on public.ingredienti_costi
  for delete using (public.can_write(kitchen_id) and public.vede_costi(kitchen_id));


-- ---- 4. Salvare, una riga o cinquanta -------------------------------------
-- È il punto di tutto questo lavoro: cambiare un prezzo scrive UNA riga, non
-- riscrive i 620 KB di tutta l'anagrafica.
-- UNA funzione sola, non due: quella «singola» sarebbe questa con un elemento
-- dentro, e due strade per fare la stessa cosa vuol dire due posti in cui
-- sbagliarla. Importando una fattura elettronica ne nascono anche cinquanta.
-- Cinquanta chiamate di rete in fila, su un telefono in cucina col wifi che
-- balla, sono venti secondi di schermata ferma: una sola chiamata e una sola
-- transazione.
--
-- Prende le righe nella forma che usa GIA' l'app (`name`, `yieldPct`, ...):
-- convertire i nomi da una parte o dall'altra è lavoro uguale, e farlo qui
-- vuol dire che il client non deve conoscere due vocabolari.
create or replace function public.salva_ingredienti(p_kitchen uuid, p_righe jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  r     jsonb;
  n     integer := 0;
  costi boolean := public.vede_costi(p_kitchen);
begin
  for r in select * from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) loop
    insert into public.ingredienti as i
      (kitchen_id, id, name, unit, yield_pct, yield_estimated, aggiornato_il)
    values (
      p_kitchen,
      r->>'id',
      coalesce(r->>'name',''),
      coalesce(nullif(r->>'unit',''), 'kg'),
      coalesce(nullif(r->>'yieldPct','')::numeric, 100),
      coalesce((r->>'yieldEstimated')::boolean, false),
      now())
    on conflict (kitchen_id, id) do update
      set name = excluded.name, unit = excluded.unit,
          yield_pct = excluded.yield_pct, yield_estimated = excluded.yield_estimated,
          aggiornato_il = now();

    if costi then
      insert into public.ingredienti_costi as c (kitchen_id, id, price, supplier)
      values (p_kitchen, r->>'id',
              nullif(r->>'price','')::numeric,
              nullif(r->>'supplier',''))
      on conflict (kitchen_id, id) do update
        set price = excluded.price, supplier = excluded.supplier;
    end if;

    n := n + 1;
  end loop;
  return n;
end;
$$;
grant execute on function public.salva_ingredienti(uuid, jsonb) to authenticated;


-- ---- 5. Leggerli tutti, già uniti ------------------------------------------
-- Restituisce l'elenco nella forma che l'app usa già. Chi non vede i costi
-- riceve le stesse righe SENZA prezzo e fornitore — non nulli per finta: la
-- join non trova niente perché la policy non gliela fa vedere.
create or replace function public.leggi_ingredienti(p_kitchen uuid)
returns table (
  id text, name text, unit text, "yieldPct" numeric,
  "yieldEstimated" boolean, price numeric, supplier text
)
language sql
security invoker
stable
set search_path = public
as $$
  select i.id, i.name, i.unit, i.yield_pct, i.yield_estimated, c.price, c.supplier
    from public.ingredienti i
    left join public.ingredienti_costi c
      on c.kitchen_id = i.kitchen_id and c.id = i.id
   where i.kitchen_id = p_kitchen
   order by lower(i.name);
$$;
grant execute on function public.leggi_ingredienti(uuid) to authenticated;


-- ============================================================================
-- CONTROLLO
--   select count(*) from public.ingredienti;          -- deve rispondere 0
--   select * from public.leggi_ingredienti('<id cucina>');
-- ============================================================================
