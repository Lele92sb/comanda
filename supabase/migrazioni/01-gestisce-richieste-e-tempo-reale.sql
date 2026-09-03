-- ============================================================================
-- DA APPLICARE A MANO, una volta, sul progetto Supabase.
--
-- Console Supabase → SQL Editor → incolla tutto → Run.
-- Si può rieseguire senza danni: ogni pezzo è scritto per essere ripetibile.
--
-- Contiene due cose, e sono indipendenti: se una non serve, si può togliere
-- il suo blocco e lanciare l'altro.
--
--   PARTE 1  Chi può gestire le richieste degli altri   (punto 11)
--   PARTE 2  Le modifiche in tempo reale                 (punto 10)
-- ============================================================================


-- ============================================================================
-- PARTE 1 — CHI PUÒ GESTIRE LE RICHIESTE DEGLI ALTRI
--
-- Oggi approvare o rifiutare una richiesta è solo del titolare. In una cucina
-- con venti persone il titolare diventa un collo di bottiglia per una cosa che
-- il suo secondo sa decidere meglio di lui: chi c'è sabato.
--
-- PERCHÉ UN PERMESSO E NON UN QUARTO RUOLO. I ruoli sono tre — titolare, può
-- modificare, sola lettura — e ogni ruolo nuovo li moltiplica: ognuna delle
-- funzioni che oggi confronta `= 'owner'` o `in ('owner','editor')` andrebbe
-- riletta e ridecisa, e ce ne sono quindici. Un permesso invece si aggiunge
-- accanto, si dà a chi serve, e non cambia il significato di niente che
-- esisteva già. Gli stessi `editor_vede_costi` e `editor_vede_personali`
-- funzionano così.
--
-- STA SULLA RIGA DEL MEMBRO, non dentro i dati della cucina. È la regola di
-- CLAUDE.md: chi può modificare i dati potrebbe scriversi il permesso da solo.
-- `kitchen_members` la scrive solo il titolare (policy `members_write`), quindi
-- il permesso è al sicuro lì.
-- ============================================================================

alter table public.kitchen_members
  add column if not exists gestisce_richieste boolean not null default false;

comment on column public.kitchen_members.gestisce_richieste is
  'Può vedere, approvare e rifiutare le richieste degli altri, e registrarne '
  'per chi non ha un account. NON dà accesso ai permessi né agli accessi: '
  'quelli restano del titolare.';

-- Il titolare ce l'ha sempre, senza bisogno che glielo si dia: è già suo per
-- via del ruolo, e doverglielo accendere sarebbe un modo di dimenticarselo.
create or replace function public.gestisce_richieste(p_kitchen uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role = 'owner' or gestisce_richieste
       from public.kitchen_members
      where kitchen_id = p_kitchen and user_id = auth.uid()),
    false);
$$;
grant execute on function public.gestisce_richieste(uuid) to authenticated;


-- ---- Le quattro policy delle richieste -------------------------------------
-- Cambia solo CHI: le condizioni di prima restano tutte, e accanto a
-- «sei il titolare» compare «gestisci le richieste».

-- Vedere: le proprie sempre, quelle degli altri solo a chi le gestisce.
drop policy if exists requests_select on public.kitchen_requests;
create policy requests_select on public.kitchen_requests
  for select using (
    user_id = auth.uid() or public.gestisce_richieste(kitchen_id)
  );

-- Inserire: per sé stessi chiunque, per gli altri chi le gestisce.
-- Il controllo su `staff_id` resta: senza, un dipendente potrebbe inserire
-- richieste a nome di un collega scrivendone l'identificativo.
drop policy if exists requests_insert on public.kitchen_requests;
create policy requests_insert on public.kitchen_requests
  for insert with check (
    public.gestisce_richieste(kitchen_id)
    or (user_id = auth.uid() and staff_id = public.my_staff_id(kitchen_id))
  );

-- Approvare o rifiutare. Resta la cosa più delicata: una richiesta approvata
-- è un vincolo ASSOLUTO per il generatore, e chi se la auto-approvasse si
-- prenderebbe le ferie da solo. Per questo non basta poter modificare i dati:
-- ci vuole questo permesso, e lo dà solo il titolare.
drop policy if exists requests_update on public.kitchen_requests;
create policy requests_update on public.kitchen_requests
  for update using (public.gestisce_richieste(kitchen_id))
  with check (public.gestisce_richieste(kitchen_id));

-- Ritirare: chi le gestisce sempre, l'interessato finché è in attesa.
drop policy if exists requests_delete on public.kitchen_requests;
create policy requests_delete on public.kitchen_requests
  for delete using (
    public.gestisce_richieste(kitchen_id)
    or (user_id = auth.uid() and stato = 'in_attesa')
  );


-- ============================================================================
-- PARTE 2 — LE MODIFICHE IN TEMPO REALE
--
-- Perché due persone che lavorano insieme vedano i cambiamenti dell'altra
-- senza ricaricare la pagina. Oggi chi ha la scheda aperta resta con i dati di
-- quando l'ha aperta, e se salvano tutti e due uno dei due sovrascrive
-- l'altro — il controllo dei conflitti se ne accorge, ma dopo.
--
-- QUI SI ABILITA SOLO IL CANALE. L'app comincerà ad ascoltarlo quando il
-- codice che lo usa sarà pronto; abilitarlo prima non rompe niente e non
-- cambia niente, semplicemente non lo ascolta nessuno.
--
-- LE POLICY VALGONO ANCHE QUI: Supabase manda a ciascuno solo le righe che
-- quella persona potrebbe già leggere con una SELECT. Ma ATTENZIONE, ed è la
-- ragione per cui `kitchen_data` NON è in questo elenco: la lettura dei dati
-- di una cucina passa da `leggi_sezione()`, che REDIGE — toglie i prezzi a chi
-- non li vede, i telefoni a chi non li vede, i turni non pubblicati. Il tempo
-- reale non passa da lì: manderebbe la riga INTERA, non redatta, a chiunque
-- possa leggere la tabella. Sarebbe un buco, non una funzione.
--
-- Perciò qui si abilitano solo le tabelle che non hanno niente da nascondere
-- a chi le può già leggere.
-- ============================================================================

do $$
begin
  -- `kitchen_requests` è già filtrata dalla policy `requests_select`, riga per
  -- riga: chi non gestisce le richieste vede solo le proprie, e in tempo reale
  -- riceverà solo quelle. Non c'è niente da redigere dentro una richiesta.
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'kitchen_requests'
  ) then
    alter publication supabase_realtime add table public.kitchen_requests;
  end if;
end $$;

-- La replica identity serve perché negli eventi di UPDATE e DELETE arrivi
-- anche il valore PRECEDENTE della riga: senza, si sa che qualcosa è cambiato
-- ma non cosa c'era prima, e una richiesta che passa da «in attesa» ad
-- «approvata» sarebbe indistinguibile da una appena creata.
alter table public.kitchen_requests replica identity full;


-- ============================================================================
-- COME CONTROLLARE CHE SIA ANDATA
--
--   select column_name from information_schema.columns
--    where table_name = 'kitchen_members' and column_name = 'gestisce_richieste';
--   -- deve restituire una riga
--
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' and schemaname = 'public';
--   -- deve elencare kitchen_requests
-- ============================================================================
