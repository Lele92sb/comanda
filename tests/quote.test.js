// Le quote settimanali: cosa è storto, e cosa impedisce di generare.
//
// Perché questi test esistono. Il motore taglia le quote a sette slot da solo, e
// il taglio è muto: chi dichiara nove turni ne perde due senza sapere quali, chi
// ne dichiara cinque si ritrova due giorni vuoti e crede sia un difetto del
// generatore. L'app mostrava «6/7» in rosso accanto al nome e salvava lo stesso.
//
// Qui si controlla la REGOLA, non l'interfaccia: sta in logic.js apposta, perché
// una regola sui dati che vive solo in una schermata vale finché qualcuno non
// salva da un'altra strada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GIORNI_SETTIMANA, bloccaGenerazione, problemiQuota, quoteStorte,
         totaleQuota } from '../app/src/lib/logic.js';

const persona = (nome, quota) => ({ id: nome.toLowerCase(), name: nome, weeklyQuota: quota });
const tipi = p => problemiQuota(p).map(x => x.tipo).sort();

test('sette è la settimana, e non è una convenzione da cambiare a cuor leggero', () => {
  assert.equal(GIORNI_SETTIMANA, 7);
});

test('una quota che fa sette non ha problemi', () => {
  const p = persona('Lorenc', [
    { count: 3, codes: ['SP'] },
    { count: 2, codes: ['P', 'S'] },
    { count: 2, codes: ['R'] },
  ]);
  assert.equal(totaleQuota(p), 7);
  assert.deepEqual(problemiQuota(p), []);
  assert.deepEqual(quoteStorte([p]), []);
});

test('sei su sette è storto: due giorni resterebbero vuoti', () => {
  const p = persona('Marco', [{ count: 4, codes: ['P'] }, { count: 2, codes: ['R'] }]);
  const problemi = problemiQuota(p);
  assert.equal(problemi.length, 1);
  assert.equal(problemi[0].tipo, 'totale');
  assert.equal(problemi[0].totale, 6);
  assert.equal(problemi[0].atteso, 7);
  assert.equal(bloccaGenerazione(problemi), true);
});

test('nove su sette è storto: due turni sparirebbero, e non sai quali', () => {
  // È il caso peggiore perché non si vede: il motore taglia a 7 in silenzio.
  const p = persona('Giulia', [{ count: 6, codes: ['SP'] }, { count: 3, codes: ['R'] }]);
  const problemi = problemiQuota(p);
  assert.equal(problemi[0].tipo, 'totale');
  assert.equal(problemi[0].totale, 9);
  assert.equal(bloccaGenerazione(problemi), true);
});

test('chi non ha ancora nessun gruppo non ha sbagliato: ha solo non fatto', () => {
  // Due frasi diverse da leggere e due gesti diversi da fare. Se «non
  // configurato» e «configurato male» dicessero la stessa cosa, si andrebbe a
  // cercare l'errore che non c'è.
  const p = persona('Nuovo', []);
  assert.deepEqual(tipi(p), ['nessun_gruppo']);
  // E il totale di zero NON viene segnalato in più: sarebbe la stessa cosa
  // detta due volte.
  assert.equal(problemiQuota(p).length, 1);
  assert.equal(bloccaGenerazione(problemiQuota(p)), true);
});

test('un gruppo senza codici diventa riposo di nascosto, e va detto', () => {
  // capienzaSettimanale ci mette dentro il riposo di sua iniziativa: «3 turni
  // di niente» diventa «3 riposi», e chi l'ha scritto crede di aver messo tre
  // turni di lavoro.
  const p = persona('Ana', [{ count: 3, codes: [] }, { count: 4, codes: ['P'] }]);
  const problemi = problemiQuota(p);
  const senza = problemi.find(x => x.tipo === 'gruppi_senza_codici');
  assert.ok(senza, 'il gruppo vuoto va segnalato');
  assert.deepEqual(senza.indici, [0]);
  // Il totale fa sette, quindi quello non si lamenta: è un problema diverso.
  assert.equal(totaleQuota(p), 7);
  assert.ok(!problemi.some(x => x.tipo === 'totale'));
  assert.equal(bloccaGenerazione(problemi), true);
});

test('codes mancante del tutto vale come codes vuoto', () => {
  const p = persona('Ivo', [{ count: 7 }]);
  assert.deepEqual(problemiQuota(p).map(x => x.tipo), ['gruppi_senza_codici']);
});

test('un gruppo a zero si segnala ma NON blocca', () => {
  // È disordine, non un impedimento: il motore lo salta e il prospetto esce
  // giusto lo stesso. Bloccare per questo sarebbe fastidio senza guadagno, ed è
  // il fastidio senza guadagno che fa spegnere i controlli.
  const p = persona('Sara', [
    { count: 0, codes: ['SP'] },
    { count: 5, codes: ['P'] },
    { count: 2, codes: ['R'] },
  ]);
  const problemi = problemiQuota(p);
  assert.deepEqual(problemi.map(x => x.tipo), ['gruppi_a_zero']);
  assert.deepEqual(problemi[0].indici, [0]);
  assert.equal(bloccaGenerazione(problemi), false, 'un gruppo a zero non deve fermare la generazione');
});

test('il conteggio scritto come stringa conta lo stesso', () => {
  // I campi numerici del browser restituiscono stringhe, e in `state` ci
  // finiscono così. Un controllo che se ne dimentica non trova niente.
  const p = persona('Testo', [{ count: '5', codes: ['P'] }, { count: '2', codes: ['R'] }]);
  assert.equal(totaleQuota(p), 7);
  assert.deepEqual(problemiQuota(p), []);
});

test('un conteggio non numerico vale zero, non NaN', () => {
  const p = persona('Rotto', [{ count: 'boh', codes: ['P'] }, { count: 7, codes: ['R'] }]);
  assert.equal(totaleQuota(p), 7, 'NaN avrebbe reso il totale impossibile da confrontare');
  assert.deepEqual(problemiQuota(p).map(x => x.tipo), ['gruppi_a_zero']);
});

test('quoteStorte elenca solo chi ha problemi, e dice chi è', () => {
  const brigata = [
    persona('Giusta', [{ count: 5, codes: ['P'] }, { count: 2, codes: ['R'] }]),
    persona('Corta', [{ count: 3, codes: ['P'] }]),
    persona('Lunga', [{ count: 9, codes: ['SP'] }]),
    persona('Vuota', []),
  ];
  const storte = quoteStorte(brigata);
  assert.deepEqual(storte.map(x => x.nome), ['Corta', 'Lunga', 'Vuota']);
  assert.equal(storte[0].totale, 3);
  assert.equal(storte[1].totale, 9);
  assert.equal(storte[2].totale, 0);
  // Serve l'id per poter portare chi legge dritto alla persona giusta.
  assert.equal(storte[0].id, 'corta');
});

test('una brigata vuota non ha quote storte, e non esplode', () => {
  assert.deepEqual(quoteStorte([]), []);
  assert.deepEqual(quoteStorte(null), []);
  assert.deepEqual(quoteStorte(undefined), []);
});

test('una persona senza il campo weeklyQuota non fa esplodere niente', () => {
  const p = { id: 'x', name: 'Senza' };
  assert.equal(totaleQuota(p), 0);
  assert.deepEqual(problemiQuota(p).map(x => x.tipo), ['nessun_gruppo']);
  assert.deepEqual(quoteStorte([p]).map(x => x.nome), ['Senza']);
});

test('bloccaGenerazione senza problemi lascia passare', () => {
  assert.equal(bloccaGenerazione([]), false);
  assert.equal(bloccaGenerazione(null), false);
  assert.equal(bloccaGenerazione(undefined), false);
});
