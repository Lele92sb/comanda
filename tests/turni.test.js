// Test del motore di generazione turni (app/logic.js).
// Uso node:test, incluso in Node 18+, per non aggiungere dipendenze esterne a un progetto
// che deve restare semplice da eseguire ovunque con "npm test".
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeShifts } = require('../app/logic.js');

function noQualificationViolations(staff, newShifts){
  for(const s of staff){
    for(const day of Object.keys(newShifts[s.id])){
      const cell = newShifts[s.id][day];
      if(cell.stationId && !(s.stations||[]).includes(cell.stationId)){
        return `${s.name} assegnato a stazione non qualificata (${cell.stationId}) il ${day}`;
      }
    }
  }
  return null;
}

test('scenario risolvibile: non spreca il jolly su una stazione già autosufficiente', () => {
  // Regressione del bug reale trovato in produzione: senza priorità ai meno flessibili,
  // il jolly veniva sprecato sulla stazione che lo specialista poteva già coprire da solo.
  const staff = [
    { id:'p1', name:'Marco (solo Primi)', stations:['st1'], weeklyQuota:[{count:7, codes:['P']}] },
    { id:'p2', name:'Luca (Primi+Secondi)', stations:['st1','st2'], weeklyQuota:[{count:7, codes:['P']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'st1',count:1},{stationId:'st2',count:1}], cena:[] };

  for(let i=0;i<50;i++){
    const { shortfalls } = computeShifts(staff, needs);
    assert.equal(shortfalls.length, 0, 'non dovrebbero esserci scoperture: la capacità totale basta se allocata bene');
  }
});

test('specialisti autosufficienti + jolly di riserva: nessuna scopertura, nessun turno extra necessario', () => {
  const staff = [
    { id:'a1', name:'A1', stations:['a'], weeklyQuota:[{count:7,codes:['SP']}] },
    { id:'b1', name:'B1', stations:['b'], weeklyQuota:[{count:7,codes:['SP']}] },
    { id:'c1', name:'C1', stations:['c'], weeklyQuota:[{count:7,codes:['SP']}] },
    { id:'j',  name:'Jolly', stations:['a','b','c'], weeklyQuota:[{count:7,codes:['R']}] },
  ];
  const needs = {
    colazione: [],
    pranzo: [{stationId:'a',count:1},{stationId:'b',count:1},{stationId:'c',count:1}],
    cena:   [{stationId:'a',count:1},{stationId:'b',count:1},{stationId:'c',count:1}],
  };
  for(let i=0;i<30;i++){
    const { shortfalls, extras, newShifts } = computeShifts(staff, needs);
    assert.equal(shortfalls.length, 0);
    assert.equal(extras.length, 0);
    assert.equal(noQualificationViolations(staff, newShifts), null);
  }
});

test('turno Spezzato copre correttamente sia pranzo che cena sulla stessa stazione', () => {
  const staff = [{ id:'s1', name:'Unico SP', stations:['a'], weeklyQuota:[{count:7,codes:['SP']}] }];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[{stationId:'a',count:1}] };
  const { shortfalls } = computeShifts(staff, needs);
  assert.equal(shortfalls.length, 0);
});

test('scopertura impossibile (fabbisogno oltre la capacità fisica) viene segnalata onestamente', () => {
  const staff = [{ id:'s1', name:'Unico', stations:['a'], weeklyQuota:[{count:7,codes:['P']}] }];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:2}], cena:[] }; // servono 2 persone, ce n'è 1 in tutta la brigata
  const { shortfalls, extras } = computeShifts(staff, needs);
  assert.ok(shortfalls.length > 0, 'deve segnalare la scopertura invece di nasconderla');
  assert.equal(extras.length, 0, 'non esiste nessun secondo qualificato da poter chiamare come extra');
});

test('turno extra: se un secondo qualificato esiste ma la sua quota non combacia, viene chiamato oltre quota invece di lasciare il buco', () => {
  const staff = [
    { id:'s1', name:'Marco (quota tutta Riposo)', stations:['a'], weeklyQuota:[{count:7,codes:['R']}] },
    { id:'s2', name:'Luca (quota giusta)', stations:['a'], weeklyQuota:[{count:7,codes:['P']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:2}], cena:[] };
  const { shortfalls, extras, newShifts } = computeShifts(staff, needs);
  assert.equal(shortfalls.length, 0, 'con un secondo qualificato disponibile, il buco va coperto come extra');
  assert.equal(extras.length, 7, 'Marco deve coprire come extra tutti i 7 giorni della settimana');
  assert.equal(newShifts['s1']['Lun'].extra, true);
});

test('nessuno viene mai assegnato a una stazione per cui non è qualificato', () => {
  const staff = [
    { id:'a1', name:'A1', stations:['a'], weeklyQuota:[{count:3,codes:['SP']},{count:2,codes:['P','S']},{count:2,codes:['R']}] },
    { id:'a2', name:'A2', stations:['a'], weeklyQuota:[{count:3,codes:['SP']},{count:2,codes:['P','S']},{count:2,codes:['R']}] },
    { id:'b1', name:'B1', stations:['b'], weeklyQuota:[{count:6,codes:['P','S']},{count:1,codes:['R']}] },
    { id:'j',  name:'Jolly', stations:['a','b'], weeklyQuota:[{count:6,codes:['P','S']},{count:1,codes:['R']}] },
  ];
  const needs = {
    colazione: [],
    pranzo: [{stationId:'a',count:1},{stationId:'b',count:1}],
    cena:   [{stationId:'a',count:1},{stationId:'b',count:1}],
  };
  for(let i=0;i<50;i++){
    const { newShifts } = computeShifts(staff, needs);
    assert.equal(noQualificationViolations(staff, newShifts), null);
  }
});

test('ogni persona riceve esattamente un turno per ognuno dei 7 giorni della settimana', () => {
  const staff = [
    { id:'a1', name:'A1', stations:['a'], weeklyQuota:[{count:3,codes:['SP']},{count:2,codes:['P','S']},{count:2,codes:['R']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const { newShifts } = computeShifts(staff, needs);
  const days = Object.keys(newShifts['a1']);
  assert.equal(days.length, 7);
  days.forEach(d => assert.ok(newShifts['a1'][d].code, `manca un codice turno per ${d}`));
});
