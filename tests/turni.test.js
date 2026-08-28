// Test del motore di generazione turni (app/logic.js).
// Uso node:test, incluso in Node 18+, per non aggiungere dipendenze esterne a un progetto
// che deve restare semplice da eseguire ovunque con "npm test".
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeShifts, buildShiftConfig, computeShiftsForDates,
         weekDates, monthDates, groupByWeek, isoDate, startOfWeek, dayName,
         codeAllowed } from '../app/src/lib/logic.js';

// Configurazione classica (colazione/pranzo/cena con spezzato): è quella che
// l'app crea da sola per chi non ne ha una propria.
const BASE = buildShiftConfig(null, null);

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
    const { shortfalls } = computeShifts(staff, needs, {config:BASE});
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
    const { shortfalls, extras, newShifts } = computeShifts(staff, needs, {config:BASE});
    assert.equal(shortfalls.length, 0);
    assert.equal(extras.length, 0);
    assert.equal(noQualificationViolations(staff, newShifts), null);
  }
});

test('turno Spezzato copre correttamente sia pranzo che cena sulla stessa stazione', () => {
  const staff = [{ id:'s1', name:'Unico SP', stations:['a'], weeklyQuota:[{count:7,codes:['SP']}] }];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[{stationId:'a',count:1}] };
  const { shortfalls } = computeShifts(staff, needs, {config:BASE});
  assert.equal(shortfalls.length, 0);
});

test('scopertura impossibile (fabbisogno oltre la capacità fisica) viene segnalata onestamente', () => {
  const staff = [{ id:'s1', name:'Unico', stations:['a'], weeklyQuota:[{count:7,codes:['P']}] }];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:2}], cena:[] }; // servono 2 persone, ce n'è 1 in tutta la brigata
  const { shortfalls, extras } = computeShifts(staff, needs, {config:BASE});
  assert.ok(shortfalls.length > 0, 'deve segnalare la scopertura invece di nasconderla');
  assert.equal(extras.length, 0, 'non esiste nessun secondo qualificato da poter chiamare come extra');
});

test('turno extra: se un secondo qualificato esiste ma la sua quota non combacia, viene chiamato oltre quota invece di lasciare il buco', () => {
  const staff = [
    { id:'s1', name:'Marco (quota tutta Riposo)', stations:['a'], weeklyQuota:[{count:7,codes:['R']}] },
    { id:'s2', name:'Luca (quota giusta)', stations:['a'], weeklyQuota:[{count:7,codes:['P']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:2}], cena:[] };
  const { shortfalls, extras, newShifts } = computeShifts(staff, needs, {config:BASE});
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
    const { newShifts } = computeShifts(staff, needs, {config:BASE});
    assert.equal(noQualificationViolations(staff, newShifts), null);
  }
});

test('ogni persona riceve esattamente un turno per ognuno dei 7 giorni della settimana', () => {
  const staff = [
    { id:'a1', name:'A1', stations:['a'], weeklyQuota:[{count:3,codes:['SP']},{count:2,codes:['P','S']},{count:2,codes:['R']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const { newShifts } = computeShifts(staff, needs, {config:BASE});
  const days = Object.keys(newShifts['a1']);
  assert.equal(days.length, 7);
  days.forEach(d => assert.ok(newShifts['a1'][d].code, `manca un codice turno per ${d}`));
});

/* ===================== SERVIZI PERSONALIZZATI ===================== */

// Una cucina che fa brunch e aperitivo invece dei tre servizi classici.
const SERVIZI_LOCALE = [
  {id:'brunch',    name:'Brunch'},
  {id:'aperitivo', name:'Aperitivo'},
  {id:'cena',      name:'Cena'},
];
const TURNI_LOCALE = [
  {code:'B',  label:'Brunch 9–16',        hours:7, services:['brunch']},
  {code:'A',  label:'Aperitivo 17–21',    hours:4, services:['aperitivo']},
  {code:'CE', label:'Cena 19–24',         hours:5, services:['cena']},
  {code:'AC', label:'Aperitivo + cena',   hours:8, services:['aperitivo','cena']},
];
const LOCALE = buildShiftConfig(SERVIZI_LOCALE, TURNI_LOCALE);

test('servizi personalizzati: un servizio fuori dai tre classici viene coperto come gli altri', () => {
  const staff = [
    { id:'s1', name:'Barman', stations:['bar'], weeklyQuota:[{count:7,codes:['A']}] },
  ];
  const needs = { brunch:[], aperitivo:[{stationId:'bar',count:1}], cena:[] };
  const { newShifts, shortfalls } = computeShifts(staff, needs, {config:LOCALE});
  assert.equal(shortfalls.length, 0, 'l\'aperitivo deve essere coperto come qualsiasi altro servizio');
  Object.values(newShifts['s1']).forEach(cell=>{
    assert.equal(cell.code, 'A');
    assert.equal(cell.stationId, 'bar');
  });
});

test('servizi personalizzati: un turno che copre due servizi ne chiude due con una persona sola', () => {
  // È lo "spezzato" generalizzato: qui aperitivo + cena, servizi che nella
  // versione precedente non esistevano nemmeno.
  const staff = [{ id:'s1', name:'Unico', stations:['bar'], weeklyQuota:[{count:7,codes:['AC']}] }];
  const needs = { brunch:[], aperitivo:[{stationId:'bar',count:1}], cena:[{stationId:'bar',count:1}] };
  const { newShifts, shortfalls, extras } = computeShifts(staff, needs, {config:LOCALE});
  assert.equal(shortfalls.length, 0, 'una persona sola con turno accorpato copre entrambi i servizi');
  assert.equal(extras.length, 0, 'la quota basta: non serve nessun turno oltre quota');
  Object.values(newShifts['s1']).forEach(cell=> assert.equal(cell.code, 'AC'));
});

test('servizi personalizzati: le scoperture citano il servizio giusto', () => {
  const staff = [{ id:'s1', name:'Unico', stations:['bar'], weeklyQuota:[{count:7,codes:['B']}] }];
  const needs = { brunch:[], aperitivo:[{stationId:'cucina',count:1}], cena:[] };
  const { shortfalls } = computeShifts(staff, needs, {config:LOCALE});
  assert.ok(shortfalls.length > 0);
  assert.equal(shortfalls[0].service, 'aperitivo');
});

test('buildShiftConfig deriva correttamente le tabelle dalla configurazione', () => {
  assert.deepEqual(LOCALE.serviceIds, ['brunch','aperitivo','cena']);
  // un servizio è coperto sia dal turno dedicato sia da quello accorpato
  assert.deepEqual(LOCALE.serviceCodes['aperitivo'].sort(), ['A','AC']);
  assert.deepEqual(LOCALE.codeToServices['AC'], ['aperitivo','cena']);
  // il turno "principale" di un servizio è quello che copre solo quello
  assert.equal(LOCALE.mainCode['aperitivo'], 'A');
  assert.equal(LOCALE.mainCode['cena'], 'CE');
  // riposo, malattia e ferie ci sono sempre, anche in una configurazione su misura
  ['R','M','F'].forEach(c=> assert.ok(LOCALE.turnoDef[c], `manca il codice fisso ${c}`));
  assert.equal(LOCALE.turnoDef['AC'].hours, 8);
  // i codici di lavoro sono quelli configurati, non quelli della vecchia versione
  assert.deepEqual(LOCALE.workingCodes.sort(), ['A','AC','B','CE']);
});

test('un servizio coperto solo da un turno accorpato non resta orfano', () => {
  // Nessun turno copre "cena" da sola: il motore deve comunque saperla coprire.
  const cfg = buildShiftConfig(
    [{id:'pranzo',name:'Pranzo'},{id:'cena',name:'Cena'}],
    [{code:'PC', label:'Pranzo + cena', hours:10, services:['pranzo','cena']}]
  );
  assert.equal(cfg.mainCode['cena'], 'PC');
  const staff = [{ id:'s1', name:'Unico', stations:['a'], weeklyQuota:[{count:7,codes:['PC']}] }];
  const { shortfalls } = computeShifts(staff, { pranzo:[], cena:[{stationId:'a',count:1}] }, {config:cfg});
  assert.equal(shortfalls.length, 0);
});

/* ===================== PERIODI: SETTIMANA E MESE ===================== */

test('le date di una settimana partono sempre da lunedì e sono sette', () => {
  // mercoledì 16 settembre 2026
  const d = weekDates(new Date(2026, 8, 16));
  assert.equal(d.length, 7);
  assert.equal(d[0], '2026-09-14', 'deve iniziare dal lunedì');
  assert.equal(d[6], '2026-09-20');
  assert.equal(dayName('2026-09-14'), 'Lun');
  assert.equal(dayName('2026-09-20'), 'Dom');
});

test('la settimana è calcolata in ora locale, senza slittamenti di fuso', () => {
  // Con una conversione via UTC, una data di lunedì mattina può retrocedere a
  // domenica: qui il lunedì deve restare lunedì.
  assert.equal(isoDate(startOfWeek(new Date(2026, 0, 1))), '2025-12-29');
  assert.equal(dayName('2026-01-01'), 'Gio');
});

test('un mese contiene tutti i suoi giorni, anche febbraio bisestile', () => {
  assert.equal(monthDates(new Date(2026, 1, 10)).length, 28);
  assert.equal(monthDates(new Date(2024, 1, 10)).length, 29, '2024 è bisestile');
  const set = monthDates(new Date(2026, 8, 1));
  assert.equal(set.length, 30);
  assert.equal(set[0], '2026-09-01');
  assert.equal(set[29], '2026-09-30');
});

test('un mese viene spezzato in settimane, comprese quelle a cavallo', () => {
  const gruppi = groupByWeek(monthDates(new Date(2026, 8, 1))); // settembre 2026
  const totale = gruppi.reduce((n,g)=>n+g.length, 0);
  assert.equal(totale, 30, 'nessun giorno perso nella suddivisione');
  gruppi.forEach(g=> assert.ok(g.length <= 7));
  // il 1° settembre 2026 è martedì: la prima settimana del mese è parziale
  assert.equal(gruppi[0].length, 6);
});

test('generazione mensile: ogni persona ha un turno per ogni giorno del mese', () => {
  const staff = [
    { id:'a1', name:'A1', stations:['a'], weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const dates = monthDates(new Date(2026, 8, 1));
  const { newShifts } = computeShiftsForDates(staff, needs, {config:BASE, dates});
  assert.equal(Object.keys(newShifts['a1']).length, 30);
  dates.forEach(d=> assert.ok(newShifts['a1'][d] && newShifts['a1'][d].code, `manca il turno del ${d}`));
});

test('generazione mensile: le quote ripartono ogni settimana, senza turni oltre quota', () => {
  // Due persone da 5 pranzi + 2 riposi coprono comodamente un fabbisogno di una
  // persona al giorno: 10 turni disponibili a settimana per 7 giorni da coprire.
  // Se le quote NON ripartissero ogni settimana, dopo i primi sette giorni i
  // turni disponibili finirebbero e il motore sarebbe costretto a chiamare
  // qualcuno oltre quota: è esattamente ciò che questo test esclude.
  const staff = [
    { id:'a1', name:'A1', stations:['a'], weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}] },
    { id:'a2', name:'A2', stations:['a'], weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const dates = monthDates(new Date(2026, 8, 1));
  const { newShifts, extras, shortfalls } = computeShiftsForDates(staff, needs, {config:BASE, dates});

  assert.equal(extras.length, 0, 'le quote bastano: nessuno deve essere chiamato oltre quota');
  assert.equal(shortfalls.length, 0, 'nessun giorno deve restare scoperto');

  const lavorati = id => Object.values(newShifts[id]).filter(c=>c.code==='P').length;
  // Ogni giorno deve avere qualcuno al pranzo. Non "esattamente uno": chi ha
  // ancora quota da smaltire viene schedulato comunque, ed è giusto così — la
  // quota dice quanti turni deve fare quella persona, non solo quanti ne servono.
  dates.forEach(d=>{
    const presenti = staff.filter(s=> newShifts[s.id][d].code === 'P').length;
    assert.ok(presenti >= 1, `il ${d} non c'è nessuno al pranzo`);
  });
  // Il mese tocca 5 settimane di calendario (la prima e l'ultima parziali), e
  // ogni settimana toccata porta la sua quota: il tetto è 5 turni per settimana
  // toccata, non 5 per ogni sette giorni di calendario.
  const settimane = groupByWeek(dates).length;
  staff.forEach(s=>{
    const riposi = Object.values(newShifts[s.id]).filter(c=>c.code==='R').length;
    assert.ok(lavorati(s.id) >= 15,
      `${s.name} lavora solo ${lavorati(s.id)} giorni: le quote non stanno ripartendo ogni settimana`);
    assert.ok(lavorati(s.id) <= settimane*5,
      `${s.name} supera i 5 turni settimanali di quota (${lavorati(s.id)} su ${settimane} settimane)`);
    assert.ok(riposi >= 5, `${s.name} deve avere dei riposi, ne ha ${riposi}`);
  });
});

test('generazione su una sola settimana: risultato identico al motore base', () => {
  const staff = [{ id:'s1', name:'Unico', stations:['a'], weeklyQuota:[{count:7,codes:['P']}] }];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const dates = weekDates(new Date(2026, 8, 16));
  const { newShifts, shortfalls } = computeShiftsForDates(staff, needs, {config:BASE, dates});
  assert.equal(shortfalls.length, 0);
  assert.deepEqual(Object.keys(newShifts['s1']).sort(), dates.slice().sort());
});

/* ===================== RICHIESTE APPROVATE: VINCOLI ASSOLUTI ===================== */

const SETT = weekDates(new Date(2026, 8, 16)); // lun 14 → dom 20 settembre 2026

test('un riposo approvato non viene mai violato, nemmeno per coprire un buco', () => {
  // Scenario costruito apposta perché il generatore sia TENTATO di violarlo:
  // Anna è l'unica qualificata e il fabbisogno c'è tutti i giorni. Senza
  // vincolo la chiamerebbe come turno extra proprio in quel giorno.
  const staff = [{ id:'a1', name:'Anna', stations:['a'], weeklyQuota:[{count:7,codes:['P']}] }];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const constraints = { a1: { [SETT[2]]: {blocked:'R'} } };   // mercoledì libero

  for(let i=0;i<50;i++){
    const { newShifts, shortfalls } = computeShiftsForDates(staff, needs,
      {config:BASE, dates:SETT, constraints});
    assert.equal(newShifts['a1'][SETT[2]].code, 'R', 'il riposo concordato è stato violato');
    assert.ok(shortfalls.some(sf=>sf.day===SETT[2]),
      'la scopertura di quel giorno va dichiarata, non risolta calpestando il riposo');
  }
});

test('le ferie approvate coprono tutto il periodo richiesto', () => {
  const staff = [{ id:'a1', name:'Anna', stations:['a'], weeklyQuota:[{count:7,codes:['P']}] }];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const ferie = {};
  SETT.slice(0,5).forEach(d=>{ ferie[d] = {blocked:'F'}; });
  const { newShifts } = computeShiftsForDates(staff, needs,
    {config:BASE, dates:SETT, constraints:{a1: ferie}});

  SETT.slice(0,5).forEach(d=> assert.equal(newShifts['a1'][d].code, 'F', `${d} doveva essere ferie`));
  SETT.slice(5).forEach(d=> assert.notEqual(newShifts['a1'][d].code, 'F', `${d} non era in ferie`));
});

test('chi ha chiesto solo pranzo non riceve mai turni di cena', () => {
  // La quota di Anna prevede sia pranzo che cena e il fabbisogno chiede
  // entrambi: senza il vincolo finirebbe sicuramente in servizio serale.
  const staff = [
    { id:'a1', name:'Anna', stations:['a'], weeklyQuota:[{count:7,codes:['P','S','SP']}] },
    { id:'a2', name:'Bruno', stations:['a'], weeklyQuota:[{count:7,codes:['P','S','SP']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[{stationId:'a',count:1}] };
  const soloPranzo = {};
  SETT.forEach(d=>{ soloPranzo[d] = {services:['pranzo']}; });

  for(let i=0;i<50;i++){
    const { newShifts } = computeShiftsForDates(staff, needs,
      {config:BASE, dates:SETT, constraints:{a1: soloPranzo}});
    SETT.forEach(d=>{
      const code = newShifts['a1'][d].code;
      assert.ok(['P','R','',null].includes(code) || code==='R',
        `Anna ha chiesto solo pranzo ma il ${d} ha ricevuto "${code}"`);
      assert.notEqual(code, 'S', 'turno di cena assegnato a chi ha chiesto solo pranzo');
      assert.notEqual(code, 'SP', 'lo spezzato porta dentro la cena: non è "solo pranzo"');
    });
  }
});

test('un turno accorpato non aggira una richiesta di singolo servizio', () => {
  // Lo spezzato copre pranzo E cena: chi ha chiesto solo pranzo non deve
  // riceverlo, perché gli porterebbe dentro il servizio che ha escluso.
  assert.equal(codeAllowedTest('SP', ['pranzo']), false);
  assert.equal(codeAllowedTest('P',  ['pranzo']), true);
  assert.equal(codeAllowedTest('S',  ['pranzo']), false);
  assert.equal(codeAllowedTest('SP', ['pranzo','cena']), true);
});
function codeAllowedTest(code, servizi){
  return codeAllowed({x:{d:{services:servizi}}}, 'x', 'd', code, BASE.codeToServices);
}

test('richieste impossibili da soddisfare producono scoperture dichiarate, non silenzio', () => {
  // Tutta la brigata in ferie lo stesso giorno: il servizio non si può coprire.
  const staff = [
    { id:'a1', name:'Anna',  stations:['a'], weeklyQuota:[{count:7,codes:['P']}] },
    { id:'a2', name:'Bruno', stations:['a'], weeklyQuota:[{count:7,codes:['P']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const giorno = SETT[3];
  const constraints = { a1:{ [giorno]:{blocked:'F'} }, a2:{ [giorno]:{blocked:'F'} } };
  const { newShifts, shortfalls } = computeShiftsForDates(staff, needs,
    {config:BASE, dates:SETT, constraints});

  assert.equal(newShifts['a1'][giorno].code, 'F');
  assert.equal(newShifts['a2'][giorno].code, 'F');
  const dichiarata = shortfalls.find(sf=>sf.day===giorno);
  assert.ok(dichiarata, 'il giorno scoperto deve comparire nel riepilogo');
  assert.equal(dichiarata.service, 'pranzo');
});

test('senza vincoli il comportamento resta identico a prima', () => {
  const staff = [{ id:'s1', name:'Unico', stations:['a'], weeklyQuota:[{count:7,codes:['P']}] }];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const a = computeShiftsForDates(staff, needs, {config:BASE, dates:SETT});
  const b = computeShiftsForDates(staff, needs, {config:BASE, dates:SETT, constraints:{}});
  assert.equal(a.shortfalls.length, 0);
  assert.equal(b.shortfalls.length, 0);
  SETT.forEach(d=>{
    assert.equal(a.newShifts['s1'][d].code, 'P');
    assert.equal(b.newShifts['s1'][d].code, 'P');
  });
});

/* ===================== PIÙ CUCINE: CHI GIRA TRA I LOCALI ===================== */

test('un impegno in un altra cucina vale come vincolo assoluto', () => {
  // Marco lavora in due locali. Il martedì è già in servizio nell'altro:
  // qui non deve comparire, anche se è l'unico qualificato e serve.
  const staff = [{ id:'m1', name:'Marco', stations:['a'], weeklyQuota:[{count:7,codes:['P']}] }];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const constraints = { m1: { [SETT[1]]: {blocked:'R'} } };  // impegnato altrove

  for(let i=0;i<40;i++){
    const { newShifts, shortfalls } = computeShiftsForDates(staff, needs,
      {config:BASE, dates:SETT, constraints});
    assert.equal(newShifts['m1'][SETT[1]].code, 'R',
      'assegnato qui mentre lavora nell\'altra cucina');
    assert.ok(shortfalls.some(sf=>sf.day===SETT[1]),
      'il buco va dichiarato, non risolto facendolo lavorare in due posti');
  }
});

test('gli altri giorni restano liberi: un impegno altrove non blocca la settimana', () => {
  const staff = [{ id:'m1', name:'Marco', stations:['a'], weeklyQuota:[{count:7,codes:['P']}] }];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const constraints = { m1: { [SETT[1]]: {blocked:'R'} } };
  const { newShifts } = computeShiftsForDates(staff, needs, {config:BASE, dates:SETT, constraints});
  SETT.filter((_,i)=>i!==1).forEach(d=>
    assert.equal(newShifts['m1'][d].code, 'P', `il ${d} Marco doveva essere disponibile`));
});
