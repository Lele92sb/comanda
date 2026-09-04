// Le notifiche (app/src/core/notifiche.ts).
//
// Non si salvano: si calcolano dai dati che ci sono già, confrontati con un
// segno di «fin qui avevo visto». Questi test controllano proprio le due cose
// che fanno diventare inutile una campanella: annunciare a qualcuno cose che
// ha fatto lui, e continuare a segnalare quello che ha già letto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SEGNO_VUOTO, novita, segnaVisto } from '../app/src/core/notifiche.ts';

const NOMI = { p1: 'Lorenc', p2: 'Marco' };
const nomeDi = id => NOMI[id] || '—';

const chiedi = (over = {}) => ({
  richieste: [], giorniPubblicati: [], nomeDi,
  mioStaffId: 'p1', gestisco: false, segno: SEGNO_VUOTO, ...over,
});

const richiesta = (o = {}) => ({
  id: 'r1', staff_id: 'p2', stato: 'in_attesa',
  created_at: '2026-09-03T10:00:00Z', decisa_il: null, ...o,
});

test('chi gestisce viene avvisato di una richiesta arrivata', () => {
  const n = novita(chiedi({ gestisco: true, richieste: [richiesta()] }));
  assert.equal(n.length, 1);
  assert.equal(n[0].tipo, 'richiesta-nuova');
  assert.equal(n[0].chi, 'Marco');
  assert.equal(n[0].dove, 'richieste');
});

test('chi NON gestisce non sa nemmeno che esiste', () => {
  // Il database non gliela manda (policy requests_select): qui non si finge
  // il contrario.
  const n = novita(chiedi({ gestisco: false, richieste: [richiesta()] }));
  assert.deepEqual(n, []);
});

test('le proprie richieste non si annunciano a sé stessi', () => {
  // Sapere che hai appena mandato una cosa che hai appena mandato non è una
  // notizia: è il modo più veloce di rendere inutile una campanella.
  const n = novita(chiedi({ gestisco: true, mioStaffId: 'p2', richieste: [richiesta()] }));
  assert.deepEqual(n, []);
});

test('chi ha mandato una richiesta viene avvisato quando è decisa', () => {
  // È l'unica cosa nell'app che qualcuno sta aspettando davvero: finché non
  // arriva non sa se può prenotare il volo.
  const n = novita(chiedi({
    mioStaffId: 'p2',
    richieste: [richiesta({ stato: 'approvata', decisa_il: '2026-09-03T12:00:00Z' })],
  }));
  assert.equal(n.length, 1);
  assert.equal(n[0].tipo, 'richiesta-decisa');
  assert.equal(n[0].chi, 'approvata');
});

test('una richiesta decisa a qualcun altro non riguarda me', () => {
  const n = novita(chiedi({
    mioStaffId: 'p1', gestisco: true,
    richieste: [richiesta({ stato: 'approvata', decisa_il: '2026-09-03T12:00:00Z' })],
  }));
  assert.deepEqual(n, [], 'chi decide non si avvisa da solo di aver deciso');
});

test('quello che ho già visto non torna', () => {
  const r = [richiesta()];
  const primaVolta = novita(chiedi({ gestisco: true, richieste: r }));
  assert.equal(primaVolta.length, 1);

  const segno = segnaVisto(Date.parse('2026-09-03T11:00:00Z'), []);
  const dopo = novita(chiedi({ gestisco: true, richieste: r, segno }));
  assert.deepEqual(dopo, [], 'letta una volta, non si ripresenta');
});

test('quello che è successo DOPO l\'ultima occhiata invece torna', () => {
  const segno = segnaVisto(Date.parse('2026-09-03T11:00:00Z'), []);
  const n = novita(chiedi({
    gestisco: true, segno,
    richieste: [richiesta({ id: 'r2', created_at: '2026-09-03T15:00:00Z' })],
  }));
  assert.equal(n.length, 1);
});

test('i turni pubblicati si riconoscono confrontando le date, non l\'orario', () => {
  // L'elenco dei giorni pubblicati non ha un momento: quelli che compaiono
  // adesso e prima non c'erano sono stati pubblicati nel frattempo.
  const segno = segnaVisto(1, ['2026-09-01', '2026-09-02']);
  const n = novita(chiedi({
    segno, giorniPubblicati: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'],
  }));
  assert.equal(n.length, 1);
  assert.equal(n[0].tipo, 'turni-pubblicati');
  assert.equal(n[0].quante, 2, 'due giorni nuovi, non quattro');
});

test('se non è stato pubblicato niente di nuovo, niente notifica', () => {
  const segno = segnaVisto(1, ['2026-09-01', '2026-09-02']);
  const n = novita(chiedi({ segno, giorniPubblicati: ['2026-09-01', '2026-09-02'] }));
  assert.deepEqual(n, []);
});

test('togliere la pubblicazione non è una novità', () => {
  // Meno giorni di prima: non c'è niente di nuovo da leggere. Segnalarlo
  // vorrebbe dire una campanella che suona quando qualcosa SPARISCE.
  const segno = segnaVisto(1, ['2026-09-01', '2026-09-02', '2026-09-03']);
  const n = novita(chiedi({ segno, giorniPubblicati: ['2026-09-01'] }));
  assert.deepEqual(n, []);
});

test('la più fresca sta in cima', () => {
  const n = novita(chiedi({
    gestisco: true,
    richieste: [
      richiesta({ id: 'vecchia', created_at: '2026-09-01T10:00:00Z' }),
      richiesta({ id: 'nuova', created_at: '2026-09-03T10:00:00Z' }),
    ],
  }));
  assert.deepEqual(n.map(x => x.id), ['nuova', 'vecchia']);
});

test('una data illeggibile vale zero e non fa esplodere niente', () => {
  const n = novita(chiedi({
    gestisco: true,
    richieste: [richiesta({ created_at: 'boh' }), richiesta({ id: 'r2', created_at: null })],
  }));
  // `quando` vale 0, che non è mai maggiore di un segno: non si annunciano.
  assert.deepEqual(n, []);
});

test('senza persona collegata si vedono solo le richieste altrui', () => {
  // Chi non è collegato a nessuno in brigata non ha richieste proprie: non
  // deve ricevere «la tua richiesta è stata approvata» per quella di un altro.
  const n = novita(chiedi({
    mioStaffId: null, gestisco: true,
    richieste: [richiesta({ stato: 'approvata', decisa_il: '2026-09-03T12:00:00Z' })],
  }));
  assert.deepEqual(n, []);
});

test('elenchi mancanti non fanno esplodere niente', () => {
  assert.deepEqual(novita(chiedi({ richieste: null, giorniPubblicati: null })), []);
  assert.deepEqual(novita(chiedi({ segno: { visto: 0, giorniVisti: null } })), []);
});
