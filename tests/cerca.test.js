// Come si cerca (app/src/core/cerca.ts).
//
// La ricerca è la cosa che si rompe più facilmente in silenzio, perché «non
// trovo niente» sembra sempre colpa di chi cerca e non dell'app. Un `includes()`
// secco sbaglia in tre modi, e tutti e tre capitano ogni giorno in una cucina:
// gli accenti, le parole fuori ordine, e il campo sbagliato.
import test from 'node:test';
import assert from 'node:assert/strict';
import { combacia, filtra, piatto } from '../app/src/core/cerca.ts';

test('gli accenti non contano, in nessuno dei due versi', () => {
  // In cucina sono dappertutto — ragù, purè, crème — e chi cerca dal telefono
  // scrive senza, perché l'accento la tastiera lo fa fare apposta.
  assert.equal(combacia('Ragù della casa', 'ragu'), true);
  assert.equal(combacia('Ragu della casa', 'ragù'), true);
  assert.equal(combacia('Purè di patate', 'pure'), true);
  assert.equal(combacia('Crème brûlée', 'creme brulee'), true);
  assert.equal(combacia('Sedano rapa', 'SEDANO'), true, 'nemmeno le maiuscole');
});

test('le parole si cercano tutte, in qualunque ordine', () => {
  const nome = 'Pomodoro San Marzano DOP';
  assert.equal(combacia(nome, 'pom san'), true);
  assert.equal(combacia(nome, 'san pom'), true, 'l\'ordine non è quello del nome');
  assert.equal(combacia(nome, 'dop pomodoro'), true);
  // Basta che UNA parola non ci sia perché non combaci: è la differenza fra
  // restringere e allargare, e chi cerca due parole vuole restringere.
  assert.equal(combacia(nome, 'pom zucchina'), false);
});

test('gli spazi in più non fanno sbagliare', () => {
  assert.equal(combacia('Pomodoro San Marzano', '  pom   san  '), true);
});

test('una ricerca vuota trova tutto', () => {
  // Chi non ha ancora scritto niente vuole l'elenco intero, non uno vuoto.
  assert.equal(combacia('qualsiasi cosa', ''), true);
  assert.equal(combacia('qualsiasi cosa', '   '), true);
});

test('cercare una cosa che non c\'è non trova niente', () => {
  assert.equal(combacia('Pomodoro', 'zucchina'), false);
});

test('piatto regge anche quello che non è testo', () => {
  // I dati veri hanno campi mancanti: un ingrediente senza fornitore, una
  // persona senza telefono. Devono valere stringa vuota, non far esplodere.
  assert.equal(piatto(null), '');
  assert.equal(piatto(undefined), '');
  assert.equal(piatto(42), '42');
  assert.equal(piatto('  Spazi  '), 'spazi');
});

test('filtra guarda tutti i campi che gli si indicano', () => {
  // Chi cerca non sa in quale campo sta scritta la cosa che ha in mente:
  // «rossi» è un fornitore, «pomodoro» è un nome, e vanno trovati tutti e due
  // senza dover scegliere prima dove cercare.
  const ingredienti = [
    { nome: 'Pomodoro San Marzano', fornitore: 'Ortofrutta Rossi' },
    { nome: 'Zucchina', fornitore: 'Ortofrutta Rossi' },
    { nome: 'Merluzzo', fornitore: 'Pescheria Blu' },
  ];
  const campi = i => [i.nome, i.fornitore];

  assert.deepEqual(filtra(ingredienti, 'rossi', campi).map(i => i.nome),
                   ['Pomodoro San Marzano', 'Zucchina']);
  assert.deepEqual(filtra(ingredienti, 'merluzzo', campi).map(i => i.nome), ['Merluzzo']);
  // Una parola dal nome e una dal fornitore, insieme: è una ricerca sola sui
  // due campi messi in fila, non due ricerche separate.
  assert.deepEqual(filtra(ingredienti, 'zucchina rossi', campi).map(i => i.nome), ['Zucchina']);
});

test('filtra con ricerca vuota restituisce lo stesso elenco', () => {
  const voci = [{ nome: 'a' }, { nome: 'b' }];
  assert.equal(filtra(voci, '', v => [v.nome]), voci, 'nemmeno una copia: proprio lo stesso');
});

test('filtra non inciampa sui campi mancanti', () => {
  const voci = [
    { nome: 'Con fornitore', fornitore: 'Rossi' },
    { nome: 'Senza fornitore' },
    { nome: 'Fornitore nullo', fornitore: null },
  ];
  const campi = v => [v.nome, v.fornitore];
  assert.equal(filtra(voci, 'fornitore', campi).length, 3);
  assert.equal(filtra(voci, 'rossi', campi).length, 1);
});

test('si può cercare anche su cose composte, non solo sui campi', () => {
  // È il motivo per cui `campi` è una funzione e non un elenco di nomi: le
  // partite di una persona sono degli id, e chi cerca scrive il NOME della
  // partita.
  const partite = { s1: 'Pass', s2: 'Lavaggio' };
  const brigata = [
    { nome: 'Lorenc', stazioni: ['s1'] },
    { nome: 'Marco', stazioni: ['s2'] },
  ];
  const campi = p => [p.nome, ...p.stazioni.map(id => partite[id])];
  assert.deepEqual(filtra(brigata, 'lavaggio', campi).map(p => p.nome), ['Marco']);
});
