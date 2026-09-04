-- ============================================================================
-- IL COSTO DEL LAVORO: la metà del conto che mancava.
--
-- Console Supabase → SQL Editor → incolla → Run. Ripetibile senza danni.
-- Va lanciata DOPO le migrazioni da 02 a 08.
--
-- Comanda sapeva dire quanto costa un piatto e quante ore fa Marco. Non sapeva
-- dire quanto costa il servizio di sabato. Chi fa i turni ha la metà del
-- personale, chi fa il food cost ha la metà della merce: qui ci sono tutte e
-- due, e serve un dato solo per unirle — la tariffa oraria.
--
-- E LA TARIFFA ORARIA È LA COSA PIÙ DELICATA DI TUTTA L'APP.
-- Non è un telefono e non è il prezzo del burro: è quanto guadagna un collega,
-- e in una brigata è la cosa che non deve girare. Perciò non basta uno dei due
-- permessi:
--
--   vede i dati personali  →  telefono, email, ore di contratto
--   vede i costi           →  prezzi, fornitori, food cost
--   TUTTI E DUE            →  quanto costa una persona all'ora
--
-- Non è pignoleria: `editor_vede_personali` e `editor_vede_costi` sono due
-- interruttori indipendenti, e un titolare che ha acceso il primo per far
-- gestire i turni al secondo non ha acconsentito a mostrargli gli stipendi.
--
-- E COME SEMPRE LA RISERVATEZZA È UNA TABELLA, NON UN CAMPO.
-- Filtrare la colonna in `leggi_persone` non basterebbe: `persone_personali`
-- è nella pubblicazione del tempo reale, e Realtime manda la RIGA a chi
-- potrebbe leggerla con una select — la redazione non la attraversa. La stessa
-- lezione della migrazione 08, e vale ancora.
-- ============================================================================


-- ---- 1. La tariffa, in una tabella sua -------------------------------------
create table if not exists public.persone_costo (
  kitchen_id   uuid not null references public.kitchens(id) on delete cascade,
  id           text not null,
  -- Quanto costa un'ora di quella persona all'AZIENDA: non è la busta paga, è
  -- il costo pieno — contributi compresi — perché è quello che serve per
  -- sapere se sabato si è guadagnato.
  costo_orario numeric check (costo_orario is null or costo_orario >= 0),
  primary key (kitchen_id, id),
  foreign key (kitchen_id, id) references public.persone(kitchen_id, id) on delete cascade
);

alter table public.persone_costo enable row level security;

-- Tutti e due i permessi, in lettura come in scrittura. E in scrittura anche
-- `can_write`: «non si scrive ciò che non si può leggere».
drop policy if exists persone_costo_select on public.persone_costo;
create policy persone_costo_select on public.persone_costo
  for select using (public.vede_costi(kitchen_id) and public.vede_personali(kitchen_id));

drop policy if exists persone_costo_insert on public.persone_costo;
create policy persone_costo_insert on public.persone_costo
  for insert with check (public.can_write(kitchen_id)
                         and public.vede_costi(kitchen_id)
                         and public.vede_personali(kitchen_id));

drop policy if exists persone_costo_update on public.persone_costo;
create policy persone_costo_update on public.persone_costo
  for update using (public.can_write(kitchen_id)
                    and public.vede_costi(kitchen_id)
                    and public.vede_personali(kitchen_id))
  with check (public.can_write(kitchen_id)
              and public.vede_costi(kitchen_id)
              and public.vede_personali(kitchen_id));

drop policy if exists persone_costo_delete on public.persone_costo;
create policy persone_costo_delete on public.persone_costo
  for delete using (public.can_write(kitchen_id)
                    and public.vede_costi(kitchen_id)
                    and public.vede_personali(kitchen_id));


-- ---- 2. La brigata, con la tariffa quando spetta ---------------------------
-- La `left join` non ha bisogno di sapere niente dei permessi: la funzione è
-- `security invoker`, quindi la policy di `persone_costo` si applica anche
-- qui, e a chi non spetta la colonna esce `null` da sola. Un solo punto in cui
-- la regola è scritta, e non due che possono divergere.
create or replace function public.leggi_persone(p_kitchen uuid)
returns table (
  id text, name text, role text, stations jsonb, "weeklyQuota" jsonb,
  "puoFareExtra" boolean, phone text, email text, hours numeric, "userId" uuid,
  "costoOrario" numeric
)
language sql
security invoker
stable
set search_path = public
as $$
  select p.id, p.name, p.ruolo_cucina, p.stations, p.weekly_quota, p.puo_fare_extra,
         d.phone, d.email, d.hours, d.user_id, c.costo_orario
    from public.persone p
    left join public.persone_personali d
      on d.kitchen_id = p.kitchen_id and d.id = p.id
    left join public.persone_costo c
      on c.kitchen_id = p.kitchen_id and c.id = p.id
   where p.kitchen_id = p_kitchen
   order by lower(p.name);
$$;
grant execute on function public.leggi_persone(uuid) to authenticated;


create or replace function public.salva_persone(p_kitchen uuid, p_righe jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  r         jsonb;
  n         integer := 0;
  personali boolean := public.vede_personali(p_kitchen);
  -- Chi non ha tutti e due i permessi non scrive la tariffa. E non la
  -- CANCELLA nemmeno: senza questa riga, un salvataggio della brigata fatto da
  -- chi non la vede manderebbe `costoOrario: undefined` e azzererebbe le
  -- tariffe di tutti senza che nessuno se ne accorga.
  costi     boolean := public.vede_costi(p_kitchen) and public.vede_personali(p_kitchen);
begin
  for r in select * from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) loop
    insert into public.persone as p
      (kitchen_id, id, name, ruolo_cucina, stations, weekly_quota, puo_fare_extra, aggiornato_il)
    values (
      p_kitchen, r->>'id', coalesce(r->>'name',''), nullif(r->>'role',''),
      coalesce(r->'stations', '[]'::jsonb),
      coalesce(r->'weeklyQuota', '[]'::jsonb),
      coalesce((r->>'puoFareExtra')::boolean, true),
      now())
    on conflict (kitchen_id, id) do update
      set name = excluded.name, ruolo_cucina = excluded.ruolo_cucina,
          stations = excluded.stations, weekly_quota = excluded.weekly_quota,
          puo_fare_extra = excluded.puo_fare_extra, aggiornato_il = now();

    if personali then
      insert into public.persone_personali as d (kitchen_id, id, phone, email, hours, user_id)
      values (p_kitchen, r->>'id',
              nullif(r->>'phone',''), nullif(r->>'email',''),
              nullif(r->>'hours','')::numeric,
              nullif(r->>'userId','')::uuid)
      on conflict (kitchen_id, id) do update
        set phone = excluded.phone, email = excluded.email,
            hours = excluded.hours, user_id = excluded.user_id;
    end if;

    if costi then
      insert into public.persone_costo as c (kitchen_id, id, costo_orario)
      values (p_kitchen, r->>'id', nullif(r->>'costoOrario','')::numeric)
      on conflict (kitchen_id, id) do update set costo_orario = excluded.costo_orario;
    end if;

    n := n + 1;
  end loop;
  return n;
end;
$$;
grant execute on function public.salva_persone(uuid, jsonb) to authenticated;


-- ---- 3. Il totale, per chi vede i costi ma non le persone ------------------
-- Chi vede i costi senza vedere i dati personali deve poter sapere quanto
-- costa il servizio di sabato — è il suo mestiere — senza sapere quanto
-- guadagna Marco. Sono due domande diverse e meritano due risposte diverse:
-- il dettaglio se lo calcola il telefono di chi ha le tariffe, il TOTALE lo
-- calcola il database e ne esce solo la somma.
--
-- È `security definer` apposta: deve poter leggere `persone_costo` per conto
-- di chi non potrebbe. Per questo la prima riga del corpo è la guardia, e non
-- un commento che dice di stare attenti.
--
-- LIMITE, scritto perché si sappia: in una brigata di UNA persona il totale è
-- il suo stipendio. Non è un buco da tappare — in una cucina di uno chi guarda
-- i costi è la persona stessa — ma chi legge questo codice deve saperlo invece
-- di scoprirlo.
create or replace function public.costo_lavoro(p_kitchen uuid, p_dal date, p_al date)
returns table (giorno date, ore numeric, costo numeric, completo boolean)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.vede_costi(p_kitchen) then
    raise exception 'non autorizzato';
  end if;

  return query
    select t.giorno,
           coalesce(sum(tt.hours), 0)::numeric,
           coalesce(sum(tt.hours * c.costo_orario), 0)::numeric,
           -- «Completo» vuol dire che nessuno di chi ha lavorato quel giorno è
           -- senza tariffa. Un totale che tace di essere parziale è più
           -- pericoloso di nessun totale: è più basso del vero, e sempre.
           bool_and(c.costo_orario is not null or coalesce(tt.hours, 0) = 0)
      from public.turni t
      left join public.tipi_turno tt
        on tt.kitchen_id = t.kitchen_id and tt.code = t.code
      left join public.persone_costo c
        on c.kitchen_id = t.kitchen_id and c.id = t.staff_id
     where t.kitchen_id = p_kitchen
       and t.giorno between p_dal and p_al
     group by t.giorno
     order by t.giorno;
end;
$$;
grant execute on function public.costo_lavoro(uuid, date, date) to authenticated;


-- ---- 4. Nel tempo reale ----------------------------------------------------
-- Cambiare una tariffa deve aggiornare il costo su tutti i telefoni che hanno
-- diritto di vederlo — e su nessun altro, che è garantito dalla policy.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'persone_costo'
  ) then
    alter publication supabase_realtime add table public.persone_costo;
  end if;
  alter table public.persone_costo replica identity full;
end $$;


-- ============================================================================
-- CONTROLLO
--   select * from public.costo_lavoro('<id cucina>', '2026-01-01', '2026-01-31');
--
-- E poi `supabase/prove-permessi.sql`, che dopo questa migrazione prova anche
-- la tariffa: undici righe nuove, fra cui la cucina «costi sì, persone no» —
-- quella che rende la scelta dei due permessi una prova invece di un'opinione.
-- ============================================================================
