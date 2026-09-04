-- ============================================================================
-- LE PROVE DEI PERMESSI, per ogni ruolo e per ogni impostazione.
--
-- Console Supabase -> SQL Editor -> incolla -> Run. Dura un secondo.
-- Ripetibile: non lascia niente dietro, e va rilanciata OGNI VOLTA che si
-- tocca una policy.
--
-- SOLO SUL PROGETTO DI PROVA. Per un istante toglie i vincoli verso
-- `auth.users` — serve a inventare sei persone senza creare sei account — e li
-- rimette prima di finire. Se qualcosa va storto la transazione si annulla
-- intera e non resta niente, ma su dati veri non si fa.
--
-- PERCHÉ ESISTE. Le protezioni si provavano a mano, con due account, e
-- «avevo provato solo i due estremi» è la frase con cui è passato un buco.
-- Quarantuno prove che girano in un secondo si rifanno tutte, ogni volta,
-- anche quelle che sembrano ovvie — soprattutto quelle.
--
-- COSA PROVA, e non è la stessa cosa che leggere le policy: le policy le ho
-- scritte io, e una che sembra giusta non è una prova. Qui si impersona
-- davvero ogni ruolo — `set role authenticated` più il gettone di quella
-- persona — e si guarda cosa esce. È la stessa strada che farebbe qualcuno
-- che prova ad aggirarle chiamando l'API a mano.
--
-- Va lanciata DOPO le migrazioni da 01 a 07.
-- ============================================================================

begin;

-- ---- Ci sono tutte le tabelle? --------------------------------------------
do $ctl$
declare mancanti text[];
begin
  select array_agg(t order by t) into mancanti
    from unnest(array['ingredienti','ingredienti_costi','persone','persone_personali',
                      'turni','giorni_pubblicati','piatti','piatti_costi',
                      'fornitori','fatture_importate','importazioni']) t
   where to_regclass('public.' || t) is null;
  if mancanti is not null then
    raise exception 'Mancano le tabelle: %. Lancia prima le migrazioni da 02 a 07.',
      array_to_string(mancanti, ', ');
  end if;
end $ctl$;


-- ---- Il banco di prova -----------------------------------------------------
create temporary table esiti (
  n serial, ruolo text, cosa text, atteso text, ottenuto text, esito text
) on commit drop;

create temporary table vincoli_tolti (
  tabella text, nome text, definizione text
) on commit drop;

-- Sei persone senza sei account: si tolgono i vincoli verso `auth.users` e si
-- rimettono identici alla fine — la definizione se la ricorda Postgres, non
-- la riscrivo io a memoria.
do $fk$
declare r record;
begin
  for r in
    select cl.relname as tabella, c.conname as nome, pg_get_constraintdef(c.oid) as def
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_namespace ns on ns.oid = cl.relnamespace
     where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
       and ns.nspname = 'public'
  loop
    insert into vincoli_tolti values (r.tabella, r.nome, r.def);
    execute format('alter table public.%I drop constraint %I', r.tabella, r.nome);
  end loop;
end $fk$;

-- Due cucine: nella prima chi può modificare vede tutto, nella seconda il
-- titolare si è tenuto costi e dati personali. È la combinazione che conta:
-- provare solo i due estremi è come non provare.
insert into kitchens (id, name, editor_vede_costi, editor_vede_personali, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Prova A — aperta',    true,  true,  '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Prova B — riservata', false, false, '11111111-1111-1111-1111-111111111111');

insert into kitchen_members (kitchen_id, user_id, role, gestisce_richieste) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner',  false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'editor', false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'viewer', false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'editor', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'owner',  false),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'editor', false);

insert into kitchen_data (kitchen_id, key, value) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'knowledge', '"niente"'::jsonb);

insert into ingredienti (kitchen_id, id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','i1','Burro'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','i1','Burro');
insert into ingredienti_costi (kitchen_id, id, price, supplier) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','i1', 8.20, 'Rossi'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','i1', 8.20, 'Rossi');

insert into persone (kitchen_id, id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','p1','Luca'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','p1','Luca');
insert into persone_personali (kitchen_id, id, phone, hours) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','p1','333111', 40), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','p1','333111', 40);

insert into piatti (kitchen_id, id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','d1','Risotto'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','d1','Risotto');
insert into piatti_costi (kitchen_id, id, price_actual) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','d1','24'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','d1','24');

insert into fornitori (kitchen_id, id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','f1','Rossi'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','f1','Rossi');
insert into fatture_importate (kitchen_id, documento) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','doc1'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','doc1');
insert into importazioni (kitchen_id, id, fornitore) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','im1','Rossi'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','im1','Rossi');

-- Un giorno pubblicato e uno no: è tutta la prova del «sola lettura».
insert into giorni_pubblicati (kitchen_id, giorno) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-01-01');
insert into turni (kitchen_id, staff_id, giorno, code) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','p1','2026-01-01','P'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','p1','2026-01-02','P');

-- Una richiesta di chi ha sola lettura: la vede lui, e chi le gestisce.
insert into kitchen_requests (kitchen_id, staff_id, user_id, dal, al, tipo)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'p1', '44444444-4444-4444-4444-444444444444', '2026-01-10', '2026-01-10', 'riposo');


-- ---- Impersonare, e guardare cosa esce -------------------------------------
-- `set role authenticated` più il gettone di quella persona: da qui in poi
-- Postgres applica le policy come se la richiesta arrivasse dal suo telefono.
--
-- Un UPDATE che le policy fermano NON dà errore: aggiorna zero righe. Per
-- questo si guarda `row_count` e non solo l'eccezione — confondere le due
-- cose vorrebbe dire una prova di scrittura che passa sempre.
create or replace function pg_temp.verifica(
  p_ruolo text, p_cosa text, p_utente uuid, p_sql text,
  p_atteso text, p_scrittura boolean
) returns void language plpgsql as $v$
declare ottenuto text; n bigint;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_utente, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    if p_scrittura then
      execute p_sql;
      get diagnostics n = row_count;
      ottenuto := case when n = 0 then 'negata' else 'riuscita' end;
    else
      execute p_sql into n;
      ottenuto := n::text;
    end if;
    execute 'reset role';
  exception when others then
    execute 'reset role';
    ottenuto := case when p_scrittura then 'negata'
                     else 'ERRORE: ' || sqlerrm end;
  end;
  insert into esiti (ruolo, cosa, atteso, ottenuto, esito)
  values (p_ruolo, p_cosa, p_atteso, ottenuto,
          case when ottenuto = p_atteso then 'ok' else '*** GUARDA QUI ***' end);
end $v$;

do $prove$
begin
  perform pg_temp.verifica('titolare', 'legge i prezzi degli ingredienti', '11111111-1111-1111-1111-111111111111', 'select count(*) from ingredienti_costi where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', '1', false);
  perform pg_temp.verifica('può modificare (A: vede tutto)', 'legge i prezzi degli ingredienti', '22222222-2222-2222-2222-222222222222', 'select count(*) from ingredienti_costi where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', '1', false);
  perform pg_temp.verifica('sola lettura', 'legge i prezzi degli ingredienti', '44444444-4444-4444-4444-444444444444', 'select count(*) from ingredienti_costi where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', '0', false);
  perform pg_temp.verifica('estraneo', 'legge gli ingredienti di una cucina non sua', '66666666-6666-6666-6666-666666666666', 'select count(*) from ingredienti where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', '0', false);
  perform pg_temp.verifica('può modificare (A: vede tutto)', 'legge telefoni e ore di contratto', '22222222-2222-2222-2222-222222222222', 'select count(*) from persone_personali where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', '1', false);
  perform pg_temp.verifica('sola lettura', 'legge telefoni e ore di contratto', '44444444-4444-4444-4444-444444444444', 'select count(*) from persone_personali where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', '0', false);
  perform pg_temp.verifica('titolare', 'legge kitchen_data letta direttamente', '11111111-1111-1111-1111-111111111111', 'select count(*) from kitchen_data where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', '1', false);
  perform pg_temp.verifica('può modificare (A: vede tutto)', 'legge kitchen_data letta direttamente', '22222222-2222-2222-2222-222222222222', 'select count(*) from kitchen_data where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', '0', false);
  perform pg_temp.verifica('sola lettura', 'legge kitchen_data letta direttamente', '44444444-4444-4444-4444-444444444444', 'select count(*) from kitchen_data where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', '0', false);
  perform pg_temp.verifica('può modificare (A: vede tutto)', 'legge i turni (uno pubblicato, uno no)', '22222222-2222-2222-2222-222222222222', 'select count(*) from turni where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', '2', false);
  perform pg_temp.verifica('sola lettura', 'legge i turni (uno pubblicato, uno no)', '44444444-4444-4444-4444-444444444444', 'select count(*) from turni where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', '1', false);
  perform pg_temp.verifica('estraneo', 'legge i turni di una cucina non sua', '66666666-6666-6666-6666-666666666666', 'select count(*) from turni where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', '0', false);
  perform pg_temp.verifica('sola lettura', 'legge quali giorni sono pubblicati', '44444444-4444-4444-4444-444444444444', 'select count(*) from giorni_pubblicati where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', '1', false);
  perform pg_temp.verifica('estraneo', 'legge quali giorni sono pubblicati', '66666666-6666-6666-6666-666666666666', 'select count(*) from giorni_pubblicati where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', '0', false);
  perform pg_temp.verifica('può modificare (B: niente costi né personali)', 'legge gli ingredienti (senza i prezzi)', '33333333-3333-3333-3333-333333333333', 'select count(*) from ingredienti where kitchen_id=''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''', '1', false);
  perform pg_temp.verifica('può modificare (B: niente costi né personali)', 'legge i prezzi degli ingredienti', '33333333-3333-3333-3333-333333333333', 'select count(*) from ingredienti_costi where kitchen_id=''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''', '0', false);
  perform pg_temp.verifica('può modificare (B: niente costi né personali)', 'legge la brigata (senza i telefoni)', '33333333-3333-3333-3333-333333333333', 'select count(*) from persone where kitchen_id=''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''', '1', false);
  perform pg_temp.verifica('può modificare (B: niente costi né personali)', 'legge telefoni e ore di contratto', '33333333-3333-3333-3333-333333333333', 'select count(*) from persone_personali where kitchen_id=''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''', '0', false);
  perform pg_temp.verifica('può modificare (B: niente costi né personali)', 'legge i fornitori', '33333333-3333-3333-3333-333333333333', 'select count(*) from fornitori where kitchen_id=''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''', '0', false);
  perform pg_temp.verifica('può modificare (B: niente costi né personali)', 'legge le fatture già importate', '33333333-3333-3333-3333-333333333333', 'select count(*) from fatture_importate where kitchen_id=''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''', '0', false);
  perform pg_temp.verifica('può modificare (B: niente costi né personali)', 'legge lo storico delle importazioni', '33333333-3333-3333-3333-333333333333', 'select count(*) from importazioni where kitchen_id=''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''', '0', false);
  perform pg_temp.verifica('può modificare (B: niente costi né personali)', 'legge i piatti (servono per cucinare)', '33333333-3333-3333-3333-333333333333', 'select count(*) from piatti where kitchen_id=''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''', '1', false);
  perform pg_temp.verifica('può modificare (B: niente costi né personali)', 'legge i prezzi di vendita dei piatti', '33333333-3333-3333-3333-333333333333', 'select count(*) from piatti_costi where kitchen_id=''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''', '0', false);
  perform pg_temp.verifica('titolare', 'legge i prezzi di vendita dei piatti', '11111111-1111-1111-1111-111111111111', 'select count(*) from piatti_costi where kitchen_id=''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''', '1', false);
  perform pg_temp.verifica('titolare', 'legge i fornitori', '11111111-1111-1111-1111-111111111111', 'select count(*) from fornitori where kitchen_id=''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''', '1', false);
  perform pg_temp.verifica('sola lettura', 'legge le PROPRIE richieste', '44444444-4444-4444-4444-444444444444', 'select count(*) from kitchen_requests where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', '1', false);
  perform pg_temp.verifica('può modificare (A: vede tutto)', 'legge le richieste degli ALTRI', '22222222-2222-2222-2222-222222222222', 'select count(*) from kitchen_requests where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', '0', false);
  perform pg_temp.verifica('gestisce le richieste', 'legge le richieste degli ALTRI', '55555555-5555-5555-5555-555555555555', 'select count(*) from kitchen_requests where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', '1', false);
  perform pg_temp.verifica('titolare', 'legge le richieste degli ALTRI', '11111111-1111-1111-1111-111111111111', 'select count(*) from kitchen_requests where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', '1', false);

  perform pg_temp.verifica('sola lettura', 'prova a aggiungere un ingrediente', '44444444-4444-4444-4444-444444444444', 'insert into ingredienti (kitchen_id,id,name) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'',''x1'',''X'')', 'negata', true);
  perform pg_temp.verifica('sola lettura', 'prova a scrivere un turno', '44444444-4444-4444-4444-444444444444', 'insert into turni (kitchen_id,staff_id,giorno,code) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'',''p1'',''2026-01-03'',''P'')', 'negata', true);
  perform pg_temp.verifica('estraneo', 'prova a aggiungere un ingrediente', '66666666-6666-6666-6666-666666666666', 'insert into ingredienti (kitchen_id,id,name) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'',''x2'',''X'')', 'negata', true);
  perform pg_temp.verifica('può modificare (B: niente costi né personali)', 'prova a scrivere un prezzo che non vede', '33333333-3333-3333-3333-333333333333', 'insert into ingredienti_costi (kitchen_id,id,price) values (''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'',''i1'',9)', 'negata', true);
  perform pg_temp.verifica('può modificare (B: niente costi né personali)', 'prova a aggiungere un fornitore', '33333333-3333-3333-3333-333333333333', 'insert into fornitori (kitchen_id,id,name) values (''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'',''f9'',''X'')', 'negata', true);
  perform pg_temp.verifica('può modificare (B: niente costi né personali)', 'prova a scrivere un telefono', '33333333-3333-3333-3333-333333333333', 'insert into persone_personali (kitchen_id,id,phone) values (''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'',''p1'',''333'')', 'negata', true);
  perform pg_temp.verifica('può modificare (B: niente costi né personali)', 'prova a modificare un ingrediente', '33333333-3333-3333-3333-333333333333', 'update ingredienti set name=''Y'' where kitchen_id=''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'' and id=''i1''', 'riuscita', true);
  perform pg_temp.verifica('può modificare (A: vede tutto)', 'prova a scrivere un prezzo che vede', '22222222-2222-2222-2222-222222222222', 'update ingredienti_costi set price=9 where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'' and id=''i1''', 'riuscita', true);
  perform pg_temp.verifica('sola lettura', 'prova a alzarsi il ruolo a titolare', '44444444-4444-4444-4444-444444444444', 'update kitchen_members set role=''owner'' where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'' and user_id=''44444444-4444-4444-4444-444444444444''', 'negata', true);
  perform pg_temp.verifica('può modificare (A: vede tutto)', 'prova a darsi i costi da solo', '22222222-2222-2222-2222-222222222222', 'update kitchens set editor_vede_costi=true where id=''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''', 'negata', true);
  perform pg_temp.verifica('può modificare (A: vede tutto)', 'prova a approvare la richiesta di un altro', '22222222-2222-2222-2222-222222222222', 'update kitchen_requests set stato=''approvata'' where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', 'negata', true);
  perform pg_temp.verifica('gestisce le richieste', 'prova a approvare la richiesta di un altro', '55555555-5555-5555-5555-555555555555', 'update kitchen_requests set stato=''approvata'' where kitchen_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', 'riuscita', true);
end $prove$;


-- ---- Si rimette tutto com'era ----------------------------------------------
delete from kitchens where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

do $fk2$
declare r record;
begin
  for r in select * from vincoli_tolti loop
    execute format('alter table public.%I add constraint %I %s',
                   r.tabella, r.nome, r.definizione);
  end loop;
end $fk2$;

-- E si controlla di averlo rimesso. Una prova che non pulisce è una prova che
-- la volta dopo parte da uno stato che nessuno conosce.
insert into esiti (ruolo, cosa, atteso, ottenuto, esito)
select '—', 'cucine di prova rimaste', '0', count(*)::text,
       case when count(*) = 0 then 'ok' else '*** GUARDA QUI ***' end
  from kitchens where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

insert into esiti (ruolo, cosa, atteso, ottenuto, esito)
select '—', 'vincoli verso auth.users rimessi',
       (select count(*)::text from vincoli_tolti),
       count(*)::text,
       case when count(*) = (select count(*) from vincoli_tolti)
            then 'ok' else '*** GUARDA QUI ***' end
  from pg_constraint c
  join pg_class cl on cl.oid = c.conrelid
  join pg_namespace ns on ns.oid = cl.relnamespace
 where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and ns.nspname = 'public';


-- ---- L'esito ---------------------------------------------------------------
-- Le righe che non tornano stanno in cima: se la prima dice «ok», sono tutte
-- «ok». Una riga sola con «GUARDA QUI» è un buco, non un dettaglio.
select n, ruolo, cosa, atteso, ottenuto, esito
  from esiti
 order by (esito <> 'ok') desc, n;

commit;
