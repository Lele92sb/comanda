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

test('la riga corta somma tutte le quote in tasca in un numero solo', () => {
  const f = frasi({ quotaNonSpesa: [
    { staffName: 'Ana', turni: 2, motivo: 'le giornate erano già coperte' },
    { staffName: 'Bo',  turni: 4, motivo: 'settimana incompleta' },
  ]});
  assert.deepEqual(f.voci, ['6 turni non assegnati']);
  // ...ma il dettaglio le tiene separate per motivo, perché portano a fare
  // cose diverse: una si sistema generando il resto del mese, l'altra no.
  assert.equal(f.righe.length, 2);
  assert.match(f.righe[0], /^4 turni di quota non assegnati perché appartengono a settimane che il periodo taglia/);
  assert.match(f.righe[1], /^2 turni di quota non assegnati perché il fabbisogno era già coperto/);
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

test('una quota sola non è «1 turni»', () => {
  // Il difetto che lo chef ha letto a schermo: «1 turni di quota non
  // assegnati». Avevo scritto il plurale senza il singolare, e i test non
  // l'hanno preso perché non avevo scritto QUESTO caso.
  const f = frasi({ quotaNonSpesa: [{ staffName: 'Alessio', turni: 1, motivo: 'nessun giorno ammissibile' }] });
  assert.match(f.righe[0], /^1 turno di quota non assegnato /);
  assert.doesNotMatch(f.righe[0], /1 turni/);
});

test('ogni motivo ha la sua frase, perché portano a fare cose diverse', () => {
  // Appiattirli in «il fabbisogno non li chiedeva» manda a cercare il problema
  // sbagliato: lo chef ha letto quella frase su Alessio, che invece aveva
  // chiesto quattro riposi e non aveva più un giorno libero.
  const casi = [
    ['nessun giorno ammissibile',        /non restava un giorno libero/],
    ['ore contrattuali raggiunte',       /ore di contratto erano già raggiunte/],
    ['le giornate erano già coperte',    /fabbisogno era già coperto/],
    ['collocazione non attiva',          /restano in tasca/],
    ['settimana incompleta',             /settimane che il periodo taglia/],
  ];
  for (const [motivo, atteso] of casi) {
    const f = frasi({ quotaNonSpesa: [{ staffName: 'Ana', turni: 2, motivo }] });
    assert.match(f.righe[0], atteso, 'motivo: ' + motivo);
  }
});

test('motivi diversi fanno righe diverse, e la riga corta li somma', () => {
  const f = frasi({ quotaNonSpesa: [
    { staffName: 'Alessio', turni: 1, motivo: 'nessun giorno ammissibile' },
    { staffName: 'Bo',      turni: 4, motivo: 'settimana incompleta' },
  ]});
  assert.equal(f.righe.length, 2);
  assert.deepEqual(f.voci, ['5 turni non assegnati']);
  // la più grossa per prima: chi legge vede il numero che conta in cima
  assert.match(f.righe[0], /^4 turni/);
});

test('un motivo che non conosciamo non fa sparire la riga', () => {
  const f = frasi({ quotaNonSpesa: [{ staffName: 'Ana', turni: 3, motivo: 'qualcosa di nuovo' }] });
  assert.match(f.righe[0], /^3 turni di quota non assegnati perché il fabbisogno non li chiedeva — Ana \(3\)$/);
});

test('allungare un turno non è chiamare qualcuno da casa: due righe diverse', () => {
  // Sono due cose che si fanno in due modi: la prima si chiede al telefono, la
  // seconda si dice a fine servizio. Nella stessa riga farebbero sembrare che
  // siano state scomodate più persone di quante ne sono state scomodate.
  const f = frasi({ extras: [
    { staffName: 'Ana' },                                   // chiamata da casa
    { staffName: 'Valerio', allungato: true, oreInPiu: 3 }, // era già lì
  ]});
  assert.equal(f.righe.length, 2);
  assert.match(f.righe.find(r => /extra oltre quota/.test(r)), /^1 turno extra oltre quota — Ana/);
  assert.match(f.righe.find(r => /allungato/.test(r)), /^1 turno allungato per coprire un buco \(\+3h\) — Valerio/);
  assert.deepEqual(f.voci, ['1 extra', '1 allungati']);
});

test('le ore in più degli allungamenti si sommano, perché è quello il costo', () => {
  const f = frasi({ extras: [
    { staffName: 'Valerio', allungato: true, oreInPiu: 3 },
    { staffName: 'Nisan',   allungato: true, oreInPiu: 3 },
  ]});
  assert.match(f.righe[0], /^2 turni allungati per coprire dei buchi \(\+6h in tutto\)/);
});
