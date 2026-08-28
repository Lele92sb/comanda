// Le protezioni della console di amministrazione, verificate sul SQL consegnato.
//
// Perché questi test esistono: un ruolo che attraversa tutti i clienti è la
// cosa più pericolosa che si possa aggiungere a questa app. Le regole che lo
// tengono chiuso sono poche e precise, e ognuna è una riga che una modifica
// distratta può togliere senza che niente smetta di funzionare. Qui si controlla
// che ci siano ancora.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CODICE, funzioni, funzioniConcesse, policy, primaIstruzione } from './sql-admin.js';

// Funzioni che un utente autenticato può chiamare senza essere amministratore.
// L'elenco è chiuso apposta: aggiungerne una è una decisione, non una svista.
const APERTE_A_TUTTI = [
  'is_platform_admin',        // risponde solo su chi la chiama
  'assistenza_sulla_cucina',  // il titolare deve poter vedere gli accessi di assistenza sulla SUA cucina
];

test('il lettore del SQL vede davvero il file: senza questo i test qui sotto passerebbero a vuoto', () => {
  // Un controllo che gira su zero funzioni è verde e non dimostra niente.
  assert.ok(funzioni().length >= 3, 'nessuna funzione letta da supabase/admin.sql');
  assert.ok(funzioniConcesse().length >= 1, 'nessuna funzione risulta concessa: la lettura dei grant è rotta');
  assert.ok(policy().length >= 1, 'nessuna policy letta: la lettura delle policy è rotta');
});

test('ogni funzione amministrativa controlla i permessi come PRIMA istruzione', () => {
  for (const f of funzioniConcesse()) {
    if (APERTE_A_TUTTI.includes(f.nome)) continue;
    const prima = primaIstruzione(f.corpo).toLowerCase();
    assert.match(prima, /^if not public\.is_platform_admin\(\) then raise exception/,
      `${f.nome}: la prima istruzione deve essere il controllo di is_platform_admin(), invece è "${prima.slice(0, 80)}"`);
  }
});

test('ogni funzione amministrativa è security definer con search_path fissato', () => {
  for (const f of funzioniConcesse()) {
    if (APERTE_A_TUTTI.includes(f.nome)) continue;
    assert.match(f.intestazione, /security definer/i, `${f.nome}: manca security definer`);
    assert.match(f.intestazione, /set search_path\s*=\s*public/i, `${f.nome}: manca set search_path = public`);
  }
});

test('una funzione security definer senza search_path non esiste in questo file', () => {
  // Senza search_path fissato, chi può creare uno schema può far eseguire
  // codice suo dentro una funzione che gira con i permessi del proprietario.
  for (const f of funzioni()) {
    if (!/security definer/i.test(f.intestazione)) continue;
    assert.match(f.intestazione, /set search_path\s*=\s*public/i, `${f.nome}: security definer senza search_path`);
  }
});

test('solo le funzioni previste sono concesse agli utenti autenticati', () => {
  for (const f of funzioniConcesse()) {
    if (APERTE_A_TUTTI.includes(f.nome)) continue;
    assert.match(f.nome, /^admin_/,
      `${f.nome} è chiamabile da chiunque abbia un account: o si chiama admin_* e controlla i permessi, o va nell'elenco delle eccezioni con una ragione`);
  }
});

test('nessuna policy scritta FOR ALL: in Postgres comprende anche la SELECT', () => {
  // È il buco che questo progetto ha già avuto una volta, su kitchen_data.
  assert.equal(/create policy[\s\S]*?for\s+all\b/i.test(CODICE), false,
    'una policy "for all" in questo file concederebbe anche la lettura');
  for (const p of policy()) {
    assert.ok(['select', 'insert', 'update', 'delete'].includes(p.operazione),
      `policy ${p.nome}: operazione "${p.operazione}" non è una delle quattro separate`);
  }
});

test('platform_admins non è scrivibile da nessuna funzione dell\'app', () => {
  // Nessuna via per auto-nominarsi: né una policy, né una funzione concessa.
  assert.equal(policy().some(p => p.tabella === 'platform_admins'), false,
    'platform_admins non deve avere policy: con RLS attiva e zero policy la tabella è invisibile agli utenti');
  assert.match(CODICE, /revoke all on table public\.platform_admins from anon, authenticated/i);

  for (const f of funzioni()) {
    const scrive = /(insert\s+into|update|delete\s+from)\s+public\.platform_admins/i.test(f.corpo);
    assert.equal(scrive, false, `${f.nome} scrive su platform_admins: nessuna funzione deve poterlo fare`);
  }
});

test('platform_admins non nasce da un trigger o da una scrittura nascosta', () => {
  // Il conteggio, non solo il pattern: se qualcuno aggiunge una INSERT qui
  // dentro fuori dalle funzioni, questo test la vede lo stesso.
  const scritture = CODICE.match(/(insert\s+into|update|delete\s+from)\s+public\.platform_admins/gi) || [];
  assert.deepEqual(scritture, [],
    'in questo file non deve esistere nessuna scrittura su platform_admins: si nomina un amministratore solo con SQL diretto');
});

test('nessuna funzione amministrativa legge i contenuti delle cucine', () => {
  // La separazione che tiene in piedi tutto il resto: l'amministratore vede
  // METADATI (quante cucine, quanto pesano, chi ne fa parte), non ricette,
  // prezzi o anagrafiche. L'unica porta sui contenuti è quella dell'accesso
  // di assistenza, che è motivata, a scadenza e registrata.
  const PORTA_SUI_CONTENUTI = ['admin_leggi_contenuto'];
  for (const f of funzioniConcesse()) {
    if (PORTA_SUI_CONTENUTI.includes(f.nome)) continue;
    assert.equal(/\bkitchen_data\b/.test(f.corpo), false,
      `${f.nome} tocca kitchen_data: i contenuti di una cucina non escono dalle funzioni di consultazione`);
  }
});

test('la porta sui contenuti chiede l\'accesso di assistenza e registra ogni lettura', () => {
  const f = funzioni().find(x => x.nome === 'admin_leggi_contenuto');
  if (!f) return;   // finché non esiste, non c'è niente da proteggere
  assert.match(f.corpo, /assistenza_attiva/,
    'admin_leggi_contenuto deve pretendere un accesso di assistenza in corso');
  assert.match(f.corpo, /admin_scrivi_registro/,
    'ogni lettura di contenuto va scritta nel registro: è il senso dell\'accesso di assistenza');
});

test('il registro non si modifica e non si cancella', () => {
  const suRegistro = policy().filter(p => p.tabella === 'admin_audit');
  assert.deepEqual(suRegistro.map(p => p.operazione), ['select'],
    'admin_audit deve avere solo la policy di lettura: niente insert, update o delete');

  // Le policy le scavalca la chiave di servizio; il trigger no.
  assert.match(CODICE, /create trigger admin_audit_no_update\s+before update or delete on public\.admin_audit/i);
  assert.match(CODICE, /create trigger admin_audit_no_truncate\s+before truncate on public\.admin_audit/i);
  assert.match(CODICE, /create or replace function public\.admin_audit_immutabile[\s\S]*?raise exception/i);
});

test('la scrittura nel registro non è concessa a nessun ruolo', () => {
  // Se fosse chiamabile dall'app, chiunque potrebbe riempire il registro di
  // righe false e rendere illeggibile quello vero.
  assert.match(CODICE,
    /revoke all on function public\.admin_scrivi_registro\([^)]*\)\s*\n?\s*from public, anon, authenticated/i);
  assert.equal(funzioniConcesse().some(f => f.nome === 'admin_scrivi_registro'), false);
});

test('ogni azione amministrativa lascia una riga nel registro', () => {
  // Una funzione che cambia qualcosa e non scrive nel registro è un potere
  // senza traccia: è la cosa che questa console non deve avere.
  const scrive = /(insert\s+into|update|delete\s+from)\s+public\.(kitchens|kitchen_members|kitchen_data|kitchen_invites|kitchen_requests)\b/i;
  let contate = 0;
  for (const f of funzioniConcesse()) {
    if (!scrive.test(f.corpo)) continue;
    contate++;
    assert.match(f.corpo, /admin_scrivi_registro/,
      `${f.nome} cambia i dati di un cliente senza scrivere nel registro`);
  }
  assert.ok(contate >= 6, `attese almeno 6 funzioni che modificano, trovate ${contate}`);
});

test('nessuna cucina può restare senza titolare', () => {
  // Una cucina senza titolare non si ripara dall'interno: nessuno può più
  // invitare, cambiare permessi o decidere sulle richieste.
  for (const nome of ['admin_set_ruolo', 'admin_rimuovi_membro', 'admin_trasferisci_proprieta']) {
    const f = funzioni().find(x => x.nome === nome);
    assert.ok(f, `manca ${nome}`);
    assert.match(f.corpo, /admin_titolari_rimasti/,
      `${nome} può togliere un titolare senza contare quelli che restano`);
  }
});

test('le persone si identificano per id o per email, mai per differenza da chi agisce', () => {
  // L'errore già commesso in questo progetto: declassare il titolare
  // sbagliato usando un identificatore non aggiornato. Una funzione che
  // guarda auth.uid() per decidere SU CHI agire è la stessa classe di errore.
  for (const nome of ['admin_set_ruolo', 'admin_rimuovi_membro', 'admin_trasferisci_proprieta']) {
    const f = funzioni().find(x => x.nome === nome);
    assert.equal(/auth\.uid\(\)/.test(f.corpo), false,
      `${nome} guarda chi sta agendo per scegliere il bersaglio: deve riceverlo esplicito`);
    assert.match(f.corpo, /admin_bersaglio/, `${nome} deve risolvere la persona da admin_bersaglio`);
  }

  const b = funzioni().find(x => x.nome === 'admin_bersaglio');
  assert.ok(b, 'manca admin_bersaglio');
  assert.match(b.corpo, /\(p_user is null\) = \(v_email is null\)/,
    'admin_bersaglio deve pretendere uno e un solo identificatore');
  // L'email si risolve sulla tabella viva, non sulla copia ferma al giorno
  // dell'ingresso: è la copia vecchia che fa sbagliare persona.
  assert.match(b.corpo, /from auth\.users u where lower\(u\.email\)/);

  // E si contano le corrispondenze prima di prenderne una: "select into" con
  // due righe non protesta, ne prende una a caso. Su una funzione che serve a
  // declassare o rimuovere qualcuno, "una a caso" è la persona sbagliata.
  assert.match(b.corpo, /select count\(\*\)[\s\S]*?into v_quanti/,
    'admin_bersaglio deve contare le corrispondenze, non prendere la prima');
  assert.match(b.corpo, /v_quanti > 1/,
    'admin_bersaglio deve rifiutarsi di scegliere fra due account con la stessa email');
});

test('la rimozione definitiva è un secondo passo, e chiede il nome per esteso', () => {
  const f = funzioni().find(x => x.nome === 'admin_elimina_definitivamente');
  assert.ok(f, 'manca admin_elimina_definitivamente');
  assert.match(f.corpo, /deleted_at is null/, 'deve pretendere che la cucina sia già cancellata');
  assert.match(f.corpo, /p_conferma_nome/, 'deve pretendere il nome scritto per esteso');
  // Il registro prima della rimozione: dopo, la cucina non c'è più.
  assert.ok(f.corpo.indexOf('admin_scrivi_registro') < f.corpo.indexOf('delete from public.kitchens'),
    'la riga di registro va scritta prima della rimozione');
});

test('il registro si scrive nella stessa transazione dell\'azione', () => {
  // Nessun "exception when others" attorno alla scrittura: se il registro non
  // si scrive, l'azione non si fa. È la proprietà richiesta.
  const log = funzioni().find(f => f.nome === 'admin_scrivi_registro');
  assert.ok(log, 'manca admin_scrivi_registro');
  assert.equal(/exception\s+when/i.test(log.corpo), false,
    'admin_scrivi_registro non deve inghiottire i propri errori');
  assert.match(log.corpo, /admin_id/, 'il registro deve dire chi ha agito');
});
