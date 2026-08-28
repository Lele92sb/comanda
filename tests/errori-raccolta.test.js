// La raccolta degli errori, eseguita davvero.
//
// Questa è l'unica parte della console che si può far girare senza database:
// è codice JavaScript, e la si chiama come la chiamerebbe Cloudflare. Il punto
// che conta è uno solo — dentro app_errors non deve finire NIENTE dei dati di
// una cucina, perché quella tabella l'amministratore della piattaforma la
// legge tutta, di tutti i clienti.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, riga } from '../functions/api/errori.js';

const AMBIENTE = { SUPABASE_URL: 'https://esempio.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_finta' };

function richiesta(corpo, paese) {
  return {
    headers: { get: (n) => (n === 'CF-IPCountry' ? (paese || 'IT') : null) },
    text: async () => (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
  };
}

/** Esegue la funzione con fetch finto e restituisce risposta + chiamate fatte. */
async function esegui(corpo, { env = AMBIENTE, risposta = { ok: true, status: 201 }, esplode = false } = {}) {
  const chiamate = [];
  const vero = globalThis.fetch;
  const veroLog = console.error;
  globalThis.fetch = async (url, init) => {
    chiamate.push({ url, init, corpo: JSON.parse(init.body) });
    if (esplode) throw new Error('rete giù');
    return risposta;
  };
  console.error = () => {};
  try {
    const res = await onRequestPost({ request: richiesta(corpo), env });
    return { res, chiamate };
  } finally {
    globalThis.fetch = vero;
    console.error = veroLog;
  }
}

test('nessun contenuto della cucina arriva alla tabella degli errori', async () => {
  // Una segnalazione che si porta dietro mezza cucina: quello che il browser
  // manda in più non deve passare, qualunque nome abbia.
  const { chiamate } = await esegui({
    messaggio: 'TypeError: x is not a function',
    origine: 'at renderTurni (index.js:12)',
    versione: '1.5.0',
    ambiente: 'test',
    browser: 'Mozilla/5.0',
    cucinaId: '11111111-1111-1111-1111-111111111111',
    utenteId: '22222222-2222-2222-2222-222222222222',
    // Roba che non deve passare nemmeno per sbaglio:
    ricette: [{ nome: 'Ragù della casa', costo: 3.4 }],
    staff: [{ nome: 'Marco', telefono: '3331234567' }],
    prezzi: { pomodoro: 1.2 },
    quando: '2026-01-01T00:00:00.000Z',
  });

  assert.equal(chiamate.length, 1, 'la segnalazione doveva essere scritta');
  const scritto = chiamate[0].corpo;
  assert.deepEqual(Object.keys(scritto).sort(), [
    'ambiente', 'browser', 'cucina_id', 'messaggio', 'origine', 'paese', 'utente_id', 'versione',
  ]);
  const testo = JSON.stringify(scritto);
  for (const vietata of ['Ragù', 'Marco', '3331234567', 'pomodoro', '3.4']) {
    assert.equal(testo.includes(vietata), false, `"${vietata}" è arrivato nella tabella degli errori`);
  }
});

test('i campi lunghi vengono tagliati prima di partire', async () => {
  const { chiamate } = await esegui({
    messaggio: 'x'.repeat(5000).slice(0, 900),   // sotto il tetto del corpo, sopra quello del campo
    origine: 'y'.repeat(900),
    versione: '1.5.0',
  });
  assert.equal(chiamate[0].corpo.messaggio.length, 300);
  assert.equal(chiamate[0].corpo.origine.length, 200);
});

test('gli identificativi mancanti vanno a null, non a stringa vuota', () => {
  // Una stringa vuota in una colonna uuid non è un valore: è una scrittura
  // che fallisce, e con lei si perde la segnalazione.
  const r = riga({ messaggio: 'boom' }, 'IT');
  assert.equal(r.cucina_id, null);
  assert.equal(r.utente_id, null);
  assert.equal(r.messaggio, 'boom');
  assert.equal(r.paese, 'IT');
});

test('senza database configurato si comporta come prima: log e via', async () => {
  const { res, chiamate } = await esegui({ messaggio: 'boom' }, { env: {} });
  assert.equal(chiamate.length, 0);
  assert.equal(res.status, 204);
});

test('se il database non risponde, chi sta usando l\'app non se ne accorge', async () => {
  // La raccolta degli errori non deve mai diventare essa stessa una fonte di
  // errori, né far fallire la richiesta del browser.
  const { res } = await esegui({ messaggio: 'boom' }, { esplode: true });
  assert.equal(res.status, 204);

  const { res: res2 } = await esegui({ messaggio: 'boom' }, { risposta: { ok: false, status: 500 } });
  assert.equal(res2.status, 204);
});

test('una segnalazione senza messaggio o troppo grande viene rifiutata', async () => {
  const { res } = await esegui({ origine: 'senza messaggio' });
  assert.equal(res.status, 400);

  const { res: grande } = await esegui('x'.repeat(5000));
  assert.equal(grande.status, 413);

  const { res: rotta } = await esegui('{non json');
  assert.equal(rotta.status, 400);
});

test('la scrittura usa la chiave di servizio, non quella pubblica', async () => {
  // app_errors non ha nessuna policy di inserimento: solo la chiave che
  // scavalca RLS riesce a scriverci, ed è per questo che passa dal server.
  const { chiamate } = await esegui({ messaggio: 'boom' });
  assert.equal(chiamate[0].url, 'https://esempio.supabase.co/rest/v1/app_errors');
  assert.equal(chiamate[0].init.headers.apikey, AMBIENTE.SUPABASE_SECRET_KEY);
});
