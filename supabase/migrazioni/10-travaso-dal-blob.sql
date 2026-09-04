-- ============================================================================
-- IL TRAVASO: portare nelle tabelle i dati che erano nel blob.
--
-- Console Supabase → SQL Editor → incolla → Run. Ripetibile senza danni.
-- Va lanciata DOPO le migrazioni da 02 a 09.
--
-- QUESTA MIGRAZIONE RIPARA UN BUCO DEL PIANO, e vale la pena dire quale.
--
-- Le migrazioni da 02 a 07 creano le tabelle. Non ci mettono dentro niente.
-- Per una cucina NUOVA va bene: nasce già a tabelle. Per una cucina che i dati
-- ce li aveva, no — e il modo in cui va storto è il peggiore possibile:
--
--   1. la tabella viene creata, vuota;
--   2. l'app smette di ripiegare sul blob (ripiega solo se la tabella NON
--      ESISTE, non se è vuota) e comincia a leggere dalla tabella;
--   3. la cucina appare VUOTA. Nessun errore, nessun avviso: 289 ingredienti
--      e quindici persone semplicemente non ci sono più a schermo;
--   4. chi la usa pensa di dover ricominciare, e ricrea qualche dato a mano;
--   5. da quel momento le due copie divergono.
--
-- Il blob non viene toccato da niente di tutto questo: i dati sono lì, interi.
-- Ma nessuno lo sa, perché l'app non ha modo di dirlo.
--
-- SI GUARDA PRIMA, POI SI DECIDE. Sotto ci sono due funzioni: una CONFRONTA e
-- non tocca niente, l'altra travasa. In un lavoro dove il passo sbagliato
-- sovrascrive dati veri, il passo che si fa per primo dev'essere quello che
-- non fa niente.
-- ============================================================================


-- ---- 1. Cosa c'è di qua e cosa di là ---------------------------------------
-- Non scrive niente. Da lanciare per prima, e da rileggere dopo il travaso.
create or replace function public.confronta_blob_e_tabelle(p_kitchen uuid)
returns table (sezione text, nel_blob integer, nelle_tabelle bigint, cosa_direbbe text)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  r record;
  n_blob integer;
  n_tab  bigint;
begin
  -- SI LANCIA DALLA CONSOLE, e li' `auth.uid()` e' nullo: non c'e' nessun
  -- gettone, la sessione e' `postgres`. Un controllo scritto solo come
  -- «devi essere il titolare» bloccherebbe proprio l'unico posto da cui questa
  -- funzione ha senso.
  --
  -- Quindi: senza gettone si passa — ma allora a difendere e' il fatto che
  -- NESSUN grant esce da qui, quindi ci arriva solo chi ha gia' le chiavi del
  -- database. Col gettone, invece, deve essere il titolare.
  if auth.uid() is not null and public.my_role(p_kitchen) is distinct from 'owner' then
    raise exception 'solo il titolare';
  end if;

  for r in
    select * from (values
      ('ingredients',      'ingredienti'),
      ('staff',            'persone'),
      ('subrecipes',       'sub_ricette'),
      ('recipes',          'piatti'),
      ('menus',            'menu'),
      ('suppliers',        'fornitori'),
      ('invoiceHistory',   'importazioni'),
      ('importedInvoices', 'fatture_importate'),
      ('stations',         'partite'),
      ('services',         'servizi'),
      ('shiftTypes',       'tipi_turno'),
      ('wellbeing',        'ore_registrate')
    ) as t(chiave, tabella)
  loop
    select coalesce(jsonb_array_length(value), 0) into n_blob
      from public.kitchen_data where kitchen_id = p_kitchen and key = r.chiave;
    n_blob := coalesce(n_blob, 0);

    execute format('select count(*) from public.%I where kitchen_id = $1', r.tabella)
      into n_tab using p_kitchen;

    sezione := r.chiave;
    nel_blob := n_blob;
    nelle_tabelle := n_tab;
    cosa_direbbe := case
      when n_blob = 0 and n_tab = 0 then 'niente da nessuna parte'
      when n_blob = 0               then 'solo nelle tabelle: a posto'
      when n_tab = 0                then '>>> DA TRAVASARE: nel blob ci sono dati che l''app non vede'
      else '!!! DUE COPIE: decidi tu quale vale'
    end;
    return next;
  end loop;
end;
$$;


-- ---- 2. Il travaso ---------------------------------------------------------
-- `p_sovrascrivi = false` (come parte) tocca SOLO le sezioni con la tabella
-- vuota: non può cancellare niente, al massimo non fa abbastanza.
-- `p_sovrascrivi = true` travasa anche dove ci sono già dei dati, e allora il
-- blob vince. Si usa quando il confronto dice «DUE COPIE» e quella buona è la
-- vecchia — ed è una decisione, non un ripiego: va presa guardando i numeri.
create or replace function public.travasa_dal_blob(
  p_kitchen uuid, p_sovrascrivi boolean default false
)
returns table (sezione text, righe_travasate integer, esito text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  dati     jsonb;
  n_tab    bigint;
  quante   integer;
begin
  -- SI LANCIA DALLA CONSOLE, e li' `auth.uid()` e' nullo: non c'e' nessun
  -- gettone, la sessione e' `postgres`. Un controllo scritto solo come
  -- «devi essere il titolare» bloccherebbe proprio l'unico posto da cui questa
  -- funzione ha senso.
  --
  -- Quindi: senza gettone si passa — ma allora a difendere e' il fatto che
  -- NESSUN grant esce da qui, quindi ci arriva solo chi ha gia' le chiavi del
  -- database. Col gettone, invece, deve essere il titolare.
  if auth.uid() is not null and public.my_role(p_kitchen) is distinct from 'owner' then
    raise exception 'solo il titolare';
  end if;

  for r in
    select * from (values
      ('ingredients',      'ingredienti',       'salva_ingredienti'),
      ('staff',            'persone',           'salva_persone'),
      ('subrecipes',       'sub_ricette',       'salva_sub_ricette'),
      ('recipes',          'piatti',            'salva_piatti'),
      ('menus',            'menu',              'salva_menu'),
      ('suppliers',        'fornitori',         'salva_fornitori'),
      ('invoiceHistory',   'importazioni',      'salva_importazioni'),
      ('importedInvoices', 'fatture_importate', 'salva_fatture_importate'),
      ('stations',         'partite',           'salva_partite'),
      ('services',         'servizi',           'salva_servizi'),
      ('shiftTypes',       'tipi_turno',        'salva_tipi_turno'),
      ('wellbeing',        'ore_registrate',    'salva_ore_registrate'),
      -- Il fabbisogno e' un OGGETTO, non un elenco: la sua funzione prende la
      -- stessa forma che aveva nel blob, quindi passa di qui come gli altri.
      ('staffingNeeds',    'fabbisogno',        'salva_fabbisogno')
    ) as t(chiave, tabella, funzione)
  loop
    select value into dati
      from public.kitchen_data where kitchen_id = p_kitchen and key = r.chiave;

    sezione := r.chiave;

    if dati is null or dati = '[]'::jsonb or dati = '{}'::jsonb then
      righe_travasate := 0; esito := 'niente nel blob'; return next; continue;
    end if;

    execute format('select count(*) from public.%I where kitchen_id = $1', r.tabella)
      into n_tab using p_kitchen;

    if n_tab > 0 and not p_sovrascrivi then
      righe_travasate := 0;
      esito := format('saltata: la tabella ha gia'' %s righe (rilancia con true per farla vincere al blob)', n_tab);
      return next; continue;
    end if;

    execute format('select public.%I($1, $2)', r.funzione)
      into quante using p_kitchen, dati;

    righe_travasate := coalesce(quante, 0);
    esito := case when n_tab > 0 then 'travasata SOPRA i dati che c''erano'
                  else 'travasata' end;
    return next;
  end loop;
end;
$$;


-- ============================================================================
-- COME SI USA
--
--   -- 1. GUARDA (non tocca niente):
--   select * from public.confronta_blob_e_tabelle('<id cucina>');
--
--   -- 2. Travasa solo dove la tabella e' vuota — non puo' cancellare niente:
--   select * from public.travasa_dal_blob('<id cucina>');
--
--   -- 3. Solo se il confronto dice «DUE COPIE» e vuoi che vinca il blob:
--   select * from public.travasa_dal_blob('<id cucina>', true);
--
--   -- 4. Riguarda:
--   select * from public.confronta_blob_e_tabelle('<id cucina>');
--
-- L'id della cucina: select id, name from public.kitchens;
--
-- NON hanno grant, ed e' voluto: sono due funzioni da console, non da app.
-- Un travaso si fa una volta sola e guardando i numeri; dietro un pulsante
-- diventerebbe una cosa che qualcuno preme per vedere che succede.
--
-- I TURNI RESTANO FUORI, ed e' voluto. Nel blob sono indicizzati per nome del
-- giorno o per data a seconda di quanto sono vecchi, e `migrateData` nel
-- browser sa distinguerli; qui no. Un prospetto si rigenera in un minuto, una
-- data sbagliata su sessanta celle si scopre a servizio cominciato.
--
-- E IL BLOB NON SI CANCELLA. Resta li' finche' non si e' sicuri: e' l'unica
-- copia dei dati di prima, e finora e' anche l'unica cosa che ha funzionato.
-- ============================================================================
