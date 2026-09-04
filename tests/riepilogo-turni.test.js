// Com'è andata la generazione (app/src/lib/riepilogo-turni.js).
//
// Questa logica viveva dentro il generatore, cioè in un file che ha bisogno del
// DOM e quindi non poteva avere test. Ci è passato un ReferenceError che ha
// tolto OGNI messaggio dopo la generazione, e l'ha trovato lo chef usando
// l'app. Da qui in poi lo trova questo file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { riepilogoGenerazione } from '../app/src/lib/riepilogo-turni.js';

const vuoto = () => riepilogoGenerazione({}, {});

test('senza niente da dire, lo dice', () => {
  const r = vuoto();
  assert.equal(r.tuttoBene, true);
  assert.equal(r.scoperti.totale, 0);
  assert.deepEqual(r.scoperti.posti, []);
  assert.equal(r.esplorazione, null);
});

test('un posto scoperto non è una riga: si somma `missing`', () => {
  // È l'errore che fa dire «1 posto scoperto» quando ne mancano tre — e un
  // numero più basso del vero, in un avviso, fa sì che nessuno vada a guardare.
  const r = riepilogoGenerazione({
    shortfalls: [
      { day: '2026-09-05', service: 'cena',   stationId: 's1', missing: 3 },
      { day: '2026-09-06', service: 'pranzo', stationId: 's2', missing: 1 },
    ],
  }, { nomeStazione: id => ({ s1: 'Pass', s2: 'Primi' })[id] });

  assert.equal(r.scoperti.totale, 4);          // non 2
  assert.equal(r.scoperti.posti.length, 2);
  assert.equal(r.scoperti.posti[0].stazione, 'Pass');
  assert.equal(r.scoperti.posti[0].mancano, 3);
  assert.equal(r.tuttoBene, false);
});

test('una riga senza `missing` vale un posto', () => {
  const r = riepilogoGenerazione({
    shortfalls: [{ day: '2026-09-05', service: 'cena', stationId: 's1' }],
  }, {});
  assert.equal(r.scoperti.totale, 1);
});

test('chi ha spento i turni extra viene segnalato: è l’unico buco che si chiude parlando', () => {
  const r = riepilogoGenerazione({
    shortfalls: [
      { day: '2026-09-05', service: 'cena', stationId: 's1', missing: 1 },
      { day: '2026-09-06', service: 'cena', stationId: 's1', missing: 1 },
    ],
  }, { rinunciatari: sf => sf.day === '2026-09-05' ? ['Marco', 'Ana'] : [] });

  assert.deepEqual(r.scoperti.posti[0].rinunciatari, ['Marco', 'Ana']);
  assert.deepEqual(r.scoperti.posti[1].rinunciatari, []);
  assert.equal(r.scoperti.conRinunciatari, 1);
});

test('gli extra si raggruppano per persona, dal più carico', () => {
  const r = riepilogoGenerazione({
    extras: [{ staffName: 'Ana' }, { staffName: 'Marco' }, { staffName: 'Marco' }],
  }, {});
  assert.equal(r.extra.totale, 3);
  assert.deepEqual(r.extra.per, [{ nome: 'Marco', n: 2 }, { nome: 'Ana', n: 1 }]);
});

test('a parità di numero l’ordine è alfabetico, così due generazioni uguali si leggono uguali', () => {
  const r = riepilogoGenerazione({
    extras: [{ staffName: 'Zoe' }, { staffName: 'Ada' }, { staffName: 'Bo' }],
  }, {});
  assert.deepEqual(r.extra.per.map(x => x.nome), ['Ada', 'Bo', 'Zoe']);
});

test('le ore collocate restano distinte dagli extra', () => {
  // Un extra è oltre la quota e costa di più; un'eccedenza è dentro la quota
  // ed è già pagata. Sommarle farebbe credere allo chef di spendere soldi che
  // ha già speso.
  const r = riepilogoGenerazione({
    extras: [{ staffName: 'Ana' }],
    eccedenzeCollocate: [{ staffName: 'Marco' }, { staffName: 'Marco' }],
  }, { eccedenzaSuGiorniScelti: true });

  assert.equal(r.extra.totale, 1);
  assert.equal(r.eccedenze.totale, 2);
  assert.equal(r.eccedenze.suGiorniScelti, true);
});

test('le quote in tasca si dividono per motivo, e i due non si sommano', () => {
  const r = riepilogoGenerazione({
    quotaNonSpesa: [
      { staffName: 'Ana',   turni: 2, motivo: 'non serviva' },
      { staffName: 'Marco', turni: 4, motivo: 'settimana incompleta' },
      { staffName: 'Bo',    turni: 1, motivo: 'non serviva' },
    ],
  }, {});

  assert.equal(r.quota.nonChiesta.totale, 3);      // Ana 2 + Bo 1
  assert.equal(r.quota.aCavallo.totale, 4);        // Marco, e non è da sistemare
  assert.deepEqual(r.quota.nonChiesta.per, [{ nome: 'Ana', n: 2 }, { nome: 'Bo', n: 1 }]);
});

test('gli impegni in un’altra cucina si contano per giorno e le cucine non si ripetono', () => {
  const r = riepilogoGenerazione({
    altrove: {
      p1: { '2026-09-05': 'Da Enzo', '2026-09-06': 'Da Enzo' },
      p2: { '2026-09-05': 'Il Porto' },
    },
  }, {});
  assert.equal(r.altrove.giorni, 3);
  assert.deepEqual(r.altrove.cucine, ['Da Enzo', 'Il Porto']);
});

test('se tutte le bozze valgono uguale, non c’era margine', () => {
  // È la risposta alla domanda «con le richieste che ho messo, si poteva fare
  // di meglio?». Se il peggio e il meglio coincidono il motore non ha esplorato
  // niente: quel prospetto non è sfortunato, è l'unico che le regole permettono.
  const r = riepilogoGenerazione({
    punteggio: { totale: 1200 }, bozzeProvate: 20, punteggioPeggiore: 1200,
  }, {});
  assert.deepEqual(r.esplorazione, { bozze: 20, tuttiUguali: true });
});

test('se le bozze differivano, era il migliore di tanti', () => {
  const r = riepilogoGenerazione({
    punteggio: { totale: 800 }, bozzeProvate: 20, punteggioPeggiore: 3400,
  }, {});
  assert.deepEqual(r.esplorazione, { bozze: 20, tuttiUguali: false });
});

test('con una bozza sola non si dice niente sull’esplorazione', () => {
  const r = riepilogoGenerazione({
    punteggio: { totale: 800 }, bozzeProvate: 1, punteggioPeggiore: 800,
  }, {});
  assert.equal(r.esplorazione, null);
});

test('«tutto bene» non è «fabbisogno coperto»', () => {
  // Con due turni extra il fabbisogno È coperto, ma qualcuno sta lavorando
  // oltre la sua quota: tacere sarebbe dire una cosa falsa.
  const r = riepilogoGenerazione({ extras: [{ staffName: 'Ana' }, { staffName: 'Bo' }] }, {});
  assert.equal(r.scoperti.totale, 0);
  assert.equal(r.tuttoBene, false);
});

test('anche una sola settimana saltata rompe il «tutto bene»', () => {
  const r = riepilogoGenerazione({ settimaneSalte: ['2026-08-31'] }, {});
  assert.equal(r.tuttoBene, false);
  assert.deepEqual(r.settimaneSalte, ['2026-08-31']);
});

test('le richieste rispettate si contano in giorni e persone', () => {
  const r = riepilogoGenerazione({ nRichieste: 5, nPersoneRichieste: 3 }, {});
  assert.deepEqual(r.richieste, { giorni: 5, persone: 3 });
});

test('una stazione che non esiste più non fa saltare il riepilogo', () => {
  // Succede: si cancella una partita e restano turni che la citavano.
  const r = riepilogoGenerazione({
    shortfalls: [{ day: '2026-09-05', service: 'cena', stationId: 'sparita', missing: 1 }],
  }, { nomeStazione: () => null });
  assert.equal(r.scoperti.posti[0].stazione, null);
  assert.equal(r.scoperti.totale, 1);
});
