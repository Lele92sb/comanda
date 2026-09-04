// Il costo del servizio, e l'incasso che serve a pagarlo
// (app/src/lib/costo-lavoro.js).
//
// Qui un errore non dà un errore: dà un numero. E un numero sbagliato in una
// schermata che dice «costo del periodo» non lo mette in dubbio nessuno — si
// legge, si decide, e ci si accorge mesi dopo che i conti non tornavano.
import test from 'node:test';
import assert from 'node:assert/strict';
import { costoDelLavoro, foodCostMedio, incassoDiPareggio, incidenza }
  from '../app/src/lib/costo-lavoro.js';

const GIORNI = ['2026-01-01', '2026-01-02', '2026-01-03'];
const ORE = { P: 8, SP: 10, R: 0, '': 0 };
const oreDi = c => ORE[c] ?? 0;

const turni = (...celle) => {
  const t = {};
  for(const [id, giorno, code] of celle){
    (t[id] ||= {})[giorno] = { code };
  }
  return t;
};

test('somma ore per tariffa, e i due totali coincidono', () => {
  const r = costoDelLavoro({
    giorni: GIORNI,
    persone: [{ id: 'a', name: 'Ada', costoOrario: 12 },
              { id: 'b', name: 'Bo',  costoOrario: 10 }],
    turni: turni(['a', '2026-01-01', 'P'], ['a', '2026-01-02', 'SP'],
                 ['b', '2026-01-01', 'P']),
    oreDi,
  });
  assert.equal(r.ore, 8 + 10 + 8);
  assert.equal(r.costo, 8 * 12 + 10 * 12 + 8 * 10);
  assert.equal(r.completo, true);
  // Il conto per giorno e il conto per persona sono lo stesso conto fatto in
  // due direzioni: se divergono, uno dei due e' sbagliato e non si sa quale.
  assert.equal(r.perGiorno.reduce((n, g) => n + g.costo, 0), r.costo);
  assert.equal(r.perGiorno.reduce((n, g) => n + g.ore, 0), r.ore);
});

test('chi lavora senza tariffa rende il totale incompleto, e si dice chi è', () => {
  const r = costoDelLavoro({
    giorni: GIORNI,
    persone: [{ id: 'a', name: 'Ada', costoOrario: 12 },
              { id: 'b', name: 'Bo' }],
    turni: turni(['a', '2026-01-01', 'P'], ['b', '2026-01-01', 'P']),
    oreDi,
  });
  assert.equal(r.completo, false);
  assert.deepEqual(r.senzaTariffa, ['Bo']);
  // Le ore ci sono lo stesso: è il COSTO che è parziale, non il lavoro.
  assert.equal(r.ore, 16);
  assert.equal(r.costo, 96);
  assert.equal(r.perGiorno[0].completo, false);
});

test('chi non ha turni nel periodo non rende incompleto niente', () => {
  const r = costoDelLavoro({
    giorni: GIORNI,
    persone: [{ id: 'a', name: 'Ada', costoOrario: 12 },
              { id: 'b', name: 'Bo' }],           // nessuna tariffa, nessun turno
    turni: turni(['a', '2026-01-01', 'P']),
    oreDi,
  });
  assert.equal(r.completo, true);
  assert.deepEqual(r.senzaTariffa, []);
});

test('una tariffa a zero è una tariffa, non un dato mancante', () => {
  const r = costoDelLavoro({
    giorni: GIORNI,
    persone: [{ id: 'a', name: 'Ada', costoOrario: 0 }],
    turni: turni(['a', '2026-01-01', 'P']),
    oreDi,
  });
  assert.equal(r.completo, true);
  assert.equal(r.costo, 0);
});

test('la tariffa scritta con la virgola vale come col punto', () => {
  const r = costoDelLavoro({
    giorni: GIORNI,
    persone: [{ id: 'a', name: 'Ada', costoOrario: '12,50' }],
    turni: turni(['a', '2026-01-01', 'P']),
    oreDi,
  });
  assert.equal(r.costo, 100);
});

test('un riposo non costa e non conta ore', () => {
  const r = costoDelLavoro({
    giorni: GIORNI,
    persone: [{ id: 'a', name: 'Ada', costoOrario: 12 }],
    turni: turni(['a', '2026-01-01', 'R']),
    oreDi,
  });
  assert.equal(r.ore, 0);
  assert.equal(r.costo, 0);
  assert.equal(r.perGiorno[0].ore, 0);
});

test('i giorni fuori periodo non entrano nel conto', () => {
  const r = costoDelLavoro({
    giorni: GIORNI,
    persone: [{ id: 'a', name: 'Ada', costoOrario: 12 }],
    turni: turni(['a', '2026-01-01', 'P'], ['a', '2026-02-20', 'P']),
    oreDi,
  });
  assert.equal(r.ore, 8);
});


// ---- Il pareggio ----------------------------------------------------------

test('per coprire 812 € di personale con la merce al 30% servono 1.160 €', () => {
  // E NON 812: di ogni euro che entra, 30 centesimi se ne vanno in merce.
  const i = incassoDiPareggio(812, 30);
  assert.ok(Math.abs(i - 1160) < 0.01, `atteso ~1160, ottenuto ${i}`);
  // La riprova: da quell'incasso, tolta la merce, resta esattamente il costo.
  assert.ok(Math.abs((i - i * 0.30) - 812) < 0.01);
});

test('senza food cost obiettivo il pareggio non si dice', () => {
  // Restituire il costo secco sembrerebbe una risposta, e sarebbe sbagliata.
  assert.equal(incassoDiPareggio(812, null), null);
  assert.equal(incassoDiPareggio(812, 0), null);
  assert.equal(incassoDiPareggio(812, 100), null);
  assert.equal(incassoDiPareggio(812, 'boh'), null);
});

test('a costo zero non c’è niente da pareggiare', () => {
  assert.equal(incassoDiPareggio(0, 30), null);
});

test('il food cost medio ignora i piatti che non ce l’hanno', () => {
  const m = foodCostMedio([
    { foodCostTargetPct: 30 },
    { foodCostTargetPct: 40 },
    { foodCostTargetPct: '' },      // non impostato: non vale zero
    { },
  ]);
  assert.equal(m, 35);
});

test('senza nessun obiettivo impostato il food cost medio è nullo', () => {
  assert.equal(foodCostMedio([{ }, { foodCostTargetPct: '' }]), null);
  assert.equal(foodCostMedio([]), null);
});

test('l’incidenza confronta due sabati diversi', () => {
  assert.equal(incidenza(812, 3000).toFixed(1), '27.1');
  assert.equal(incidenza(900, 4000).toFixed(1), '22.5');
  assert.equal(incidenza(812, 0), null);
  assert.equal(incidenza(812, null), null);
});
