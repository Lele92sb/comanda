-- ============================================================================
-- AGGIORNAMENTO — "può fare turni extra" deve arrivare a tutti
--
-- COSA FA
-- Rimpiazza una sola funzione: quella che filtra i dati prima che escano dal
-- database. Non tocca tabelle, non tocca permessi, non tocca i tuoi dati.
--
-- PERCHÉ SERVE
-- Quella funzione non toglie dei campi: RICOSTRUISCE la scheda della persona
-- su un elenco chiuso. Un campo nuovo che non viene aggiunto lì non arriva a
-- chi può modificare ma non vede i dati personali. Risultato: l'interruttore
-- "può fare turni extra" funziona per te e viene ignorato per loro, e il
-- generatore dà due prospetti diversi a seconda di chi preme il bottone.
--
-- COME SI ESEGUE
-- Supabase → SQL Editor → incolla tutto → Run. Si può rieseguire quante volte
-- si vuole: "create or replace" sostituisce, non duplica.
--
-- SE QUALCOSA VA STORTO
-- Non può restare a metà: o passa tutta o non cambia niente. E se anche non
-- la esegui, l'app continua a funzionare — semplicemente quell'interruttore
-- resta acceso per tutti, che è il comportamento di prima.
-- ============================================================================

create or replace function public.reddigi_sezione(
  p_ruolo text, p_key text, p_valore jsonb,
  p_vede_costi boolean, p_vede_personali boolean, p_pubblicati jsonb
)
returns jsonb
language plpgsql
immutable
as $$
declare
  senza_costi   boolean := (p_ruolo = 'viewer') or (p_ruolo = 'editor' and not p_vede_costi);
  senza_person  boolean := (p_ruolo = 'viewer') or (p_ruolo = 'editor' and not p_vede_personali);
begin
  if p_ruolo = 'owner' or p_valore is null then return p_valore; end if;

  -- INGREDIENTI: il nome e l'unità servono per leggere una ricetta; il prezzo
  -- d'acquisto e il fornitore sono un'altra cosa.
  if p_key = 'ingredients' and senza_costi then
    return (select coalesce(jsonb_agg(
      jsonb_build_object('id', i->>'id', 'name', i->>'name',
                         'unit', i->>'unit', 'yieldPct', i->'yieldPct')), '[]'::jsonb)
            from jsonb_array_elements(p_valore) i);
  end if;

  -- PIATTI: la ricetta si legge, il prezzo di vendita e il costo no.
  if p_key = 'recipes' and senza_costi then
    return (select coalesce(jsonb_agg(
      (r - 'priceActual' - 'foodCostTargetPct')), '[]'::jsonb)
            from jsonb_array_elements(p_valore) r);
  end if;

  -- BRIGATA: per leggere i turni bastano nome, stazioni, quote e se può fare
  -- extra — sono vincoli di pianificazione. Telefono, email e ore contrattuali
  -- sono dati da datore di lavoro.
  -- Attenzione: questo ramo non toglie dei campi, RICOSTRUISCE la persona su una
  -- lista chiusa. Un vincolo nuovo che non si aggiunge qui arriva undefined a chi
  -- può modificare, il default lo legge come acceso, e lo stesso generatore dà
  -- due prospetti diversi a seconda di chi preme il bottone.
  if p_key = 'staff' and senza_person then
    return (select coalesce(jsonb_agg(
      jsonb_build_object('id', s->>'id', 'name', s->>'name', 'role', s->>'role',
                         'stations', coalesce(s->'stations','[]'::jsonb),
                         'weeklyQuota', coalesce(s->'weeklyQuota','[]'::jsonb),
                         'puoFareExtra', coalesce(s->'puoFareExtra','true'::jsonb))), '[]'::jsonb)
            from jsonb_array_elements(p_valore) s);
  end if;

  -- TURNI: chi ha solo lettura vede unicamente le date pubblicate.
  if p_key = 'shifts' and p_ruolo = 'viewer' then
    return (select coalesce(jsonb_object_agg(persona.key,
              (select coalesce(jsonb_object_agg(giorno.key, giorno.value), '{}'::jsonb)
                 from jsonb_each(persona.value) giorno
                where p_pubblicati ? giorno.key)
            ), '{}'::jsonb)
            from jsonb_each(p_valore) persona);
  end if;

  return p_valore;
end;
$$;


-- ============================================================================
-- VERIFICA — eseguila DOPO, nella stessa finestra.
-- Deve stampare una riga con puo_fare_extra_arriva = true.
-- Se stampa false, la sostituzione non è andata a buon fine: riesegui.
-- ============================================================================

select
  ( public.reddigi_sezione(
    'editor', 'staff',
    '[{"id":"prova","name":"Prova","role":"Cuoco","phone":"333","email":"a@b.it",
       "stations":["s1"],"weeklyQuota":[],"puoFareExtra":false}]'::jsonb,
    true,    -- vede i costi
    false,   -- NON vede i dati personali  <-- è il caso che ci interessa
    '[]'::jsonb
  ) -> 0 ) ? 'puoFareExtra'          as puo_fare_extra_arriva,
  ( public.reddigi_sezione(
    'editor', 'staff',
    '[{"id":"prova","name":"Prova","role":"Cuoco","phone":"333","email":"a@b.it",
       "stations":["s1"],"weeklyQuota":[],"puoFareExtra":false}]'::jsonb,
    true, false, '[]'::jsonb
  ) -> 0 ) ? 'phone'                 as telefono_deve_essere_false;
