// Cosa è cambiato fra due elenchi (app/src/lib/differenze.js).
//
// È il cuore del passaggio alle tabelle vere, ed è anche il punto in cui un
// errore NON dà un errore: dà un salvataggio che non salva. Si scrive un
// prezzo, l'app dice «salvato», e il prezzo vecchio resta lì — perché il
// confronto ha deciso che le due righe erano uguali. Si scopre il mese dopo,
// guardando un food cost che non torna.
import test from 'node:test';
import assert from 'node:assert/strict';
import { differenze, uguali } from '../app/src/lib/differenze.js';

const CAMPI = ['name', 'unit', 'price', 'supplier', 'yieldPct', 'yieldEstimated'];
const ing = (o = {}) => ({ id: 'i1', name: 'Pomodoro', unit: 'kg', price: 2.4,
                           supplier: 'Rossi', yieldPct: 90, yieldEstimated: false, ...o });

test('senza cambiamenti non si scrive niente', () => {
  const a = [ing()];
  const d = differenze(a, [ing()], CAMPI);
  assert.deepEqual(d.daScrivere, []);
  assert.deepEqual(d.daTogliere, []);
});

test('cambiando un prezzo si scrive UNA riga sola', () => {
  // È il punto di tutto il lavoro: prima si riscrivevano tutti e tre.
  const prima = [ing({ id: 'i1' }), ing({ id: 'i2', name: 'Basilico' }), ing({ id: 'i3', name: 'Olio' })];
  const dopo = prima.map(x => x.id === 'i2' ? { ...x, price: 9.9 } : x);
  const d = differenze(dopo, prima, CAMPI);
  assert.equal(d.daScrivere.length, 1);
  assert.equal(d.daScrivere[0].id, 'i2');
  assert.deepEqual(d.daTogliere, []);
});

test('una riga nuova si scrive, una tolta si toglie', () => {
  const d = differenze([ing({ id: 'i1' }), ing({ id: 'i9', name: 'Nuovo' })],
                       [ing({ id: 'i1' }), ing({ id: 'i2' })], CAMPI);
  assert.deepEqual(d.daScrivere.map(x => x.id), ['i9']);
  assert.deepEqual(d.daTogliere, ['i2']);
});

test('la stringa del browser e il numero del database sono lo stesso prezzo', () => {
  // Chi scrive «2.40» in un campo numerico mette la STRINGA '2.40' in `state`,
  // mentre dal database quel prezzo torna come NUMERO 2.4. Un `===` li
  // direbbe diversi, e OGNI salvataggio riscriverebbe l'anagrafica intera —
  // cioè esattamente quello che questo codice esiste per evitare.
  assert.equal(uguali(ing({ price: '2.40' }), ing({ price: 2.4 }), CAMPI), true);
  assert.equal(uguali(ing({ yieldPct: '90' }), ing({ yieldPct: 90 }), CAMPI), true);
  const d = differenze([ing({ price: '2.40' })], [ing({ price: 2.4 })], CAMPI);
  assert.deepEqual(d.daScrivere, [], 'non deve risultare cambiato niente');
});

test('ma un prezzo DAVVERO diverso si vede', () => {
  assert.equal(uguali(ing({ price: '2.50' }), ing({ price: 2.4 }), CAMPI), false);
});

test('vuoto, nullo e non definito sono la stessa cosa', () => {
  // Un campo mai compilato e un campo svuotato non sono due stati diversi per
  // chi guarda, e trattarli come diversi farebbe riscrivere righe intatte.
  assert.equal(uguali(ing({ supplier: '' }), ing({ supplier: null }), CAMPI), true);
  assert.equal(uguali(ing({ supplier: undefined }), ing({ supplier: '' }), CAMPI), true);
  // Ma svuotare un campo che aveva qualcosa È un cambiamento.
  assert.equal(uguali(ing({ supplier: '' }), ing({ supplier: 'Rossi' }), CAMPI), false);
});

test('i booleani si confrontano come booleani', () => {
  assert.equal(uguali(ing({ yieldEstimated: true }), ing({ yieldEstimated: true }), CAMPI), true);
  assert.equal(uguali(ing({ yieldEstimated: false }), ing({ yieldEstimated: true }), CAMPI), false);
});

test('i campi non elencati non contano', () => {
  // Le righe che tornano dal database si portano dietro roba che il client non
  // ha (`aggiornato_il`): confrontarla farebbe risultare cambiato tutto a ogni
  // giro, e ogni salvataggio riscriverebbe l'anagrafica intera.
  const a = ing();
  const b = { ...ing(), aggiornato_il: '2026-09-04T10:00:00Z' };
  assert.equal(uguali(a, b, CAMPI), true);
});

test('elenchi vuoti o mancanti non fanno esplodere niente', () => {
  assert.deepEqual(differenze([], [], CAMPI), { daScrivere: [], daTogliere: [] });
  assert.deepEqual(differenze(null, null, CAMPI), { daScrivere: [], daTogliere: [] });
  assert.deepEqual(differenze(undefined, [ing()], CAMPI).daTogliere, ['i1']);
});

test('la prima volta si scrive tutto', () => {
  // Nessuna lettura precedente: tutte le righe sono nuove.
  const d = differenze([ing({ id: 'a' }), ing({ id: 'b' })], [], CAMPI);
  assert.equal(d.daScrivere.length, 2);
});

test('svuotare l\'elenco toglie tutto', () => {
  const d = differenze([], [ing({ id: 'a' }), ing({ id: 'b' })], CAMPI);
  assert.deepEqual(d.daScrivere, []);
  assert.deepEqual(d.daTogliere, ['a', 'b']);
});
