// La console lato browser, eseguita davvero.
//
// Qui gira il codice, non si legge: l'impaginazione a chiave, la porta
// d'ingresso e il modo in cui si indica una persona sono tre cose che si
// possono sbagliare in silenzio, e nessuna delle tre ha bisogno di un
// database per essere provata.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Cloud } from '../app/src/lib/cloud.js';
import { CHIAMATE, bersaglio, prossimoCursore, sonoAmministratore } from '../app/src/admin/api.js';

/* ===================== L'IMPAGINAZIONE A CHIAVE ===================== */

// Il confronto di riga di Postgres: (quando, id) < (quando_cursore, id_cursore).
// Modellarlo qui serve a provare il CURSORE che costruisce la console contro
// la stessa regola che applicherà il database.
function minoreDi(riga, cursore){
  if(riga.quando !== cursore.quando) return riga.quando < cursore.quando;
  return riga.id < cursore.id;
}

function ordina(righe){
  return righe.slice().sort((a, b) =>
    a.quando === b.quando ? (a.id < b.id ? 1 : -1) : (a.quando < b.quando ? 1 : -1));
}

/** Una pagina come la restituirebbe admin_cucine / admin_registro / admin_errori. */
function paginaDalDatabase(tutte, limite, cursore){
  const filtrate = cursore ? tutte.filter(r => minoreDi(r, cursore)) : tutte;
  return filtrate.slice(0, limite);
}

// Molte righe con lo STESSO istante: è il caso che rompe l'impaginazione fatta
// sulla sola data, ed è tutt'altro che raro — due cucine create dallo stesso
// script, dieci errori dello stesso ciclo, un'importazione di fatture.
function datiConDuplicati(){
  const righe = [];
  for(let g = 0; g < 12; g++){
    const quando = '2026-0' + (1 + (g % 9)) + '-01T10:00:00.000Z';
    for(let i = 0; i < 7; i++) righe.push({ quando, id: 'id-' + g + '-' + i });
  }
  return ordina(righe);
}

test('l\'impaginazione a chiave non salta e non ripete nemmeno una riga', () => {
  const tutte = datiConDuplicati();
  const LIMITE = 10;
  const viste = [];
  let cursore = null;
  let giri = 0;

  do {
    const pagina = paginaDalDatabase(tutte, LIMITE, cursore);
    viste.push(...pagina);
    cursore = prossimoCursore(pagina, LIMITE, 'quando', 'id');
    assert.ok(++giri < 100, 'l\'impaginazione non finisce mai: il cursore non avanza');
  } while(cursore);

  assert.deepEqual(viste.map(r => r.id), tutte.map(r => r.id),
    'le righe viste non coincidono con quelle esistenti: qualcuna è saltata o ripetuta');
  assert.equal(new Set(viste.map(r => r.id)).size, tutte.length, 'ci sono righe ripetute');
});

test('con la sola data il cursore perderebbe righe: ecco perché ne servono due', () => {
  // Questo test non protegge il codice: protegge il test qui sopra. Se anche
  // un cursore fatto male passasse, quello sopra non dimostrerebbe niente.
  const tutte = datiConDuplicati();
  const LIMITE = 10;
  const viste = [];
  let cursore = null;
  let giri = 0;

  do {
    const pagina = cursore
      ? tutte.filter(r => r.quando < cursore.quando).slice(0, LIMITE)
      : tutte.slice(0, LIMITE);
    if(!pagina.length) break;
    viste.push(...pagina);
    cursore = pagina.length < LIMITE ? null : { quando: pagina[pagina.length - 1].quando };
    assert.ok(++giri < 100);
  } while(cursore);

  assert.ok(viste.length < tutte.length,
    'il cursore sulla sola data avrebbe dovuto perdere righe: il modello non riproduce il problema');
});

test('una pagina più corta del limite è l\'ultima, e non si chiede altro', () => {
  assert.equal(prossimoCursore([{ quando: 'a', id: '1' }], 25, 'quando', 'id'), null);
  assert.equal(prossimoCursore([], 25, 'quando', 'id'), null);
  const piena = Array.from({ length: 3 }, (_, i) => ({ quando: 'a', id: String(i) }));
  assert.deepEqual(prossimoCursore(piena, 3, 'quando', 'id'), { quando: 'a', id: '2' });
});

test('un cursore senza una delle due parti non viene mai costruito', () => {
  // Meglio fermare l'elenco che mandare al database una metà di cursore: là il
  // confronto diventerebbe nullo e la pagina tornerebbe vuota senza dire perché.
  const piena = [{ quando: null, id: '1' }, { quando: 'a', id: null }];
  assert.equal(prossimoCursore(piena, 2, 'quando', 'id'), null);
});

/* ===================== LA PORTA D'INGRESSO ===================== */

/** Sostituisce il client del database per la durata di una prova. */
async function conClient(rpc, fn){
  const vero = Cloud.client;
  Cloud.client = { rpc };
  try { return await fn(); } finally { Cloud.client = vero; }
}

test('la porta si chiude in caso di dubbio: solo un vero "sì" apre', async () => {
  const risposte = [
    ['la funzione non esiste (admin.sql non installato)', async () => ({ data: null, error: { message: 'function does not exist' } })],
    ['permessi negati',            async () => ({ data: null, error: { message: 'permission denied' } })],
    ['la chiamata esplode',        async () => { throw new Error('rete giù'); }],
    ['risposta vuota',             async () => ({ data: null, error: null })],
    ['un no',                      async () => ({ data: false, error: null })],
    ['una stringa che sembra sì',  async () => ({ data: 'true', error: null })],
    ['un numero che sembra sì',    async () => ({ data: 1, error: null })],
    ['un oggetto',                 async () => ({ data: {}, error: null })],
  ];
  for(const [caso, rpc] of risposte){
    const aperto = await conClient(rpc, sonoAmministratore);
    assert.equal(aperto, false, `la console si è aperta con: ${caso}`);
  }

  const vero = await conClient(async () => ({ data: true, error: null }), sonoAmministratore);
  assert.equal(vero, true, 'con un vero sì la console deve aprirsi, o non serve a niente');
});

test('la porta interroga is_platform_admin, non qualcosa che le somiglia', async () => {
  let chiamata = null;
  await conClient(async (nome) => { chiamata = nome; return { data: true, error: null }; }, sonoAmministratore);
  assert.equal(chiamata, 'is_platform_admin');
});

/* ===================== CHI È LA PERSONA ===================== */

test('senza un\'indicazione esplicita non si agisce su nessuno', () => {
  // L'errore già commesso qui dentro: declassare il titolare sbagliato usando
  // un identificatore non aggiornato. Se non c'è indicazione, ci si ferma.
  for(const niente of ['', '   ', null, undefined]){
    assert.throws(() => bersaglio(niente), /email o il suo id/);
  }
});

test('un id va come id, tutto il resto va come email', () => {
  const id = '11111111-2222-3333-4444-555555555555';
  assert.deepEqual(bersaglio(id), { p_user: id, p_email: null });
  assert.deepEqual(bersaglio('  ' + id.toUpperCase() + ' '), { p_user: id.toUpperCase(), p_email: null });
  assert.deepEqual(bersaglio('marco@ristorante.it'), { p_user: null, p_email: 'marco@ristorante.it' });
  // Una cosa che non è né l'uno né l'altra parte comunque come email: sarà il
  // database a dire "nessun account con questa email", che è la risposta giusta.
  assert.deepEqual(bersaglio('marco'), { p_user: null, p_email: 'marco' });
});

/* ===================== COME PARLA COL DATABASE ===================== */

// Il codice senza commenti: un ".from(" nominato dentro una spiegazione non è
// una query, e un test che non lo distingue è un test che si aggira scrivendo
// prosa — oppure, come è successo qui, che si accende da solo sul commento che
// racconta la regola.
const senzaCommenti = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const MODULI = readdirSync('app/src/admin')
  .filter(f => /\.js$/.test(f))
  .map(f => ({ nome: f, testo: senzaCommenti(readFileSync('app/src/admin/' + f, 'utf8')) }));

test('la console non legge nessuna tabella: solo funzioni che controllano i permessi', () => {
  // Le funzioni in admin.sql controllano is_platform_admin() come prima
  // istruzione e scrivono nel registro. Una query diretta a una tabella
  // salterebbe tutte e due le cose, e sarebbe l'unica strada che non se ne
  // accorge se un giorno una policy fosse scritta male.
  assert.ok(MODULI.length >= 3, 'i moduli della console non sono stati letti');
  for(const m of MODULI){
    // .from('tabella'): la forma con cui il client Supabase interroga una
    // tabella. Array.from(...) non c'entra e non deve far scattare niente.
    assert.equal(/\.from\s*\(\s*['"`]/.test(m.testo), false,
      `${m.nome} interroga una tabella direttamente: si passa solo dalle funzioni`);
  }
});

test('ogni chiamata al database sta nell\'elenco chiuso di quelle previste', () => {
  const usate = new Set();
  for(const m of MODULI){
    for(const trovata of m.testo.matchAll(/chiama\(\s*'([a-z0-9_]+)'/g)) usate.add(trovata[1]);
    for(const trovata of m.testo.matchAll(/\.rpc\(\s*'([a-z0-9_]+)'/g)) usate.add(trovata[1]);
  }
  assert.ok(usate.size >= 15, `attese almeno 15 chiamate, trovate ${usate.size}`);
  for(const nome of usate){
    assert.ok(CHIAMATE.includes(nome), `${nome} non è nell'elenco delle chiamate ammesse`);
  }
});

test('la console non ha nessun modo di nominare un amministratore', () => {
  // Non esiste una chiamata per farlo, e non deve esistere: si nomina solo con
  // SQL diretto, usando la chiave di servizio.
  for(const nome of CHIAMATE){
    assert.equal(/platform_admin(s)?$/.test(nome) && nome !== 'is_platform_admin', false,
      `${nome} tocca la tabella degli amministratori dal browser`);
  }
  for(const m of MODULI){
    assert.equal(/platform_admins/.test(m.testo), false,
      `${m.nome} nomina platform_admins: dal browser quella tabella non si tocca`);
  }
});
