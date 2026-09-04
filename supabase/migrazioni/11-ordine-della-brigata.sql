-- ============================================================================
-- L'ORDINE DELLA BRIGATA È UN DATO, e la migrazione 03 l'aveva perso.
--
-- Console Supabase → SQL Editor → incolla → Run. Ripetibile senza danni.
--
-- COSA SUCCEDEVA. `leggi_persone` finiva con `order by lower(p.name)`, e la
-- tabella `persone` non aveva nessuna colonna per l'ordine. Quindi:
--
--   1. il titolare riordina la brigata coi pulsanti su e giù, come vuole lui —
--      il capopartita in cima, i commis in fondo;
--   2. l'ordine vive in memoria e sembra salvato;
--   3. alla prima rilettura — un ricaricamento, un cambio lingua, il tempo
--      reale — torna tutto in ordine alfabetico.
--
-- Il cambio lingua lo fa venire fuori subito perché rilegge, ma non è quello
-- il problema: il problema è che quell'ordine non era scritto da nessuna parte.
--
-- Le partite ce l'avevano già (`posizione`, presa dall'indice dell'array). Le
-- persone no, ed è un'incoerenza del piano, non una scelta: in `CLAUDE.md` sta
-- scritto che «l'ordine delle righe è l'ordine di state.staff, cioè quello che
-- il titolare ha deciso coi pulsanti su/giù».
--
-- E L'ORDINE DI PRIMA NON È PERDUTO: è nell'array `staff` dentro il blob, che
-- non è mai stato cancellato. Questa migrazione lo va a riprendere.
-- ============================================================================


-- ---- 1. La colonna che mancava ---------------------------------------------
alter table public.persone
  add column if not exists posizione integer not null default 0;


-- ---- 2. Riprendersi l'ordine dal blob --------------------------------------
-- `with ordinality` dà l'indice di ogni elemento dell'array: è esattamente
-- l'ordine in cui il titolare aveva messo le persone, l'ultima volta che l'app
-- ha salvato il blob.
--
-- Chi nel blob non c'è (aggiunto dopo il passaggio alle tabelle) resta a 0 e
-- finisce in cima in ordine alfabetico: non è un ordine sbagliato, è quello
-- che c'era prima di questa migrazione.
with ordine as (
  select kd.kitchen_id,
         elem->>'id' as id,
         (i - 1)::integer as posizione
    from public.kitchen_data kd,
         lateral jsonb_array_elements(kd.value) with ordinality as t(elem, i)
   where kd.key = 'staff'
     and jsonb_typeof(kd.value) = 'array'
)
update public.persone p
   set posizione = o.posizione
  from ordine o
 where p.kitchen_id = o.kitchen_id
   and p.id = o.id
   and p.posizione = 0;   -- non si tocca chi un ordine ce l'ha già


-- ---- 3. Leggere nell'ordine giusto -----------------------------------------
-- `order by posizione, lower(name)`: il secondo criterio serve a chi ha ancora
-- posizione 0 — senza, l'ordine fra loro sarebbe quello che decide Postgres,
-- cioè nessuno in particolare, e cambierebbe da una lettura all'altra.
--
-- Le colonne restituite sono le stesse della 09, quindi qui `create or replace`
-- basta: non si cambia il tipo di ritorno, si cambia solo l'ordine.
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
   order by p.posizione, lower(p.name);
$$;
grant execute on function public.leggi_persone(uuid) to authenticated;


-- ---- 4. Scrivere l'ordine, come fanno le partite ---------------------------
-- La posizione è l'INDICE nell'array che manda l'app: non c'è un campo da
-- tenere allineato a mano, e riordinare la brigata è già un salvataggio.
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
  costi     boolean := public.vede_costi(p_kitchen) and public.vede_personali(p_kitchen);
begin
  for r in select * from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) loop
    insert into public.persone as p
      (kitchen_id, id, name, ruolo_cucina, stations, weekly_quota, puo_fare_extra,
       posizione, aggiornato_il)
    values (
      p_kitchen, r->>'id', coalesce(r->>'name',''), nullif(r->>'role',''),
      coalesce(r->'stations', '[]'::jsonb),
      coalesce(r->'weeklyQuota', '[]'::jsonb),
      coalesce((r->>'puoFareExtra')::boolean, true),
      n,
      now())
    on conflict (kitchen_id, id) do update
      set name = excluded.name, ruolo_cucina = excluded.ruolo_cucina,
          stations = excluded.stations, weekly_quota = excluded.weekly_quota,
          puo_fare_extra = excluded.puo_fare_extra,
          posizione = excluded.posizione, aggiornato_il = now();

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


-- ============================================================================
-- CONTROLLO
--   select posizione, name from public.persone
--    where kitchen_id = '<id cucina>' order by posizione;
--
-- Se le posizioni sono tutte 0, nel blob non c'era un array `staff` da cui
-- riprendere l'ordine: riordina una volta nell'app e da lì in poi resta.
-- ============================================================================
