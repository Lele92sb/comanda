// Quale database usa l'app, a seconda di come è stata costruita.
//
// Prima l'ambiente si indovinava dal nome dell'indirizzo, cercando "staging."
// all'inizio. Ha funzionato per fortuna: quando Cloudflare ha assegnato al
// progetto un nome col suffisso, bastava che l'indirizzo cadesse diversamente
// perché l'app di prova si collegasse al database vero della cucina.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sorgente = readFileSync('app/src/lib/config.js', 'utf8');

async function configCostruitaCon(ambiente){
  const codice = sorgente.replace(/__AMBIENTE__/g, JSON.stringify(ambiente ?? null));
  const modulo = await import('data:text/javascript;base64,' + Buffer.from(codice).toString('base64'));
  return modulo.COMANDA_CONFIG;
}

test('una build di produzione non usa il database di prova', async () => {
  const c = await configCostruitaCon('produzione');
  assert.equal(c.AMBIENTE, 'produzione');
  assert.equal(c.IS_TEST, false);
});

test('una build di test usa il database di prova', async () => {
  const c = await configCostruitaCon('test');
  assert.equal(c.AMBIENTE, 'test');
  assert.equal(c.IS_TEST, true);
});

test('senza indicazione si sceglie il database di PROVA, mai quello dei clienti', async () => {
  // È la regola che conta: se qualcosa va storto nella catena di pubblicazione,
  // l'errore costa una prova ripetuta, non dati veri mescolati a dati finti.
  for (const valore of [undefined, null, '', 'sbagliato', 'PRODUZIONE', 'prod']) {
    const c = await configCostruitaCon(valore);
    assert.equal(c.AMBIENTE, 'test', `con "${valore}" doveva ricadere su test`);
    assert.equal(c.IS_TEST, true);
  }
});

test('i due ambienti puntano a database diversi, o non sono separati', async () => {
  const prod = await configCostruitaCon('produzione');
  const prova = await configCostruitaCon('test');
  if (prod.SUPABASE_URL) {
    assert.notEqual(prod.SUPABASE_URL, prova.SUPABASE_URL,
      'produzione e test condividono lo stesso database: i dati veri e quelli di prova si mescolerebbero');
  }
});
