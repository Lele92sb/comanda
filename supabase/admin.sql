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
