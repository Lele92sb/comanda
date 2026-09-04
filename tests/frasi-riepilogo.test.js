// Le frasi del riepilogo (app/src/lib/riepilogo-turni.js → frasiRiepilogo).
//
// «1 posti scoperti» è un difetto che nessun controllo vede: non è un errore di
// sintassi, non rompe niente, e per incontrarlo bisogna generare un prospetto
// che abbia esattamente un buco. Finché queste frasi stavano nella schermata
// non si potevano provare — Node non ha una pagina. Qui si chiede: «con un
// posto scoperto cosa scrivi?».
import test from 'node:test';
import assert from 'node:assert/strict';
import { riepilogoGenerazione, frasiRiepilogo } from '../app/src/lib/riepilogo-turni.js';

// Sempre senza markup: i test guardano le PAROLE, non i tag.
const frasi = (esito, ctx = {}) => frasiRiepilogo(
  riepilogoGenerazione(esito, ctx),
  Object.assign({ evidenzia: false, nomeServizio: () => 'Cena', data: () => 'sab 5',
                  giornoMese: g => g }, ctx));

const buco = (n) => ({ shortfalls: [{ day: '2026-09-05', service: 'cena', stationId: 's1', missing: n }] });

test('un posto scoperto si dice al singolare', () => {
  const f = frasi(buco(1), { nomeStazione: () => 'Pass' });
  assert.match(f.gravi[0], /^1 posto scoperto —/);
  assert.deepEqual(f.voci, ['!1 posto scoperto']);
});

test('tre posti scoperti si dicono al plurale, e sono tre non uno', () => {
  const f = frasi(buco(3), { nomeStazione: () => 'Pass' });
  assert.match(f.gravi[0], /^3 posti scoperti —/);
  assert.match(f.gravi[0], /×3/);          // il dettaglio dice quanti su quella riga
  assert.deepEqual(f.voci, ['!3 posti scoperti']);
});

test('il rimedio nomina i turni extra spenti solo se qualcuno li ha spenti', () => {
  const senza = frasi(buco(1), { nomeStazione: () => 'Pass' });
  assert.doesNotMatch(senza.gravi[1], /riaccendi/);

  const con = frasi(buco(1), { nomeStazione: () => 'Pass', rinunciatari: () => ['Marco'] });
  assert.match(con.gravi[1], /riaccendi/);
  assert.match(con.gravi[0], /extra spenti: Marco/);
});

test('un turno extra è «turno», due sono «turni»', () => {
  const uno = frasi({ extras: [{ staffName: 'Ana' }] });
  assert.match(uno.righe[0], /^1 turno extra oltre quota — Ana \(\+1\)$/);

  const due = frasi({ extras: [{ staffName: 'Ana' }, { staffName: 'Ana' }] });
  assert.match(due.righe[0], /^2 turni extra oltre quota — Ana \(\+2\)$/);
});

test('un’ora collocata è «ora», due sono «ore» — e si dice dove', () => {
  const uno = frasi({ eccedenzeCollocate: [{ staffName: 'Bo' }] });
  assert.match(uno.righe[0], /^1 ora di contratto collocata dove il servizio preme \(dentro quota, già pagata\)/);

  const due = frasi({ eccedenzeCollocate: [{ staffName: 'Bo' }, { staffName: 'Bo' }] },
                    { eccedenzaSuGiorniScelti: true });
  assert.match(due.righe[0], /^2 ore di contratto collocate sui giorni scelti \(dentro quota, già pagate\)/);
});

test('una settimana saltata è «Settimana», due sono «Settimane»', () => {
  const una = frasi({ settimaneSalte: ['31 ago'] });
  assert.match(una.righe[0], /^Settimana del 31 ago già completa, non rifatta$/);

  const due = frasi({ settimaneSalte: ['31 ago', '7 set'] });
  assert.match(due.righe[0], /^Settimane del 31 ago, 7 set già complete, non rifatte$/);
});

test('una persona vincolata è «persona», due sono «persone»', () => {
  const una = frasi({ nRichieste: 4, nPersoneRichieste: 1 });
  assert.match(una.righe[0], /su 1 persona — tutte rispettate$/);

  const due = frasi({ nRichieste: 4, nPersoneRichieste: 2 });
  assert.match(due.righe[0], /su 2 persone — tutte rispettate$/);
});

test('la riga corta somma i due motivi delle quote in tasca in un numero solo', () => {
  const f = frasi({ quotaNonSpesa: [
    { staffName: 'Ana', turni: 2, motivo: 'non serviva' },
    { staffName: 'Bo',  turni: 4, motivo: 'settimana incompleta' },
  ]});
  assert.deepEqual(f.voci, ['6 turni non assegnati']);
  // ...ma il dettaglio li tiene separati, perché sono due cose diverse
  assert.equal(f.righe.length, 2);
  assert.match(f.righe[0], /^2 turni di quota non assegnati, il fabbisogno non li chiedeva/);
  assert.match(f.righe[1], /^4 turni appartengono a settimane che il periodo taglia/);
});

test('la risposta a «si poteva fare di meglio»', () => {
  const senzaMargine = frasi({ punteggio: { totale: 1200 }, bozzeProvate: 20, punteggioPeggiore: 1200 });
  assert.match(senzaMargine.righe[0], /^20 prospetti provati, tutti equivalenti/);
  assert.match(senzaMargine.righe[0], /è il meglio ottenibile$/);

  const conMargine = frasi({ punteggio: { totale: 800 }, bozzeProvate: 20, punteggioPeggiore: 3400 });
  assert.equal(conMargine.righe[0], 'Il migliore di 20 prospetti provati');
});

test('quando non c’è niente da dire, lo dice una riga sola e la riga corta è vuota', () => {
  const f = frasi({});
  assert.deepEqual(f.gravi, []);
  assert.deepEqual(f.voci, []);
  assert.equal(f.righe.length, 1);
  assert.match(f.righe[0], /Fabbisogno coperto ovunque/);
});

test('un nome con caratteri strani passa da `esc`, non finisce grezzo nella pagina', () => {
  const f = frasiRiepilogo(
    riepilogoGenerazione({ extras: [{ staffName: '<script>' }] }, {}),
    { evidenzia: false, esc: x => String(x).replace(/</g, '&lt;') });
  assert.match(f.righe[0], /&lt;script>/);
  assert.doesNotMatch(f.righe[0], /<script>/);
});

test('con un traduttore, le frasi passano di lì e i segnaposto restano riempiti', () => {
  const f = frasiRiepilogo(
    riepilogoGenerazione(buco(2), { nomeStazione: () => 'Pass' }),
    { evidenzia: false, data: () => 'sat 5', nomeServizio: () => 'Dinner',
      t: (frase) => frase === '{n} posti scoperti' ? '{n} slots uncovered' : frase });
  assert.match(f.gravi[0], /^2 slots uncovered —/);
  assert.deepEqual(f.voci, ['!2 slots uncovered']);
});

test('il markup si può spegnere: le stesse frasi, pulite', () => {
  const conTag = frasiRiepilogo(riepilogoGenerazione(buco(2), {}), { data: () => 'sab 5', nomeServizio: () => 'Cena' });
  assert.match(conTag.gravi[0], /<b>2 posti scoperti<\/b>/);

  const senza = frasi(buco(2));
  assert.doesNotMatch(senza.gravi[0], /[<>]/);
});
