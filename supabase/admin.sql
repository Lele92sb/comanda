-- ============================================================================
-- Comanda — console di amministrazione della piattaforma
--
-- DA ESEGUIRE A MANO nel SQL Editor di Supabase, DOPO averlo letto.
-- È rieseguibile: usa "if not exists", "create or replace" e
-- "drop policy if exists", quindi rilanciarlo non distrugge niente.
--
-- Questo file è SEPARATO da schema.sql apposta: schema.sql descrive l'app che
-- usano i clienti, questo descrive il potere che ha il proprietario del
-- prodotto sopra tutti i clienti. Due cose diverse, che si leggono e si
-- rivedono separatamente.
--
-- ----------------------------------------------------------------------------
-- COSA TOCCA DELLE TABELLE GIÀ ESISTENTI (l'elenco completo, per la revisione)
--
--   kitchens          + colonna  deleted_at (cancellazione reversibile)
--                     + indice   kitchens_creata_idx  (elenco a chiave)
--                     + indice   kitchens_stato_idx
--                     + trigger  kitchens_contatori   (mantiene i totali)
--   kitchen_members   + trigger  kitchen_members_stats (conteggi per ruolo)
--   kitchen_data      + trigger  kitchen_data_stats    (peso e ultima attività)
--
-- Nessuna policy esistente viene modificata o rimossa. Nessun dato esistente
-- viene riscritto, tranne il riempimento iniziale delle statistiche in fondo,
-- che legge e non cambia niente delle cucine.
--
-- ----------------------------------------------------------------------------
-- IL MODELLO DI SICUREZZA IN QUATTRO RIGHE
--
--   1. platform_admins non si scrive dall'app. Mai. Con nessuna chiamata.
--      Si nomina un amministratore solo da qui, con la chiave di servizio.
--   2. Ogni funzione amministrativa è security definer e la sua PRIMA
--      istruzione è il controllo di is_platform_admin().
--   3. Il registro admin_audit si aggiunge e basta: niente policy di update o
--      delete, e un trigger che rifiuta comunque entrambe.
--   4. L'amministratore vede METADATI e AGGREGATI. Per i contenuti di una
--      cucina serve un accesso di assistenza motivato, a scadenza, registrato
--      e visibile al titolare (sezione 7).
--
-- Le policy non si scrivono MAI "for all": in Postgres FOR ALL comprende anche
-- la SELECT, e a questo progetto è già costato un buco. Qui sono separate per
-- operazione, sempre.
-- ============================================================================


-- ============================================================================
-- 0. PRECONDIZIONI
-- Meglio fermarsi subito che creare mezza console su un database sbagliato.
-- ============================================================================
do $$
begin
  if to_regclass('public.kitchens') is null then
    raise exception 'Manca public.kitchens: esegui prima supabase/schema.sql, poi questo file.';
  end if;
  if to_regclass('public.kitchen_members') is null then
    raise exception 'Manca public.kitchen_members: esegui prima supabase/schema.sql.';
  end if;
end $$;


-- ============================================================================
-- 1. CHI È AMMINISTRATORE DELLA PIATTAFORMA
--
-- Tabella dedicata, non una colonna in kitchen_members e non un campo nei dati
-- di una cucina: è un livello che ATTRAVERSA i clienti, e non deve poter
-- nascere da nessuna scrittura che un utente dell'app riesce a fare.
-- ============================================================================
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  -- Copia dell'email al momento della nomina: serve a leggere il registro
  -- ("chi ha fatto cosa") anche se l'account viene poi cancellato.
  email      text,
  nota       text,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- NESSUNA POLICY SU QUESTA TABELLA. Non è una dimenticanza.
-- Con RLS attiva e zero policy, per un utente autenticato la tabella non ha
-- righe: né in lettura, né in inserimento, né in modifica. L'unico modo di
-- scriverci è la chiave di servizio (che scavalca RLS) o una sessione SQL
-- diretta — cioè esattamente le due cose che ha solo il proprietario.
--
-- Attenzione a non aggiungere mai "force row level security" qui: la forzatura
-- vale anche per il proprietario della tabella, e is_platform_admin() —
-- security definer, quindi eseguita come proprietario — smetterebbe di vedere
-- le righe. Risultato: nessuno sarebbe più amministratore. RLS senza policy
-- basta e avanza, perché i permessi di tabella qui sotto sono già revocati.
revoke all on table public.platform_admins from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Il controllo, in una funzione sola. Risponde SOLO su chi la chiama: non è un
-- modo per sapere chi altro è amministratore.
-- ----------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;


-- ============================================================================
-- 2. IL REGISTRO DELLE AZIONI — IN SOLA AGGIUNTA
--
-- Ogni azione amministrativa scrive qui: chi, quando, cosa, su chi, con quale
-- esito. Il registro serve solo se non lo si può ritoccare dopo, quindi:
--   * nessuna policy di update, nessuna di delete, per nessun ruolo;
--   * in più un trigger che rifiuta update, delete e truncate — quello vale
--     anche per il proprietario della tabella e per la chiave di servizio, che
--     le policy le scavalcherebbero.
-- Per potare il registro un domani bisognerà togliere il trigger a mano: è un
-- gesto deliberato e visibile, che è esattamente quello che deve essere.
-- ============================================================================
create table if not exists public.admin_audit (
  id              bigint generated always as identity primary key,
  quando          timestamptz not null default now(),
  -- not null di proposito: se auth.uid() è nullo l'inserimento fallisce e si
  -- porta dietro l'intera transazione. Un'azione che non riesce a scriversi
  -- nel registro non deve andare a buon fine.
  admin_id        uuid not null,
  admin_email     text,
  azione          text not null,
  -- Niente foreign key verso cucine e utenti: il registro deve sopravvivere a
  -- ciò che descrive. Cancellare definitivamente una cucina si porterebbe via
  -- la prova di chi l'ha cancellata.
  cucina_id       uuid,
  cucina_nome     text,
  bersaglio_id    uuid,
  bersaglio_email text,
  esito           text not null default 'ok' check (esito in ('ok','rifiutato')),
  dettagli        jsonb not null default '{}'::jsonb
);

-- Gli indici seguono l'ordinamento vero dell'elenco (impaginazione a chiave)
-- e il filtro che si usa davvero: "cosa è successo a questa cucina".
create index if not exists admin_audit_quando_idx on public.admin_audit (quando desc, id desc);
create index if not exists admin_audit_cucina_idx on public.admin_audit (cucina_id, quando desc);

alter table public.admin_audit enable row level security;

drop policy if exists admin_audit_select on public.admin_audit;
create policy admin_audit_select on public.admin_audit
  for select using (public.is_platform_admin());

-- Volutamente assenti: admin_audit_insert, admin_audit_update, admin_audit_delete.
-- L'inserimento avviene solo dentro le funzioni security definer di questo file.

revoke all on table public.admin_audit from anon, authenticated;
grant select on table public.admin_audit to authenticated;   -- filtrato dalla policy

create or replace function public.admin_audit_immutabile()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Il registro delle azioni amministrative non si modifica e non si cancella';
end;
$$;

drop trigger if exists admin_audit_no_update on public.admin_audit;
create trigger admin_audit_no_update
  before update or delete on public.admin_audit
  for each row execute function public.admin_audit_immutabile();

drop trigger if exists admin_audit_no_truncate on public.admin_audit;
create trigger admin_audit_no_truncate
  before truncate on public.admin_audit
  for each statement execute function public.admin_audit_immutabile();

-- ----------------------------------------------------------------------------
-- La scrittura nel registro. Non è concessa a nessun ruolo: la si può chiamare
-- solo da dentro le altre funzioni di questo file, che girano come proprietario.
--
-- Sta nella STESSA TRANSAZIONE dell'azione, e non ha nessun blocco "exception":
-- se il registro non si scrive, l'azione non si fa. È la proprietà che si
-- voleva, ed è anche il suo limite (vedi la nota qui sotto).
--
-- LIMITE DICHIARATO — le azioni RIFIUTATE PER MANCANZA DI PERMESSO non
-- lasciano traccia. Un "raise exception" annulla la transazione, e con essa la
-- riga di registro che avesse appena scritto: in Postgres non esistono
-- transazioni autonome. Quindi:
--   * chi non è amministratore riceve un errore e NON compare nel registro;
--   * i rifiuti per regola (togliere l'ultimo titolare, per esempio) invece
--     ci sono, perché quelle funzioni non sollevano: tornano {"ok": false} e
--     registrano esito 'rifiutato'.
-- Per registrare anche i tentativi di chi non è amministratore servirebbe una
-- scrittura fuori transazione (pg_cron su una coda, oppure il proxy server).
-- Vale la pena farlo quando gli amministratori saranno più di uno.
-- ----------------------------------------------------------------------------
create or replace function public.admin_scrivi_registro(
  p_azione text,
  p_cucina uuid,
  p_cucina_nome text,
  p_bersaglio uuid,
  p_bersaglio_email text,
  p_esito text,
  p_dettagli jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_audit (
    admin_id, admin_email, azione, cucina_id, cucina_nome,
    bersaglio_id, bersaglio_email, esito, dettagli
  ) values (
    auth.uid(),
    (select u.email from auth.users u where u.id = auth.uid()),
    p_azione, p_cucina, p_cucina_nome,
    p_bersaglio, p_bersaglio_email,
    coalesce(p_esito, 'ok'), coalesce(p_dettagli, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.admin_scrivi_registro(text,uuid,text,uuid,text,text,jsonb)
  from public, anon, authenticated;


-- ============================================================================
-- 3. NUMERI MANTENUTI, NON RICALCOLATI
--
-- Il modello dati di questa app è un blob JSON per sezione. Contare "quanto
-- pesa una cucina" scandendo i blob funziona a dieci cucine e fonde a
-- diecimila: ogni caricamento della console leggerebbe ogni byte di ogni
-- cliente. Quindi il conto si tiene mentre i dati cambiano, in due posti:
--
--   kitchen_stats      una riga per cucina: peso, sezioni, ultima scrittura,
--                      membri per ruolo.
--   platform_counters  i totali della piattaforma, per stato commerciale.
--
-- QUANDO QUESTA SCELTA VA RIFATTA
--   * platform_counters ha una riga per secchio: due creazioni di cucina nello
--     stesso istante si aspettano a vicenda su quella riga. Finché le cucine
--     si creano a mano non si sente; oltre ~10 creazioni al secondo si passa a
--     righe multiple sommate in lettura, o a un conteggio periodico.
--   * il trigger su kitchen_data serializza il JSON per pesarlo, a ogni
--     salvataggio. Su blob da 600 KB è la stessa serializzazione che il client
--     ha già fatto: si sente sopra i ~5 MB per sezione, e lì conviene passare
--     a pg_column_size (peso compresso, meno intuitivo ma quasi gratis).
--   * i conteggi "attive negli ultimi 7/30 giorni" scandiscono kitchen_stats,
--     una riga per cucina. Oltre la soglia dichiarata in admin_numeri()
--     smettono di rispondere invece di scandire: vanno spostati su secchi
--     aggiornati da un lavoro notturno.
-- ============================================================================

-- Cancellazione reversibile: la cucina resta, marcata. La rimozione definitiva
-- è un secondo passo, apposta (vedi sezione 5).
alter table public.kitchens add column if not exists deleted_at timestamptz;

-- Gli indici seguono ESATTAMENTE l'ordinamento dell'elenco: l'impaginazione a
-- chiave ordina per (created_at desc, id desc), e senza questo indice ogni
-- pagina costerebbe un ordinamento dell'intera tabella.
create index if not exists kitchens_creata_idx on public.kitchens (created_at desc, id desc);
create index if not exists kitchens_stato_idx  on public.kitchens (status, created_at desc);

create table if not exists public.kitchen_stats (
  kitchen_id       uuid primary key references public.kitchens(id) on delete cascade,
  byte_dati        bigint  not null default 0,
  sezioni          integer not null default 0,
  ultima_scrittura timestamptz,
  membri_owner     integer not null default 0,
  membri_editor    integer not null default 0,
  membri_viewer    integer not null default 0
);
create index if not exists kitchen_stats_attivita_idx
  on public.kitchen_stats (ultima_scrittura desc nulls last);

-- RLS attiva e nessuna policy: si legge solo dalle funzioni amministrative.
-- Sono i metadati di tutti i clienti messi in fila — esattamente ciò che non
-- deve uscire da una query fatta a mano dal browser di qualcuno.
alter table public.kitchen_stats enable row level security;
revoke all on table public.kitchen_stats from anon, authenticated;

create table if not exists public.platform_counters (
  chiave text primary key,
  valore bigint not null default 0
);
alter table public.platform_counters enable row level security;
revoke all on table public.platform_counters from anon, authenticated;

create or replace function public.pc_somma(p_chiave text, p_delta bigint)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.platform_counters (chiave, valore) values (p_chiave, p_delta)
  on conflict (chiave) do update set valore = platform_counters.valore + p_delta;
$$;
revoke all on function public.pc_somma(text, bigint) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Peso e ultima attività di una cucina, tenuti aggiornati a ogni salvataggio.
-- ----------------------------------------------------------------------------
create or replace function public.kitchen_data_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cucina  uuid;
  v_delta   bigint;
  v_sezioni integer;
begin
  -- In cancellazione si AGGIORNA soltanto, non si inserisce mai. Quando si
  -- rimuove una cucina, Postgres toglie prima la riga della cucina e poi le
  -- righe collegate: un insert qui proverebbe a ricreare una statistica che
  -- punta a una cucina che non c'è più, e la rimozione fallirebbe.
  if tg_op = 'DELETE' then
    update public.kitchen_stats
       set byte_dati = greatest(byte_dati - octet_length(old.value::text), 0),
           sezioni   = greatest(sezioni - 1, 0)
     where kitchen_id = old.kitchen_id;
    return null;
  end if;

  if tg_op = 'INSERT' then
    v_cucina  := new.kitchen_id;
    v_delta   := octet_length(new.value::text);
    v_sezioni := 1;
  else
    v_cucina  := new.kitchen_id;
    v_delta   := octet_length(new.value::text) - octet_length(old.value::text);
    v_sezioni := 0;
  end if;

  insert into public.kitchen_stats (kitchen_id, byte_dati, sezioni, ultima_scrittura)
  values (v_cucina, greatest(v_delta, 0), greatest(v_sezioni, 0), now())
  on conflict (kitchen_id) do update
    set byte_dati        = greatest(kitchen_stats.byte_dati + v_delta, 0),
        sezioni          = greatest(kitchen_stats.sezioni + v_sezioni, 0),
        ultima_scrittura = now();
  return null;
end;
$$;

drop trigger if exists kitchen_data_stats on public.kitchen_data;
create trigger kitchen_data_stats
  after insert or update or delete on public.kitchen_data
  for each row execute function public.kitchen_data_stats();

-- ----------------------------------------------------------------------------
-- Membri per ruolo. Si ricontano quelli della sola cucina toccata: una brigata
-- sono decine di righe, non milioni, e un conteggio esatto vale più di un
-- delta che può sfasarsi e non tornare più indietro da solo.
-- ----------------------------------------------------------------------------
create or replace function public.kitchen_members_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_cucina uuid := coalesce(new.kitchen_id, old.kitchen_id);
begin
  -- Come sopra: in cancellazione si aggiorna e basta, altrimenti la rimozione
  -- di una cucina inciamperebbe nella statistica ricreata a metà strada.
  if tg_op <> 'DELETE' then
    insert into public.kitchen_stats (kitchen_id) values (v_cucina) on conflict do nothing;
  end if;
  update public.kitchen_stats s set
    membri_owner  = (select count(*) from public.kitchen_members m where m.kitchen_id = v_cucina and m.role = 'owner'),
    membri_editor = (select count(*) from public.kitchen_members m where m.kitchen_id = v_cucina and m.role = 'editor'),
    membri_viewer = (select count(*) from public.kitchen_members m where m.kitchen_id = v_cucina and m.role = 'viewer')
  where s.kitchen_id = v_cucina;
  return null;
end;
$$;

drop trigger if exists kitchen_members_stats on public.kitchen_members;
create trigger kitchen_members_stats
  after insert or update or delete on public.kitchen_members
  for each row execute function public.kitchen_members_stats();

-- ----------------------------------------------------------------------------
-- I totali della piattaforma. Si muovono solo quando cambia davvero qualcosa:
-- rinominare una cucina non deve toccare nessun contatore.
-- ----------------------------------------------------------------------------
create or replace function public.kitchens_contatori()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.deleted_at is not distinct from old.deleted_at then
    return null;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    if old.deleted_at is not null then
      perform public.pc_somma('cucine_cancellate', -1);
    else
      perform public.pc_somma('stato:' || old.status, -1);
      perform public.pc_somma('cucine_vive', -1);
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    if new.deleted_at is not null then
      perform public.pc_somma('cucine_cancellate', 1);
    else
      perform public.pc_somma('stato:' || new.status, 1);
      perform public.pc_somma('cucine_vive', 1);
    end if;
  end if;

  if tg_op = 'INSERT' then
    insert into public.kitchen_stats (kitchen_id) values (new.id) on conflict do nothing;
  end if;

  return null;
end;
$$;

drop trigger if exists kitchens_contatori on public.kitchens;
create trigger kitchens_contatori
  after insert or update or delete on public.kitchens
  for each row execute function public.kitchens_contatori();

-- ----------------------------------------------------------------------------
-- Riempimento iniziale, e riparazione.
--
-- È l'UNICA scansione dei blob che questo file fa: una volta, all'installazione
-- (e ogni volta che si rilancia il file, che è rieseguibile). Da lì in poi i
-- numeri li tengono i trigger.
--
-- Oltre ~50.000 cucine questo blocco va spezzato a lotti, o si tiene una
-- transazione lunghissima aperta sull'intera tabella dei dati.
-- ----------------------------------------------------------------------------
do $$
begin
  insert into public.kitchen_stats (kitchen_id) select k.id from public.kitchens k
  on conflict do nothing;

  update public.kitchen_stats s set
    byte_dati        = coalesce(d.byte, 0),
    sezioni          = coalesce(d.righe, 0),
    ultima_scrittura = d.ultima,
    membri_owner     = coalesce(m.owner, 0),
    membri_editor    = coalesce(m.editor, 0),
    membri_viewer    = coalesce(m.viewer, 0)
  from public.kitchens k
  left join lateral (
    select sum(octet_length(kd.value::text))::bigint as byte,
           count(*)::integer as righe,
           max(kd.updated_at) as ultima
    from public.kitchen_data kd where kd.kitchen_id = k.id
  ) d on true
  left join lateral (
    select count(*) filter (where km.role = 'owner')::integer  as owner,
           count(*) filter (where km.role = 'editor')::integer as editor,
           count(*) filter (where km.role = 'viewer')::integer as viewer
    from public.kitchen_members km where km.kitchen_id = k.id
  ) m on true
  where s.kitchen_id = k.id;

  delete from public.platform_counters;
  insert into public.platform_counters (chiave, valore)
  select 'stato:' || k.status, count(*) from public.kitchens k
   where k.deleted_at is null group by k.status;
  insert into public.platform_counters (chiave, valore)
  select 'cucine_vive', count(*) from public.kitchens where deleted_at is null;
  insert into public.platform_counters (chiave, valore)
  select 'cucine_cancellate', count(*) from public.kitchens where deleted_at is not null;
end $$;


-- ============================================================================
-- 4. VEDERE — sola lettura, metadati e aggregati
--
-- Qui dentro non esce nessun contenuto di cucina: né ricette, né prezzi, né
-- l'anagrafica della brigata con telefoni ed email. Escono i metadati (quante
-- cucine, quanto pesano, quando le hanno toccate l'ultima volta, chi ne fa
-- parte con che ruolo) e gli aggregati. Per i contenuti serve un accesso di
-- assistenza: sezione 7, e passa da un'altra funzione.
--
-- Nota sulle email dei membri: ci sono, e servono. Cambiare il ruolo di
-- qualcuno o trasferire una proprietà si fa identificando la persona, e in
-- questo progetto è già successo di declassare il titolare sbagliato usando un
-- identificatore non aggiornato. L'email dell'ACCOUNT è un metadato del
-- rapporto commerciale; il telefono del cuoco dentro i dati della cucina no,
-- e infatti da qui non esce.
-- ============================================================================

-- Impaginazione a chiave: si riparte dall'ultima riga vista, non dalla
-- posizione. Con l'offset la pagina 5.000 costa quanto scorrere tutto ciò che
-- la precede; con la chiave costa come la prima.
-- Le due parti del cursore vanno insieme: con solo una delle due il confronto
-- di riga diventa nullo e l'elenco torna vuoto senza dire perché.
create or replace function public.admin_cursore_valido(p_quando timestamptz, p_id uuid)
returns boolean
language sql
immutable
as $$
  select (p_quando is null) = (p_id is null);
$$;
revoke all on function public.admin_cursore_valido(timestamptz, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- I numeri d'insieme.
--
-- SOGLIA_STIMA: sopra questo numero di account non si conta più riga per riga.
-- Un count(*) su auth.users a ogni caricamento della console è una scansione
-- completa, e cresce con i clienti: proprio quando la console serve di più
-- diventa quella che non risponde. Sopra la soglia si usa la stima del planner
-- e lo si DICE ("stimato": true), invece di far finta di sapere il numero esatto.
-- ----------------------------------------------------------------------------
create or replace function public.admin_numeri()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  SOGLIA_STIMA constant bigint := 200000;
  v_cucine   jsonb;
  v_account  jsonb;
  v_attivita jsonb;
  v_stima    bigint;
  v_vive     bigint;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(chiave, valore), '{}'::jsonb) into v_cucine
    from public.platform_counters;

  v_vive := coalesce((v_cucine->>'cucine_vive')::bigint, 0);
  if v_vive > SOGLIA_STIMA then
    v_attivita := jsonb_build_object('attive_7g', null, 'attive_30g', null,
      'nota', 'oltre ' || SOGLIA_STIMA || ' cucine: il conteggio degli attivi richiederebbe una scansione, va spostato su contatori aggiornati di notte');
  else
    select jsonb_build_object(
      'attive_7g',  count(*) filter (where s.ultima_scrittura > now() - interval '7 days'),
      'attive_30g', count(*) filter (where s.ultima_scrittura > now() - interval '30 days')
    ) into v_attivita from public.kitchen_stats s;
  end if;

  -- reltuples è -1 quando la tabella non è mai stata analizzata: allora non è
  -- una stima, è un "non lo so", e si conta davvero.
  select coalesce((select c.reltuples::bigint from pg_class c where c.oid = 'auth.users'::regclass), -1)
    into v_stima;

  if v_stima > SOGLIA_STIMA then
    v_account := jsonb_build_object('totali', v_stima, 'stimato', true,
      'attivi_7g', null, 'attivi_30g', null, 'nuovi_30g', null,
      'nota', 'oltre ' || SOGLIA_STIMA || ' account: totale stimato dal planner, gli attivi richiedono un indice su auth.users');
  else
    select jsonb_build_object(
      'totali',     count(*),
      'stimato',    false,
      'attivi_7g',  count(*) filter (where u.last_sign_in_at > now() - interval '7 days'),
      'attivi_30g', count(*) filter (where u.last_sign_in_at > now() - interval '30 days'),
      'nuovi_30g',  count(*) filter (where u.created_at > now() - interval '30 days')
    ) into v_account from auth.users u;
  end if;

  return jsonb_build_object(
    'cucine',   v_cucine,
    'attivita', v_attivita,
    'account',  v_account,
    'soglia_stima', SOGLIA_STIMA,
    'letto_il', now()
  );
end;
$$;
grant execute on function public.admin_numeri() to authenticated;

-- ----------------------------------------------------------------------------
-- Nuove iscrizioni nel tempo: una riga per giorno, al massimo un anno.
-- Il tetto non è pigrizia: senza, un parametro sbagliato dal browser diventa
-- una scansione di tutta la storia a ogni apertura della pagina.
-- ----------------------------------------------------------------------------
create or replace function public.admin_iscrizioni(p_giorni integer default 30)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_giorni integer := least(greatest(coalesce(p_giorni, 30), 1), 365);
  v jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'giorno', g.giorno, 'cucine', g.cucine, 'account', g.account
         ) order by g.giorno), '[]'::jsonb)
    into v
  from (
    select d::date as giorno,
           (select count(*) from public.kitchens k
             where k.created_at >= d and k.created_at < d + interval '1 day') as cucine,
           (select count(*) from auth.users u
             where u.created_at >= d and u.created_at < d + interval '1 day') as account
      from generate_series(date_trunc('day', now()) - (v_giorni - 1) * interval '1 day',
                           date_trunc('day', now()), interval '1 day') d
  ) g;

  return jsonb_build_object('giorni', v_giorni, 'serie', v);
end;
$$;
grant execute on function public.admin_iscrizioni(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- Elenco cucine, a chiave. p_dopo_creata / p_dopo_id sono l'ultima riga della
-- pagina precedente: si passano entrambi o nessuno dei due.
--
-- La ricerca per nome usa ILIKE '%...%', che nessun indice btree può servire.
-- Sopra qualche decina di migliaia di cucine va aggiunto un indice trigram:
--   create extension if not exists pg_trgm;
--   create index kitchens_nome_trgm on public.kitchens using gin (name gin_trgm_ops);
-- Non lo si crea qui perché installa un'estensione, e installare estensioni è
-- una decisione di chi possiede il database, non di questo file.
-- ----------------------------------------------------------------------------
create or replace function public.admin_cucine(
  p_cerca       text        default null,
  p_stato       text        default null,
  p_cancellate  boolean     default false,
  p_limite      integer     default 25,
  p_dopo_creata timestamptz default null,
  p_dopo_id     uuid        default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 25), 1), 100);
  v_cerca  text    := nullif(trim(coalesce(p_cerca, '')), '');
  v jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;
  if not public.admin_cursore_valido(p_dopo_creata, p_dopo_id) then
    raise exception 'Cursore incompleto: servono sia la data sia l''id dell''ultima riga vista';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]'::jsonb)
    into v
  from (
    select k.id, k.name, k.status, k.created_at, k.trial_ends_at, k.deleted_at,
           k.ai_month, k.ai_calls, k.ai_limit,
           coalesce(s.byte_dati, 0)     as byte_dati,
           coalesce(s.sezioni, 0)       as sezioni,
           s.ultima_scrittura,
           coalesce(s.membri_owner, 0)  as membri_owner,
           coalesce(s.membri_editor, 0) as membri_editor,
           coalesce(s.membri_viewer, 0) as membri_viewer
      from public.kitchens k
      left join public.kitchen_stats s on s.kitchen_id = k.id
     where (case when p_cancellate then k.deleted_at is not null else k.deleted_at is null end)
       and (p_stato is null or k.status = p_stato)
       and (v_cerca is null or k.name ilike '%' || v_cerca || '%' or k.id::text = v_cerca)
       and (p_dopo_creata is null or (k.created_at, k.id) < (p_dopo_creata, p_dopo_id))
     order by k.created_at desc, k.id desc
     limit v_limite
  ) x;

  return v;
end;
$$;
grant execute on function public.admin_cucine(text, text, boolean, integer, timestamptz, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Elenco account, a chiave. Le cucine di ciascuno si aggregano DOPO il limite:
-- così il lavoro è proporzionale alla pagina, non alla tabella.
--
-- auth.users non ha un indice su created_at, quindi l'ordinamento è un sort
-- della tabella. Fino a qualche decina di migliaia di account non si nota;
-- oltre, serve questo (da valutare: è una tabella gestita da Supabase):
--   create index concurrently users_created_idx on auth.users (created_at desc, id desc);
-- ----------------------------------------------------------------------------
create or replace function public.admin_account(
  p_cerca        text        default null,
  p_limite       integer     default 25,
  p_dopo_creato  timestamptz default null,
  p_dopo_id      uuid        default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 25), 1), 100);
  v_cerca  text    := nullif(trim(coalesce(p_cerca, '')), '');
  v jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;
  if not public.admin_cursore_valido(p_dopo_creato, p_dopo_id) then
    raise exception 'Cursore incompleto: servono sia la data sia l''id dell''ultima riga vista';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'email', p.email, 'created_at', p.created_at,
           'last_sign_in_at', p.last_sign_in_at, 'cucine', c.cucine
         ) order by p.created_at desc, p.id desc), '[]'::jsonb)
    into v
  from (
    select u.id, u.email, u.created_at, u.last_sign_in_at
      from auth.users u
     where (v_cerca is null or u.email ilike '%' || v_cerca || '%' or u.id::text = v_cerca)
       and (p_dopo_creato is null or (u.created_at, u.id) < (p_dopo_creato, p_dopo_id))
     order by u.created_at desc, u.id desc
     limit v_limite
  ) p
  left join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', k.id, 'nome', k.name, 'ruolo', m.role, 'stato', k.status
           ) order by k.name), '[]'::jsonb) as cucine
      from public.kitchen_members m
      join public.kitchens k on k.id = m.kitchen_id
     where m.user_id = p.id
  ) c on true;

  return v;
end;
$$;
grant execute on function public.admin_account(text, integer, timestamptz, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- La scheda di una cucina: metadati, membri, e le ultime cose fatte su di lei.
-- ----------------------------------------------------------------------------
create or replace function public.admin_cucina(p_kitchen uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  k public.kitchens;
  s public.kitchen_stats;
  v_membri jsonb;
  v_registro jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;

  select * into k from public.kitchens where id = p_kitchen;
  if k.id is null then return jsonb_build_object('trovata', false); end if;
  select * into s from public.kitchen_stats where kitchen_id = p_kitchen;

  -- L'email si legge da auth.users, non dalla copia in kitchen_members: la
  -- copia è ferma al giorno dell'ingresso, e agire su un identificatore vecchio
  -- è precisamente l'errore che questo progetto ha già fatto una volta.
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', m.user_id, 'email', u.email, 'email_registrata', m.email,
           'display_name', m.display_name, 'ruolo', m.role, 'dal', m.created_at,
           'ultimo_accesso', u.last_sign_in_at
         ) order by m.role, m.created_at), '[]'::jsonb)
    into v_membri
    from public.kitchen_members m
    left join auth.users u on u.id = m.user_id
   where m.kitchen_id = p_kitchen;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'quando', a.quando, 'azione', a.azione, 'esito', a.esito,
           'admin_email', a.admin_email, 'bersaglio_email', a.bersaglio_email,
           'dettagli', a.dettagli
         ) order by a.quando desc, a.id desc), '[]'::jsonb)
    into v_registro
    from (
      select * from public.admin_audit where cucina_id = p_kitchen
       order by quando desc, id desc limit 20
    ) a;

  return jsonb_build_object(
    'trovata', true,
    'cucina', jsonb_build_object(
      'id', k.id, 'name', k.name, 'status', k.status, 'created_at', k.created_at,
      'trial_ends_at', k.trial_ends_at, 'deleted_at', k.deleted_at,
      'ai_month', k.ai_month, 'ai_calls', k.ai_calls, 'ai_limit', k.ai_limit,
      'editor_vede_costi', k.editor_vede_costi,
      'editor_vede_personali', k.editor_vede_personali
    ),
    'stat', jsonb_build_object(
      'byte_dati', coalesce(s.byte_dati, 0), 'sezioni', coalesce(s.sezioni, 0),
      'ultima_scrittura', s.ultima_scrittura,
      'membri_owner', coalesce(s.membri_owner, 0),
      'membri_editor', coalesce(s.membri_editor, 0),
      'membri_viewer', coalesce(s.membri_viewer, 0)
    ),
    'membri', v_membri,
    'registro', v_registro
  );
end;
$$;
grant execute on function public.admin_cucina(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Il registro, a chiave. È l'unica lettura che serve anche quando le righe
-- saranno milioni: l'indice (quando desc, id desc) la tiene costante.
-- ----------------------------------------------------------------------------
create or replace function public.admin_registro(
  p_cucina      uuid        default null,
  p_limite      integer     default 50,
  p_dopo_quando timestamptz default null,
  p_dopo_id     bigint      default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  v jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;
  if (p_dopo_quando is null) <> (p_dopo_id is null) then
    raise exception 'Cursore incompleto: servono sia la data sia l''id dell''ultima riga vista';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.quando desc, x.id desc), '[]'::jsonb)
    into v
  from (
    select a.* from public.admin_audit a
     where (p_cucina is null or a.cucina_id = p_cucina)
       and (p_dopo_quando is null or (a.quando, a.id) < (p_dopo_quando, p_dopo_id))
     order by a.quando desc, a.id desc
     limit v_limite
  ) x;

  return v;
end;
$$;
grant execute on function public.admin_registro(uuid, integer, timestamptz, bigint) to authenticated;


-- ============================================================================
-- 5. AGIRE — ogni azione lascia una riga nel registro
--
-- Forma comune a tutte le funzioni qui sotto:
--   1. la PRIMA istruzione è il controllo di is_platform_admin(), che solleva;
--   2. i rifiuti per regola non sollevano: tornano {"ok": false, "motivo": ...}
--      e si scrivono nel registro con esito 'rifiutato'. Un tentativo di
--      togliere l'ultimo titolare a una cucina è una cosa che si deve poter
--      leggere dopo, non un errore che sparisce con la transazione;
--   3. la scrittura nel registro sta nella stessa transazione dell'azione:
--      se non si scrive, l'azione non si fa.
--
-- COME SI IDENTIFICA UNA PERSONA
-- Per id esplicito oppure per email, uno dei due, mai "quello diverso da me"
-- e mai per differenza. In questo progetto è già successo di declassare il
-- titolare sbagliato usando un identificatore non aggiornato: l'email si
-- risolve su auth.users, che è viva, non sulla copia in kitchen_members, che
-- è ferma al giorno dell'ingresso.
-- ============================================================================

create or replace function public.admin_bersaglio(p_kitchen uuid, p_user uuid, p_email text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_email  text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_id     uuid;
  v_quanti integer;
  m        public.kitchen_members;
  v_vera   text;
begin
  -- Uno dei due, non tutti e due e non nessuno: un'azione che riceve due
  -- identificatori discordi deve fermarsi, non scegliere.
  if (p_user is null) = (v_email is null) then
    return jsonb_build_object('trovato', false, 'motivo',
      'Indica la persona per id oppure per email: uno dei due, non entrambi e non nessuno.');
  end if;

  if p_user is not null then
    v_id := p_user;
  else
    -- Si contano le corrispondenze prima di prenderne una. "select into" con
    -- due righe non protesta: ne prende una, quale non si sa. Su una funzione
    -- che serve a declassare o rimuovere una persona, "quale non si sa" è
    -- l'errore che questo progetto ha già fatto una volta.
    select count(*), min(u.id) into v_quanti, v_id
      from auth.users u where lower(u.email) = v_email;

    if v_quanti = 0 then
      return jsonb_build_object('trovato', false, 'motivo', 'Nessun account con questa email.');
    end if;
    if v_quanti > 1 then
      return jsonb_build_object('trovato', false, 'motivo',
        'Ci sono ' || v_quanti || ' account con questa email: indica la persona per id, non per email.');
    end if;
    if v_id is null then
      return jsonb_build_object('trovato', false, 'motivo', 'Nessun account con questa email.');
    end if;
  end if;

  select * into m from public.kitchen_members where kitchen_id = p_kitchen and user_id = v_id;
  if m.user_id is null then
    return jsonb_build_object('trovato', false, 'motivo', 'Questa persona non fa parte di questa cucina.');
  end if;

  select u.email into v_vera from auth.users u where u.id = v_id;
  return jsonb_build_object('trovato', true, 'user_id', v_id, 'email', v_vera, 'ruolo', m.role);
end;
$$;
revoke all on function public.admin_bersaglio(uuid, uuid, text) from public, anon, authenticated;

-- Un rifiuto per regola: si registra e si racconta. Non solleva, apposta.
create or replace function public.admin_rifiuta(
  p_azione text, p_cucina uuid, p_cucina_nome text,
  p_bersaglio uuid, p_bersaglio_email text, p_motivo text, p_dettagli jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_scrivi_registro(p_azione, p_cucina, p_cucina_nome,
    p_bersaglio, p_bersaglio_email, 'rifiutato',
    coalesce(p_dettagli, '{}'::jsonb) || jsonb_build_object('motivo', p_motivo));
  return jsonb_build_object('ok', false, 'motivo', p_motivo);
end;
$$;
revoke all on function public.admin_rifiuta(text, uuid, text, uuid, text, text, jsonb)
  from public, anon, authenticated;

-- Quanti titolari resterebbero togliendo (o declassando) questa persona.
create or replace function public.admin_titolari_rimasti(p_kitchen uuid, p_escluso uuid)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer from public.kitchen_members
   where kitchen_id = p_kitchen and role = 'owner'
     and (p_escluso is null or user_id <> p_escluso);
$$;
revoke all on function public.admin_titolari_rimasti(uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Stato commerciale. Sospendere e riattivare sono questa stessa funzione con
-- 'suspended' e 'active': un'unica strada, un'unica riga di registro da leggere.
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_stato(
  p_kitchen uuid, p_stato text, p_trial_ends_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare k public.kitchens;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;

  select * into k from public.kitchens where id = p_kitchen;
  if k.id is null then
    return public.admin_rifiuta('stato', p_kitchen, null, null, null, 'Cucina non trovata.');
  end if;
  if p_stato not in ('trial', 'active', 'suspended') then
    return public.admin_rifiuta('stato', k.id, k.name, null, null,
      'Stato non ammesso: trial, active o suspended.');
  end if;

  update public.kitchens
     set status = p_stato,
         trial_ends_at = coalesce(p_trial_ends_at, trial_ends_at)
   where id = p_kitchen;

  perform public.admin_scrivi_registro('stato', k.id, k.name, null, null, 'ok',
    jsonb_build_object('da', k.status, 'a', p_stato,
                       'prova_da', k.trial_ends_at,
                       'prova_a', coalesce(p_trial_ends_at, k.trial_ends_at)));

  return jsonb_build_object('ok', true, 'stato', p_stato);
end;
$$;
grant execute on function public.admin_set_stato(uuid, text, timestamptz) to authenticated;

-- ----------------------------------------------------------------------------
-- Spostare la scadenza della prova senza toccare lo stato.
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_prova(p_kitchen uuid, p_scadenza timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare k public.kitchens;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;

  select * into k from public.kitchens where id = p_kitchen;
  if k.id is null then
    return public.admin_rifiuta('prova', p_kitchen, null, null, null, 'Cucina non trovata.');
  end if;
  if p_scadenza is null then
    return public.admin_rifiuta('prova', k.id, k.name, null, null, 'Serve una data di scadenza.');
  end if;

  update public.kitchens set trial_ends_at = p_scadenza where id = p_kitchen;

  perform public.admin_scrivi_registro('prova', k.id, k.name, null, null, 'ok',
    jsonb_build_object('da', k.trial_ends_at, 'a', p_scadenza));

  return jsonb_build_object('ok', true, 'trial_ends_at', p_scadenza);
end;
$$;
grant execute on function public.admin_set_prova(uuid, timestamptz) to authenticated;

-- ----------------------------------------------------------------------------
-- Tetto AI e contatore del mese.
-- Azzerare il contatore riporta anche il mese a quello corrente: altrimenti il
-- primo utilizzo del mese nuovo lo azzererebbe di nuovo da solo e il regalo
-- fatto al cliente sparirebbe senza spiegazione.
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_ai(
  p_kitchen uuid, p_limite integer default null, p_azzera boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare k public.kitchens;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;

  select * into k from public.kitchens where id = p_kitchen;
  if k.id is null then
    return public.admin_rifiuta('ai', p_kitchen, null, null, null, 'Cucina non trovata.');
  end if;
  if p_limite is not null and p_limite < 0 then
    return public.admin_rifiuta('ai', k.id, k.name, null, null, 'Il tetto non può essere negativo.');
  end if;
  if p_limite is null and not coalesce(p_azzera, false) then
    return public.admin_rifiuta('ai', k.id, k.name, null, null, 'Niente da cambiare.');
  end if;

  update public.kitchens
     set ai_limit = coalesce(p_limite, ai_limit),
         ai_calls = case when coalesce(p_azzera, false) then 0 else ai_calls end,
         ai_month = case when coalesce(p_azzera, false) then to_char(now(), 'YYYY-MM') else ai_month end
   where id = p_kitchen;

  perform public.admin_scrivi_registro('ai', k.id, k.name, null, null, 'ok',
    jsonb_build_object('tetto_da', k.ai_limit, 'tetto_a', coalesce(p_limite, k.ai_limit),
                       'usate_da', k.ai_calls, 'azzerato', coalesce(p_azzera, false)));

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.admin_set_ai(uuid, integer, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- Cambiare il ruolo di una persona dentro una cucina.
-- Una cucina senza titolare non è recuperabile dall'interno: nessuno può più
-- invitare, cambiare permessi, o decidere sulle richieste. Il controllo sta qui
-- e non nell'interfaccia.
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_ruolo(
  p_kitchen uuid, p_ruolo text, p_user uuid default null, p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.kitchens;
  b jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;

  select * into k from public.kitchens where id = p_kitchen;
  if k.id is null then
    return public.admin_rifiuta('ruolo', p_kitchen, null, null, null, 'Cucina non trovata.');
  end if;
  if p_ruolo not in ('owner', 'editor', 'viewer') then
    return public.admin_rifiuta('ruolo', k.id, k.name, null, null,
      'Ruolo non ammesso: owner, editor o viewer.');
  end if;

  b := public.admin_bersaglio(p_kitchen, p_user, p_email);
  if not (b->>'trovato')::boolean then
    return public.admin_rifiuta('ruolo', k.id, k.name, p_user, p_email, b->>'motivo');
  end if;

  if b->>'ruolo' = 'owner' and p_ruolo <> 'owner'
     and public.admin_titolari_rimasti(p_kitchen, (b->>'user_id')::uuid) = 0 then
    return public.admin_rifiuta('ruolo', k.id, k.name, (b->>'user_id')::uuid, b->>'email',
      'È l''unico titolare: la cucina resterebbe senza nessuno che possa gestirla. Prima nomina un altro titolare.');
  end if;

  update public.kitchen_members set role = p_ruolo
   where kitchen_id = p_kitchen and user_id = (b->>'user_id')::uuid;

  perform public.admin_scrivi_registro('ruolo', k.id, k.name,
    (b->>'user_id')::uuid, b->>'email', 'ok',
    jsonb_build_object('da', b->>'ruolo', 'a', p_ruolo));

  return jsonb_build_object('ok', true, 'user_id', b->>'user_id', 'email', b->>'email', 'ruolo', p_ruolo);
end;
$$;
grant execute on function public.admin_set_ruolo(uuid, text, uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Togliere una persona da una cucina.
-- ----------------------------------------------------------------------------
create or replace function public.admin_rimuovi_membro(
  p_kitchen uuid, p_user uuid default null, p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.kitchens;
  b jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;

  select * into k from public.kitchens where id = p_kitchen;
  if k.id is null then
    return public.admin_rifiuta('rimozione', p_kitchen, null, null, null, 'Cucina non trovata.');
  end if;

  b := public.admin_bersaglio(p_kitchen, p_user, p_email);
  if not (b->>'trovato')::boolean then
    return public.admin_rifiuta('rimozione', k.id, k.name, p_user, p_email, b->>'motivo');
  end if;

  if b->>'ruolo' = 'owner'
     and public.admin_titolari_rimasti(p_kitchen, (b->>'user_id')::uuid) = 0 then
    return public.admin_rifiuta('rimozione', k.id, k.name, (b->>'user_id')::uuid, b->>'email',
      'È l''unico titolare: prima trasferisci la proprietà a qualcun altro.');
  end if;

  delete from public.kitchen_members
   where kitchen_id = p_kitchen and user_id = (b->>'user_id')::uuid;

  perform public.admin_scrivi_registro('rimozione', k.id, k.name,
    (b->>'user_id')::uuid, b->>'email', 'ok',
    jsonb_build_object('ruolo_che_aveva', b->>'ruolo'));

  return jsonb_build_object('ok', true, 'user_id', b->>'user_id', 'email', b->>'email');
end;
$$;
grant execute on function public.admin_rimuovi_membro(uuid, uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Trasferire la proprietà.
--
-- Il nuovo titolare si indica esplicitamente. Il vecchio ANCHE: se non lo si
-- nomina, non viene declassato nessuno e la cucina resta con due titolari —
-- che è uno stato sano, mentre "declassa tutti quelli diversi dal nuovo" è il
-- genere di scorciatoia che toglie il ruolo alla persona sbagliata.
-- ----------------------------------------------------------------------------
create or replace function public.admin_trasferisci_proprieta(
  p_kitchen        uuid,
  p_nuovo_user     uuid default null,
  p_nuovo_email    text default null,
  p_vecchio_user   uuid default null,
  p_vecchio_email  text default null,
  p_declassa_a     text default 'editor'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.kitchens;
  b_nuovo   jsonb;
  b_vecchio jsonb := null;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;

  select * into k from public.kitchens where id = p_kitchen;
  if k.id is null then
    return public.admin_rifiuta('proprieta', p_kitchen, null, null, null, 'Cucina non trovata.');
  end if;
  if p_declassa_a not in ('editor', 'viewer') then
    return public.admin_rifiuta('proprieta', k.id, k.name, null, null,
      'Il vecchio titolare può diventare editor o viewer.');
  end if;

  b_nuovo := public.admin_bersaglio(p_kitchen, p_nuovo_user, p_nuovo_email);
  if not (b_nuovo->>'trovato')::boolean then
    return public.admin_rifiuta('proprieta', k.id, k.name, p_nuovo_user, p_nuovo_email,
      'Nuovo titolare: ' || (b_nuovo->>'motivo'));
  end if;

  if p_vecchio_user is not null or nullif(trim(coalesce(p_vecchio_email, '')), '') is not null then
    b_vecchio := public.admin_bersaglio(p_kitchen, p_vecchio_user, p_vecchio_email);
    if not (b_vecchio->>'trovato')::boolean then
      return public.admin_rifiuta('proprieta', k.id, k.name, p_vecchio_user, p_vecchio_email,
        'Vecchio titolare: ' || (b_vecchio->>'motivo'));
    end if;
    if b_vecchio->>'user_id' = b_nuovo->>'user_id' then
      return public.admin_rifiuta('proprieta', k.id, k.name, (b_nuovo->>'user_id')::uuid,
        b_nuovo->>'email', 'Il nuovo e il vecchio titolare sono la stessa persona.');
    end if;
  end if;

  update public.kitchen_members set role = 'owner'
   where kitchen_id = p_kitchen and user_id = (b_nuovo->>'user_id')::uuid;

  if b_vecchio is not null then
    update public.kitchen_members set role = p_declassa_a
     where kitchen_id = p_kitchen and user_id = (b_vecchio->>'user_id')::uuid;
  end if;

  -- Cintura e bretelle: se dopo tutto questo non resta nessun titolare, la
  -- transazione si annulla per intero invece di lasciare una cucina orfana.
  if public.admin_titolari_rimasti(p_kitchen, null) = 0 then
    raise exception 'Trasferimento annullato: la cucina resterebbe senza titolare';
  end if;

  perform public.admin_scrivi_registro('proprieta', k.id, k.name,
    (b_nuovo->>'user_id')::uuid, b_nuovo->>'email', 'ok',
    jsonb_build_object(
      'nuovo_titolare', b_nuovo->>'email',
      'ruolo_che_aveva', b_nuovo->>'ruolo',
      'vecchio_titolare', case when b_vecchio is null then null else b_vecchio->>'email' end,
      'vecchio_declassato_a', case when b_vecchio is null then null else p_declassa_a end));

  return jsonb_build_object('ok', true, 'nuovo', b_nuovo->>'email',
    'vecchio', case when b_vecchio is null then null else b_vecchio->>'email' end);
end;
$$;
grant execute on function public.admin_trasferisci_proprieta(uuid, uuid, text, uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Cancellazione in due passi.
--
-- Primo passo, reversibile: la cucina resta, marcata e sospesa. L'app blocca
-- già l'accesso alle cucine sospese, quindi da fuori l'effetto è immediato e
-- non serve cambiare una riga dell'applicazione.
-- ----------------------------------------------------------------------------
create or replace function public.admin_cancella_cucina(p_kitchen uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare k public.kitchens;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;

  select * into k from public.kitchens where id = p_kitchen;
  if k.id is null then
    return public.admin_rifiuta('cancellazione', p_kitchen, null, null, null, 'Cucina non trovata.');
  end if;
  if k.deleted_at is not null then
    return public.admin_rifiuta('cancellazione', k.id, k.name, null, null, 'Era già cancellata.');
  end if;

  update public.kitchens set deleted_at = now(), status = 'suspended' where id = p_kitchen;

  perform public.admin_scrivi_registro('cancellazione', k.id, k.name, null, null, 'ok',
    jsonb_build_object('stato_prima', k.status, 'motivo', p_motivo));

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.admin_cancella_cucina(uuid, text) to authenticated;

-- Ripristino. Torna sospesa, non attiva: riattivare è una seconda decisione,
-- presa guardando lo stato commerciale, non un effetto collaterale del
-- "annulla". Chi ripristina per errore non regala un abbonamento.
create or replace function public.admin_ripristina_cucina(p_kitchen uuid, p_stato text default 'suspended')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare k public.kitchens;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;

  select * into k from public.kitchens where id = p_kitchen;
  if k.id is null then
    return public.admin_rifiuta('ripristino', p_kitchen, null, null, null, 'Cucina non trovata.');
  end if;
  if k.deleted_at is null then
    return public.admin_rifiuta('ripristino', k.id, k.name, null, null, 'Non era cancellata.');
  end if;
  if p_stato not in ('trial', 'active', 'suspended') then
    return public.admin_rifiuta('ripristino', k.id, k.name, null, null, 'Stato non ammesso.');
  end if;

  update public.kitchens set deleted_at = null, status = p_stato where id = p_kitchen;

  perform public.admin_scrivi_registro('ripristino', k.id, k.name, null, null, 'ok',
    jsonb_build_object('cancellata_il', k.deleted_at, 'stato', p_stato));

  return jsonb_build_object('ok', true, 'stato', p_stato);
end;
$$;
grant execute on function public.admin_ripristina_cucina(uuid, text) to authenticated;

-- Secondo passo, definitivo. Pretende due cose che un clic distratto non ha:
-- che la cucina sia già marcata come cancellata, e il suo nome scritto per
-- esteso. Il registro si scrive PRIMA della rimozione e non ha chiavi esterne
-- verso le cucine, quindi resta anche quando la cucina non c'è più.
create or replace function public.admin_elimina_definitivamente(p_kitchen uuid, p_conferma_nome text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.kitchens;
  s public.kitchen_stats;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;

  select * into k from public.kitchens where id = p_kitchen;
  if k.id is null then
    return public.admin_rifiuta('eliminazione', p_kitchen, null, null, null, 'Cucina non trovata.');
  end if;
  if k.deleted_at is null then
    return public.admin_rifiuta('eliminazione', k.id, k.name, null, null,
      'Prima va cancellata (passo reversibile), poi eliminata.');
  end if;
  if trim(coalesce(p_conferma_nome, '')) <> trim(k.name) then
    return public.admin_rifiuta('eliminazione', k.id, k.name, null, null,
      'Il nome scritto non coincide con quello della cucina.');
  end if;

  select * into s from public.kitchen_stats where kitchen_id = p_kitchen;

  perform public.admin_scrivi_registro('eliminazione', k.id, k.name, null, null, 'ok',
    jsonb_build_object('creata_il', k.created_at, 'cancellata_il', k.deleted_at,
                       'byte_dati', coalesce(s.byte_dati, 0),
                       'membri', coalesce(s.membri_owner, 0) + coalesce(s.membri_editor, 0)
                                 + coalesce(s.membri_viewer, 0)));

  delete from public.kitchens where id = p_kitchen;

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.admin_elimina_definitivamente(uuid, text) to authenticated;


-- ============================================================================
-- 6. GLI ERRORI CHE SUCCEDONO A CASA DEI CLIENTI
--
-- Finora /api/errori scriveva nei log di Cloudflare: si guardano in diretta e
-- basta, non si interrogano e non si conservano. Un errore che capita di
-- notte, in una cucina, a una versione vecchia, lì non lo ritrova nessuno.
--
-- Chi scrive qui: SOLO il proxy server, con la chiave di servizio. Non c'è
-- nessuna policy di insert, quindi il browser non può scriverci nemmeno
-- chiamando l'API a mano — e la funzione server tiene un elenco chiuso di
-- campi, così non ci finisce dentro niente dei dati di cucina.
--
-- L'impronta è calcolata dal database, non dal client: numeri e identificativi
-- vengono sostituiti con '#' prima di prendere l'impronta, così "riga 412 non
-- trovata" e "riga 87 non trovata" finiscono nello stesso gruppo invece di
-- sembrare due problemi diversi.
-- ============================================================================
create table if not exists public.app_errors (
  id        bigint generated always as identity primary key,
  quando    timestamptz not null default now(),
  messaggio text not null,
  origine   text,
  versione  text,
  browser   text,
  ambiente  text,
  cucina_id uuid,
  utente_id uuid,
  paese     text,
  impronta  text generated always as (
    md5(
      regexp_replace(
        regexp_replace(
          lower(coalesce(messaggio, '') || ' | ' || coalesce(origine, '')),
          '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '#', 'g'),
        '[0-9]+', '#', 'g')
    )
  ) stored
);

create index if not exists app_errors_quando_idx   on public.app_errors (quando desc, id desc);
create index if not exists app_errors_impronta_idx on public.app_errors (impronta, quando desc);
create index if not exists app_errors_cucina_idx   on public.app_errors (cucina_id, quando desc);
create index if not exists app_errors_versione_idx on public.app_errors (versione, quando desc);

alter table public.app_errors enable row level security;

drop policy if exists app_errors_select on public.app_errors;
create policy app_errors_select on public.app_errors
  for select using (public.is_platform_admin());
-- Volutamente assenti: insert, update, delete. Scrive solo la chiave di
-- servizio dal proxy, che scavalca RLS.

revoke all on table public.app_errors from anon, authenticated;
grant select on table public.app_errors to authenticated;

-- ----------------------------------------------------------------------------
-- I gruppi: lo stesso errore ripetuto è UNA cosa da sistemare, non trecento
-- righe da scorrere. La finestra temporale ha un tetto perché senza, un
-- parametro sbagliato diventa una scansione di tutta la storia.
-- ----------------------------------------------------------------------------
create or replace function public.admin_errori_gruppi(
  p_giorni   integer default 7,
  p_versione text    default null,
  p_cucina   uuid    default null,
  p_limite   integer default 30
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_giorni integer := least(greatest(coalesce(p_giorni, 7), 1), 180);
  v_limite integer := least(greatest(coalesce(p_limite, 30), 1), 100);
  v jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(g) order by g.quante desc), '[]'::jsonb) into v
  from (
    select e.impronta,
           count(*)                         as quante,
           count(distinct e.cucina_id)      as cucine,
           min(e.quando)                    as prima_volta,
           max(e.quando)                    as ultima_volta,
           (array_agg(e.messaggio order by e.quando desc))[1] as messaggio,
           (array_agg(e.origine   order by e.quando desc))[1] as origine,
           array_agg(distinct e.versione)   as versioni
      from public.app_errors e
     where e.quando > now() - make_interval(days => v_giorni)
       and (p_versione is null or e.versione = p_versione)
       and (p_cucina is null or e.cucina_id = p_cucina)
     group by e.impronta
     order by count(*) desc
     limit v_limite
  ) g;

  return jsonb_build_object('giorni', v_giorni, 'gruppi', v);
end;
$$;
grant execute on function public.admin_errori_gruppi(integer, text, uuid, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- Le singole segnalazioni, a chiave. p_impronta apre un gruppo.
-- ----------------------------------------------------------------------------
create or replace function public.admin_errori(
  p_impronta    text        default null,
  p_versione    text        default null,
  p_cucina      uuid        default null,
  p_cerca       text        default null,
  p_giorni      integer     default 7,
  p_limite      integer     default 50,
  p_dopo_quando timestamptz default null,
  p_dopo_id     bigint      default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_giorni integer := least(greatest(coalesce(p_giorni, 7), 1), 180);
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_cerca  text    := nullif(trim(coalesce(p_cerca, '')), '');
  v jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;
  if (p_dopo_quando is null) <> (p_dopo_id is null) then
    raise exception 'Cursore incompleto: servono sia la data sia l''id dell''ultima riga vista';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.quando desc, x.id desc), '[]'::jsonb) into v
  from (
    select e.* from public.app_errors e
     where e.quando > now() - make_interval(days => v_giorni)
       and (p_impronta is null or e.impronta = p_impronta)
       and (p_versione is null or e.versione = p_versione)
       and (p_cucina is null or e.cucina_id = p_cucina)
       and (v_cerca is null or e.messaggio ilike '%' || v_cerca || '%')
       and (p_dopo_quando is null or (e.quando, e.id) < (p_dopo_quando, p_dopo_id))
     order by e.quando desc, e.id desc
     limit v_limite
  ) x;

  return v;
end;
$$;
grant execute on function public.admin_errori(text, text, uuid, text, integer, integer, timestamptz, bigint) to authenticated;

-- ----------------------------------------------------------------------------
-- Potatura. Le segnalazioni vecchie non servono a nessuno e costano spazio.
-- Qui la cancellazione è ammessa — al contrario del registro, che è la prova
-- di quello che ha fatto l'amministratore e non si tocca — ma resta un'azione
-- amministrativa, quindi si scrive nel registro anche lei.
-- ----------------------------------------------------------------------------
create or replace function public.admin_pulisci_errori(p_giorni integer default 90)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_giorni integer := greatest(coalesce(p_giorni, 90), 7);
  v_tolte  bigint;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;

  with tolte as (
    delete from public.app_errors where quando < now() - make_interval(days => v_giorni)
    returning 1
  )
  select count(*) into v_tolte from tolte;

  perform public.admin_scrivi_registro('pulizia_errori', null, null, null, null, 'ok',
    jsonb_build_object('piu_vecchie_di_giorni', v_giorni, 'tolte', v_tolte));

  return jsonb_build_object('ok', true, 'tolte', v_tolte);
end;
$$;
grant execute on function public.admin_pulisci_errori(integer) to authenticated;


-- ============================================================================
-- 7. ACCESSO DI ASSISTENZA — l'unica porta sui CONTENUTI di una cucina
--
-- Tutto il resto di questo file guarda metadati: quante cucine, quanto pesano,
-- chi ne fa parte. Ricette, food cost, fornitori, telefoni della brigata sono
-- un'altra cosa: sono il lavoro di qualcun altro, e un amministratore non deve
-- vederli perché ne ha la facoltà tecnica, ma perché gliel'hanno chiesto.
--
-- Quattro condizioni, tutte insieme:
--   MOTIVATO   il motivo si scrive, e non può essere vuoto;
--   A TERMINE  scade da solo, al massimo dopo un giorno;
--   REGISTRATO ogni singola lettura di contenuto finisce nel registro, non
--              solo l'apertura dell'accesso;
--   VISIBILE   il titolare della cucina lo vede — è l'unica delle quattro che
--              rende le altre tre credibili.
--
-- COSA C'È E COSA MANCA
-- C'è il meccanismo completo lato database, compresa la lettura dei contenuti
-- (admin_leggi_contenuto). Nell'interfaccia c'è l'apertura, la chiusura e
-- l'elenco degli accessi; NON c'è uno sfogliatore dei contenuti, e non è una
-- dimenticanza: un pannello che mostra le ricette dei clienti è la cosa che si
-- finisce per aprire per abitudine. Finché non serve davvero, chi ha bisogno
-- di guardare un dato passa dal SQL Editor, con l'accesso aperto, e la lettura
-- resta scritta nel registro come tutte le altre.
-- ============================================================================
create table if not exists public.admin_support_access (
  id          uuid primary key default gen_random_uuid(),
  kitchen_id  uuid not null references public.kitchens(id) on delete cascade,
  admin_id    uuid not null,
  admin_email text,
  motivo      text not null,
  concesso_il timestamptz not null default now(),
  scade_il    timestamptz not null,
  revocato_il timestamptz
);
create index if not exists support_access_cucina_idx
  on public.admin_support_access (kitchen_id, concesso_il desc);

alter table public.admin_support_access enable row level security;

-- Il titolare della cucina lo vede. È il punto: un accesso che il cliente non
-- può vedere non è un accesso di assistenza, è una porta di servizio.
drop policy if exists support_access_select on public.admin_support_access;
create policy support_access_select on public.admin_support_access
  for select using (
    public.my_role(kitchen_id) = 'owner' or public.is_platform_admin()
  );
-- Niente insert, update o delete: si passa dalle funzioni, che registrano.

revoke all on table public.admin_support_access from anon, authenticated;
grant select on table public.admin_support_access to authenticated;

-- ----------------------------------------------------------------------------
-- C'è un accesso in corso, per CHI STA CHIAMANDO?
-- L'accesso è nominativo: quello concesso a un amministratore non apre la
-- porta a un altro.
-- ----------------------------------------------------------------------------
create or replace function public.assistenza_attiva(p_kitchen uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.admin_support_access
     where kitchen_id = p_kitchen
       and admin_id = auth.uid()
       and revocato_il is null
       and scade_il > now()
  );
$$;
-- Non concessa a nessuno: la usa solo admin_leggi_contenuto, qui dentro. Una
-- funzione in più chiamabile dal browser è una superficie in più da difendere,
-- e questa non serve a niente là fuori.
revoke all on function public.assistenza_attiva(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Cosa vede il TITOLARE di una cucina: gli accessi sulla sua, e nient'altro.
-- ----------------------------------------------------------------------------
create or replace function public.assistenza_sulla_cucina(p_kitchen uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare v jsonb;
begin
  if public.my_role(p_kitchen) <> 'owner' then
    raise exception 'Solo chi gestisce la cucina può vedere gli accessi di assistenza'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'chi', a.admin_email, 'motivo', a.motivo,
           'concesso_il', a.concesso_il, 'scade_il', a.scade_il,
           'revocato_il', a.revocato_il,
           'in_corso', (a.revocato_il is null and a.scade_il > now())
         ) order by a.concesso_il desc), '[]'::jsonb)
    into v
  from (
    select * from public.admin_support_access
     where kitchen_id = p_kitchen order by concesso_il desc limit 20
  ) a;

  return v;
end;
$$;
grant execute on function public.assistenza_sulla_cucina(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Aprire un accesso. Il tetto di un giorno non è arrotondato per comodità: un
-- accesso "finché serve" resta aperto per sempre, e a quel punto le altre tre
-- condizioni non contano più niente.
-- ----------------------------------------------------------------------------
create or replace function public.admin_apri_assistenza(
  p_kitchen uuid, p_motivo text, p_minuti integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.kitchens;
  v_minuti integer := least(greatest(coalesce(p_minuti, 60), 5), 1440);
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_id uuid;
  v_scade timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;

  select * into k from public.kitchens where id = p_kitchen;
  if k.id is null then
    return public.admin_rifiuta('assistenza_apertura', p_kitchen, null, null, null, 'Cucina non trovata.');
  end if;
  if v_motivo is null or length(v_motivo) < 10 then
    return public.admin_rifiuta('assistenza_apertura', k.id, k.name, null, null,
      'Serve un motivo scritto per esteso: lo legge il titolare della cucina.');
  end if;

  v_scade := now() + make_interval(mins => v_minuti);

  insert into public.admin_support_access (kitchen_id, admin_id, admin_email, motivo, scade_il)
  values (p_kitchen, auth.uid(),
          (select u.email from auth.users u where u.id = auth.uid()),
          v_motivo, v_scade)
  returning id into v_id;

  perform public.admin_scrivi_registro('assistenza_apertura', k.id, k.name, null, null, 'ok',
    jsonb_build_object('motivo', v_motivo, 'minuti', v_minuti, 'scade_il', v_scade));

  return jsonb_build_object('ok', true, 'id', v_id, 'scade_il', v_scade);
end;
$$;
grant execute on function public.admin_apri_assistenza(uuid, text, integer) to authenticated;

create or replace function public.admin_chiudi_assistenza(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a public.admin_support_access; k public.kitchens;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;

  select * into a from public.admin_support_access where id = p_id;
  if a.id is null then
    return public.admin_rifiuta('assistenza_chiusura', null, null, null, null, 'Accesso non trovato.');
  end if;
  select * into k from public.kitchens where id = a.kitchen_id;

  update public.admin_support_access set revocato_il = now()
   where id = p_id and revocato_il is null;

  perform public.admin_scrivi_registro('assistenza_chiusura', a.kitchen_id, k.name, null, null, 'ok',
    jsonb_build_object('id', p_id, 'motivo', a.motivo));

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.admin_chiudi_assistenza(uuid) to authenticated;

-- Gli accessi su una cucina, dal lato dell'amministratore.
create or replace function public.admin_assistenze(p_kitchen uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'chi', a.admin_email, 'motivo', a.motivo,
           'concesso_il', a.concesso_il, 'scade_il', a.scade_il,
           'revocato_il', a.revocato_il,
           'in_corso', (a.revocato_il is null and a.scade_il > now())
         ) order by a.concesso_il desc), '[]'::jsonb)
    into v
  from (
    select * from public.admin_support_access
     where kitchen_id = p_kitchen order by concesso_il desc limit 20
  ) a;

  return v;
end;
$$;
grant execute on function public.admin_assistenze(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- La lettura di un contenuto. È l'unica funzione di questo file che tocca
-- kitchen_data, e ci arriva solo con un accesso di assistenza in corso.
-- Ogni chiamata scrive nel registro: non l'apertura dell'accesso — quella è
-- già scritta — ma OGNI SEZIONE LETTA, con il suo nome.
--
-- Non è "stable" apposta: scrive nel registro, quindi deve poter scrivere.
-- ----------------------------------------------------------------------------
create or replace function public.admin_leggi_contenuto(p_kitchen uuid, p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.kitchens;
  v jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Non sei amministratore della piattaforma' using errcode = '42501';
  end if;

  select * into k from public.kitchens where id = p_kitchen;
  if k.id is null then
    return public.admin_rifiuta('assistenza_lettura', p_kitchen, null, null, null, 'Cucina non trovata.');
  end if;
  if not public.assistenza_attiva(p_kitchen) then
    return public.admin_rifiuta('assistenza_lettura', k.id, k.name, null, null,
      'Serve un accesso di assistenza in corso, aperto da te, per leggere i dati di questa cucina.',
      jsonb_build_object('sezione', p_key));
  end if;

  select d.value into v from public.kitchen_data d
   where d.kitchen_id = p_kitchen and d.key = p_key;

  perform public.admin_scrivi_registro('assistenza_lettura', k.id, k.name, null, null, 'ok',
    jsonb_build_object('sezione', p_key, 'trovata', v is not null));

  return jsonb_build_object('ok', true, 'sezione', p_key, 'valore', v);
end;
$$;
grant execute on function public.admin_leggi_contenuto(uuid, text) to authenticated;


-- ############################################################################
-- ############################################################################
--
--   8. VERIFICA MANUALE — da eseguire dopo aver applicato questo file
--
--   Chi ha scritto questo file NON ha potuto eseguirlo: nessuna credenziale
--   del database, ed è giusto così. Quindi tutto quello che sta sopra, per
--   ora, è scritto e non provato. Questa sezione è il modo di provarlo.
--
--   Va fatta UNA VOLTA, dopo l'applicazione, sul database di PROVA prima che
--   su quello vero. Ogni passo dice cosa ci si deve aspettare: se il risultato
--   è diverso, FERMARSI — quello è un buco, non un dettaglio.
--
--   Le prove col browser si fanno dalla console degli strumenti per
--   sviluppatori, con l'app aperta e l'accesso fatto. L'app espone apposta
--   `window.__comanda.db`: serve esattamente a provare ad aggirare le
--   protezioni come farebbe qualcuno in malafede.
--
-- ############################################################################
-- ############################################################################


-- ============================================================================
-- 8.0 — NOMINARE IL PRIMO AMMINISTRATORE
--
-- Questo è l'unico modo. Non c'è nessuna chiamata dell'app che lo faccia, e
-- non deve essercene: si passa da qui, dal SQL Editor di Supabase, che è
-- raggiungibile solo da chi possiede il progetto.
--
-- Prima si guarda che l'account esista (l'email è quella con cui si entra
-- nell'app), poi lo si nomina. Due passi, non uno: così se l'email è scritta
-- male ci si accorge PRIMA di aver inserito una riga che non serve a niente.
-- ============================================================================

-- Passo 1 — trovare l'account. Deve restituire ESATTAMENTE UNA riga.
--   select id, email, created_at from auth.users
--    where lower(email) = lower('TUA-EMAIL@esempio.it');
--
-- Passo 2 — nominarlo. Rieseguibile: se è già amministratore non cambia nulla.
--   insert into public.platform_admins (user_id, email, nota)
--   select u.id, u.email, 'primo amministratore, nominato a mano'
--     from auth.users u
--    where lower(u.email) = lower('TUA-EMAIL@esempio.it')
--   on conflict (user_id) do nothing;
--
-- Passo 3 — controllare. Deve restituire una riga, con la tua email.
--   select user_id, email, created_at from public.platform_admins;
--
-- Per TOGLIERE un amministratore:
--   delete from public.platform_admins
--    where lower(email) = lower('EMAIL-DA-TOGLIERE@esempio.it');
--
-- Attenzione: togliere l'ultimo amministratore chiude la console a tutti. I
-- dati restano, l'app dei clienti continua a funzionare, e si rientra
-- rifacendo il passo 2 da qui. Non è un disastro, è una serata persa.


-- ============================================================================
-- 8.1 — PROVE DA UTENTE NORMALE (nessun amministratore)
--
-- Da fare con un account che NON è in platform_admins. Aprire l'app, entrare,
-- aprire la console del browser e incollare un blocco alla volta.
--
-- Il senso: un utente qualsiasi non deve ottenere NIENTE da nessuna funzione
-- amministrativa, e non deve poter diventare amministratore in nessun modo.
-- ============================================================================

-- (a) "Sono amministratore?" — deve rispondere false, non un errore.
--   await window.__comanda.db.rpc('is_platform_admin')
--   ATTESO: { data: false, error: null }

-- (b) Leggere la tabella degli amministratori.
--   await window.__comanda.db.from('platform_admins').select('*')
--   ATTESO: nessuna riga. Con RLS attiva e zero policy la tabella è vuota per
--           chi non è il proprietario del database. Un elenco di righe qui
--           sarebbe un buco grave: direbbe chi amministra la piattaforma.

-- (c) NOMINARSI AMMINISTRATORE — la prova che conta più di tutte.
--   const io = window.__comanda.utente.id;
--   await window.__comanda.db.from('platform_admins').insert({ user_id: io, email: 'x@x.it' })
--   ATTESO: error, e nessuna riga inserita. Ricontrollare poi con (a): deve
--           ancora rispondere false.

-- (d) Le funzioni di lettura.
--   for (const f of ['admin_numeri','admin_cucine','admin_account','admin_registro',
--                    'admin_errori_gruppi','admin_iscrizioni']) {
--     const r = await window.__comanda.db.rpc(f, {});
--     console.log(f, r.error ? ('ERRORE ' + r.error.message) : ('DATI ' + JSON.stringify(r.data)));
--   }
--   ATTESO: tutte ERRORE, e il messaggio deve essere
--           "Non sei amministratore della piattaforma".
--           Nessuna deve restituire dati, nemmeno un elenco vuoto.

-- (e) Le funzioni che agiscono — con l'id di una cucina di cui sei TITOLARE,
--     quindi nel caso migliore possibile per chi attacca.
--   const k = window.__comanda.cucina.id;
--   for (const [f, a] of [
--     ['admin_set_stato', { p_kitchen: k, p_stato: 'active' }],
--     ['admin_set_ai', { p_kitchen: k, p_limite: 999999 }],
--     ['admin_set_prova', { p_kitchen: k, p_scadenza: '2099-01-01' }],
--     ['admin_cancella_cucina', { p_kitchen: k }],
--     ['admin_apri_assistenza', { p_kitchen: k, p_motivo: 'provo ad entrare dove non devo' }],
--     ['admin_leggi_contenuto', { p_kitchen: k, p_key: 'recipes' }],
--   ]) {
--     const r = await window.__comanda.db.rpc(f, a);
--     console.log(f, r.error ? ('ERRORE ' + r.error.message) : ('RIUSCITA ' + JSON.stringify(r.data)));
--   }
--   ATTESO: tutte ERRORE "Non sei amministratore della piattaforma".
--   POI RICONTROLLARE, ed è la parte che si dimentica:
--     select status, ai_limit, trial_ends_at, deleted_at from public.kitchens where id = '...';
--   ATTESO: identici a prima. Un errore restituito non basta: conta che il
--           dato non si sia mosso.

-- (f) Le funzioni interne, quelle non concesse a nessuno.
--   for (const f of ['admin_scrivi_registro','admin_rifiuta','admin_bersaglio',
--                    'assistenza_attiva','pc_somma','admin_titolari_rimasti',
--                    'admin_cursore_valido','consume_ai_call']) {
--     const r = await window.__comanda.db.rpc(f, {});
--     console.log(f, r.error ? ('ERRORE ' + r.error.message) : 'RAGGIUNGIBILE');
--   }
--   ATTESO: tutte ERRORE. Se una risulta RAGGIUNGIBILE, il grant è sbagliato:
--           admin_scrivi_registro raggiungibile significa poter riempire il
--           registro di righe false, che è come cancellarlo.

-- (g) Il registro e gli errori: sono tabelle con la sola policy di lettura per
--     gli amministratori.
--   await window.__comanda.db.from('admin_audit').select('*')
--   await window.__comanda.db.from('app_errors').select('*')
--   await window.__comanda.db.from('kitchen_stats').select('*')
--   await window.__comanda.db.from('platform_counters').select('*')
--   ATTESO: nessuna riga in nessuna delle quattro.
--     admin_audit e app_errors hanno la policy di lettura, che non ti riguarda;
--     kitchen_stats e platform_counters non hanno policy affatto.
--   PERCHÉ CONTA: kitchen_stats dice quanto pesano i dati di ogni cliente e
--   quando lo ha usato l'ultima volta. È il ritratto commerciale di tutti i
--   concorrenti messi in fila.

-- (h) Scrivere nel registro o negli errori.
--   await window.__comanda.db.from('admin_audit').insert({
--     admin_id: window.__comanda.utente.id, azione: 'finta', esito: 'ok' })
--   await window.__comanda.db.from('app_errors').insert({ messaggio: 'finto' })
--   ATTESO: error su entrambe. Nessuna policy di insert su nessuna delle due.

-- (i) L'accesso di assistenza visto dal cliente.
--   await window.__comanda.db.rpc('assistenza_sulla_cucina',
--        { p_kitchen: window.__comanda.cucina.id })
--   ATTESO da TITOLARE: un elenco (vuoto se non è mai stata assistita).
--   ATTESO da EDITOR o VIEWER: errore "Solo chi gestisce la cucina...".
--   Poi con l'id di una cucina di cui NON fai parte: errore. Provalo davvero:
--   è la differenza fra "il titolare vede gli accessi sulla sua cucina" e
--   "chiunque vede chi è stato assistito".


-- ============================================================================
-- 8.2 — LE STESSE PROVE PER OGNI RUOLO
--
-- CLAUDE.md lo dice per una ragione già pagata: un buco è sfuggito perché
-- erano stati provati solo i due estremi.
--
-- Rifare TUTTO il blocco 8.1 tre volte, con tre account diversi nella stessa
-- cucina: uno owner, uno editor, uno viewer. Il risultato atteso è lo stesso
-- per tutti e tre — non cambia niente, perché nessuno dei tre ruoli di cucina
-- ha a che vedere con l'amministrazione della piattaforma. È esattamente
-- questo che si sta verificando.
--
-- E una volta per ogni combinazione delle due impostazioni della cucina
-- (editor_vede_costi × editor_vede_personali): quattro combinazioni. Non
-- dovrebbero contare nulla qui, ed è la ragione per cui vanno provate.
-- ============================================================================


-- ============================================================================
-- 8.3 — PROVE DA AMMINISTRATORE
--
-- Ora con l'account nominato al punto 8.0, sulla pagina /admin.
-- ============================================================================

-- (a) La console si apre, i numeri si vedono.
--   ATTESO: /admin mostra Numeri, Cucine, Account, Errori, Registro.
--   Se mostra "Questa pagina non è per te", la nomina non ha funzionato:
--   ricontrollare il passo 8.0 e RIFARE L'ACCESSO (il ruolo si legge dal
--   token, che va rinnovato).

-- (b) Un'azione lascia una riga nel registro. Cambiare lo stato di una cucina
--     di prova dalla console, poi:
--   select quando, admin_email, azione, cucina_nome, esito, dettagli
--     from public.admin_audit order by quando desc limit 5;
--   ATTESO: una riga 'stato', esito 'ok', con dettagli {"da":...,"a":...}.

-- (c) Un rifiuto per regola si registra ANCH'ESSO. Su una cucina con UN SOLO
--     titolare, provare a declassarlo dalla console.
--   ATTESO a schermo: "È l'unico titolare: la cucina resterebbe senza nessuno
--                      che possa gestirla."
--   ATTESO nel registro: una riga 'ruolo' con esito 'rifiutato' e il motivo.
--   ATTESO nei dati: select role from public.kitchen_members where ... → ancora 'owner'.

-- (d) Il trasferimento di proprietà non declassa nessuno che non sia stato
--     nominato. Su una cucina con due titolari, trasferire al secondo
--     lasciando VUOTO il campo del vecchio titolare.
--   ATTESO: due titolari, non uno. Nessuno declassato a sorpresa.

-- (e) La rimozione definitiva pretende due cose.
--   Provare "Elimina definitivamente" su una cucina NON cancellata:
--     ATTESO: "Prima va cancellata (passo reversibile), poi eliminata."
--   Cancellarla, poi scrivere un nome sbagliato nella conferma:
--     ATTESO: "Il nome scritto non coincide con quello della cucina."
--   Poi col nome giusto:
--     ATTESO: sparisce; e nel registro resta la riga 'eliminazione', con il
--             nome della cucina e quanti byte aveva. Verificarlo:
--     select * from public.admin_audit where azione = 'eliminazione';

-- (f) L'accesso di assistenza si vede dall'altra parte. Aprirne uno su una
--     cucina di prova, poi entrare nell'app COME TITOLARE di quella cucina e
--     aprire "Squadra".
--   ATTESO: il riquadro "Accessi dell'assistenza", con il motivo scritto e
--           l'avviso che uno è in corso.
--   Se non compare, la parte che rende onesto tutto il meccanismo non funziona.

-- (g) Senza accesso di assistenza non si leggono i contenuti.
--   select public.admin_leggi_contenuto('<id cucina senza assistenza>', 'recipes');
--   ATTESO: {"ok": false, "motivo": "Serve un accesso di assistenza in corso..."}
--   Con l'accesso aperto: i dati, E una riga 'assistenza_lettura' nel registro
--   per OGNI sezione letta. Leggerne due e contare le righe: devono essere due.


-- ============================================================================
-- 8.4 — IL REGISTRO NON SI TOCCA, NEMMENO DA QUI
--
-- Queste si eseguono nel SQL Editor, cioè col massimo dei permessi possibili.
-- È il punto: le policy le scavalca la chiave di servizio, il trigger no.
-- ============================================================================

--   update public.admin_audit set azione = 'niente' where id = (select min(id) from public.admin_audit);
--   ATTESO: ERRORE "Il registro delle azioni amministrative non si modifica e non si cancella"
--
--   delete from public.admin_audit where id = (select min(id) from public.admin_audit);
--   ATTESO: lo stesso errore.
--
--   truncate public.admin_audit;
--   ATTESO: lo stesso errore.
--
-- Se una delle tre riesce, il trigger non c'è o è stato tolto: rimetterlo
-- prima di andare avanti, perché senza di quello il registro racconta solo
-- quello che a qualcuno faceva comodo lasciarci.


-- ============================================================================
-- 8.5 — I NUMERI SI MUOVONO DA SOLI
--
-- I contatori valgono solo se restano veri. Queste prove si fanno una volta e
-- poi si rifanno il giorno che qualcuno tocca i trigger.
-- ============================================================================

--   select * from public.platform_counters order by chiave;
--   ATTESO: cucine_vive uguale a  select count(*) from public.kitchens where deleted_at is null;
--           e la somma degli 'stato:*' uguale a cucine_vive.
--
-- Poi, dall'app: creare una cucina di prova e rifare la query.
--   ATTESO: cucine_vive +1, stato:trial +1.
-- Salvarci dentro qualcosa (aggiungere un ingrediente), poi:
--   select byte_dati, sezioni, ultima_scrittura, membri_owner
--     from public.kitchen_stats where kitchen_id = '<id>';
--   ATTESO: byte_dati > 0, sezioni > 0, ultima_scrittura di adesso, membri_owner = 1.
-- Sospenderla dalla console e rifare la prima query.
--   ATTESO: stato:trial -1, stato:suspended +1, cucine_vive invariato.
-- Cancellarla (passo reversibile):
--   ATTESO: cucine_vive -1, cucine_cancellate +1.
-- Eliminarla definitivamente:
--   ATTESO: cucine_cancellate -1, e nessuna riga rimasta in kitchen_stats.
--           Se l'eliminazione fallisce con un errore di chiave esterna sulle
--           statistiche, i trigger stanno reinserendo righe durante la
--           cancellazione a catena: è il caso che i trigger qui sopra evitano
--           aggiornando e basta in DELETE, e va verificato che lo facciano.
--
-- Se i conti non tornano (per esempio dopo un ripristino da backup), si
-- rifanno da zero rieseguendo questo file: il blocco di riempimento in fondo
-- alla sezione 3 li ricostruisce contando davvero.


-- ============================================================================
-- 8.6 — L'IMPAGINAZIONE NON SALTA E NON RIPETE
--
-- La logica del cursore è già provata dai test automatici (tests/admin-console.test.js,
-- compreso il caso di righe con lo stesso istante). Qui si verifica che il
-- database faccia la sua parte: che il confronto di riga usi l'indice e non
-- perda niente.
-- ============================================================================

--   -- prima pagina
--   select id, created_at from jsonb_to_recordset(public.admin_cucine(null, null, false, 2, null, null))
--     as x(id uuid, created_at timestamptz);
--   -- seconda pagina: si passano data E id dell'ULTIMA riga della prima
--   select id, created_at from jsonb_to_recordset(
--     public.admin_cucine(null, null, false, 2, '<created_at ultima>', '<id ultima>'))
--     as x(id uuid, created_at timestamptz);
--   ATTESO: nessun id ripetuto fra le due, e continuando fino alla fine si
--           ottengono tutte le cucine, una volta ciascuna. Confrontare il
--           totale con  select count(*) from public.kitchens where deleted_at is null;
--
--   -- e che l'indice venga davvero usato:
--   explain analyze select * from public.kitchens
--     where (created_at, id) < (now(), '00000000-0000-0000-0000-000000000000')
--     order by created_at desc, id desc limit 25;
--   ATTESO: "Index Scan using kitchens_creata_idx". Se compare "Seq Scan" con
--           un ordinamento, l'indice non c'è: a poche cucine non si nota, ed è
--           proprio per questo che va guardato adesso.


-- ============================================================================
-- 8.7 — CHE NON ESCA NIENTE DI TROPPO
--
-- L'ultima, e la più facile da saltare.
-- ============================================================================

--   select public.admin_cucine();
--   select public.admin_cucina('<id di una cucina con dati veri>');
--   Leggere la risposta INTERA, con calma.
--   ATTESO: nomi di cucine, date, conteggi, byte, email degli ACCOUNT.
--   NON DEVE ESSERCI: nessun nome di ricetta, nessun prezzo, nessun fornitore,
--   nessun numero di telefono, nessun nome della brigata preso dai dati della
--   cucina. Se ci fosse, la separazione fra metadati e contenuti è saltata, e
--   con lei tutta la ragione dell'accesso di assistenza.
