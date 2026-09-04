-- ============================================================================
-- IL TEMPO REALE. È il motivo per cui si è fatto tutto il resto.
--
-- Console Supabase → SQL Editor → incolla → Run. Ripetibile senza danni.
-- Va lanciata DOPO tutte le migrazioni da 02 a 07.
--
-- E adesso è quasi gratis, perché il lavoro è stato fatto prima.
--
-- CON I BLOB NON SI POTEVA, e non per una difficoltà tecnica: Realtime manda
-- la riga a chi potrebbe leggerla con una `select`, e la riga di
-- `kitchen_data` conteneva TUTTO — prezzi, telefoni, turni non pubblicati.
-- La redazione la faceva `leggi_sezione()`, che il canale non attraversa.
-- L'unico modo di far funzionare il tempo reale su quel modello sarebbe stato
-- allargare `data_select`, cioè aprire un buco che si sarebbe notato solo
-- perché tutto avrebbe cominciato a funzionare benissimo.
--
-- ADESSO OGNI TABELLA È GIÀ FILTRATA COM'È GIUSTO, per costruzione:
--   ingredienti_costi  la legge solo chi vede i costi
--   persone_personali  la legge solo chi vede i dati personali
--   turni              policy per riga: chi ha sola lettura vede i pubblicati
--   fornitori          la legge solo chi vede i costi
--
-- Non c'è niente da nascondere dentro una riga che qualcuno può leggere. Il
-- canale eredita le stesse regole delle letture, e sono le regole giuste.
-- ============================================================================

-- ---- Prima di tutto: ci sono tutte? ---------------------------------------
-- Lanciata fuori ordine, questa migrazione fallirebbe con «relation
-- public.sub_ricette does not exist» — vero ma inutile: non dice quale pezzo
-- manca ne' cosa lanciare. Un errore deve dire cosa fare.
do $$
declare mancanti text[];
begin
  select array_agg(m order by m) into mancanti from (
    select distinct case
      when t in ('ingredienti','ingredienti_costi')          then '02-ingredienti'
      when t in ('persone','persone_personali')              then '03-brigata'
      when t in ('turni','giorni_pubblicati')                then '04-turni'
      when t in ('sub_ricette','piatti','piatti_costi','menu') then '05-ricettario'
      when t in ('fornitori','importazioni')                 then '06-fornitori-e-fatture'
      else '07-configurazione-e-benessere'
    end as m
    from unnest(array[
      'ingredienti', 'ingredienti_costi',
      'persone', 'persone_personali',
      'turni', 'giorni_pubblicati',
      'sub_ricette', 'piatti', 'piatti_costi', 'menu',
      'fornitori', 'importazioni',
      'partite', 'servizi', 'tipi_turno', 'fabbisogno',
      'ore_registrate', 'impostazioni_cucina'
    ]) t
    where to_regclass('public.' || t) is null
  ) x;

  if mancanti is not null then
    raise exception
      'Manca ancora: %. Vanno lanciate in ordine, questa per ultima.',
      array_to_string(mancanti, ', ');
  end if;
end $$;


do $$
declare t text;
begin
  foreach t in array array[
    'ingredienti', 'ingredienti_costi',
    'persone', 'persone_personali',
    'turni', 'giorni_pubblicati',
    'sub_ricette', 'piatti', 'piatti_costi', 'menu',
    'fornitori', 'importazioni',
    'partite', 'servizi', 'tipi_turno', 'fabbisogno',
    'ore_registrate', 'impostazioni_cucina'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;

    -- `replica identity full` serve perché negli eventi di UPDATE e DELETE
    -- arrivi anche il valore PRECEDENTE della riga. Senza, di una cancellazione
    -- si conosce solo la chiave — e per `turni` la chiave è
    -- (kitchen_id, staff_id, giorno), che basta; ma per le tabelle con `id`
    -- testuale non basterebbe a capire COSA è sparito dall'elenco.
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;


-- ============================================================================
-- QUELLO CHE RESTA FUORI, e perché
--
-- `kitchen_data` NON entra nella pubblicazione, e non deve entrarci mai.
-- Ci restano solo `knowledge` e `chatHistory` — un testo e una conversazione —
-- e per quelli il tempo reale non serve: non è roba che due persone modificano
-- insieme mentre lavorano.
--
-- Se un giorno servisse, la strada NON è allargare `data_select`: è spezzare
-- anche quelle due, come si è fatto con tutte le altre.
-- ============================================================================


-- ============================================================================
-- CONTROLLO
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' and schemaname = 'public'
--    order by tablename;
--   -- devono esserci le diciotto tabelle qui sopra, e NON kitchen_data
-- ============================================================================
