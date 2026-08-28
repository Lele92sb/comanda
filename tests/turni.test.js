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

/* ===================== CHI NON HA STAZIONI ASSEGNATE =====================
   Una persona senza nessuna stazione non può coprire niente. Prima di questa
   correzione il motore le assegnava comunque i turni della sua quota, con
   stationId a null: turni finti, che contano nelle ore pianificate e nei
   controlli di sforamento contrattuale ma non coprono nessun servizio.
   Il caso non è raro: nasce da solo cancellando una stazione (turni/stazioni.js
   toglie l'id dalle persone che ce l'avevano, e chi ne aveva una sola resta
   senza). Resta però VISIBILE nella griglia, per l'assegnazione a mano. */

const GIORNI7 = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];

test('chi non ha stazioni non riceve mai un turno di lavoro', () => {
  const staff = [
    { id:'x', name:'Senza stazioni', stations:[], weeklyQuota:[{count:7,codes:['P']}] },
    { id:'y', name:'Collega',        stations:['a'], weeklyQuota:[{count:7,codes:['P']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const { newShifts } = computeShifts(staff, needs, {config:BASE});
  GIORNI7.forEach(d=>{
    const cell = newShifts['x'][d];
    assert.equal(cell.code, 'R', `il ${d} è stato assegnato un turno che non copre nulla`);
    assert.equal(cell.stationId, null);
    assert.equal(cell.extra, false);
  });
});

test('chi non ha stazioni resta a riposo anche con una richiesta di singolo servizio', () => {
  // Il ramo del vincolo "solo pranzo" è separato da quello libero: aveva lo
  // stesso difetto, e riguarda proprio le persone più delicate da pianificare.
  const staff = [
    { id:'x', name:'Senza stazioni', stations:[], weeklyQuota:[{count:7,codes:['P']}] },
    { id:'y', name:'Collega',        stations:['a'], weeklyQuota:[{count:7,codes:['P']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const soloPranzo = {}; GIORNI7.forEach(d=>{ soloPranzo[d] = {services:['pranzo']}; });
  const { newShifts } = computeShifts(staff, needs,
    {config:BASE, constraints:{x: soloPranzo}});
  GIORNI7.forEach(d=> assert.equal(newShifts['x'][d].code, 'R',
    `il ${d} il vincolo di singolo servizio ha fatto passare un turno fantasma`));
});

test('una richiesta approvata vale anche per chi non ha stazioni', () => {
  // Ordine delle operazioni: i vincoli si applicano PRIMA. Se il controllo
  // sulle stazioni li precedesse, ferie e malattie diventerebbero riposi e
  // sparirebbero dal prospetto.
  const staff = [{ id:'x', name:'Senza stazioni', stations:[], weeklyQuota:[{count:7,codes:['P']}] }];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  ['F','M'].forEach(codice=>{
    const vincoli = {}; GIORNI7.slice(0,5).forEach(d=>{ vincoli[d] = {blocked:codice}; });
    const { newShifts } = computeShifts(staff, needs, {config:BASE, constraints:{x:vincoli}});
    GIORNI7.slice(0,5).forEach(d=> assert.equal(newShifts['x'][d].code, codice,
      `il ${d} doveva restare ${codice}, non diventare riposo`));
    GIORNI7.slice(5).forEach(d=> assert.equal(newShifts['x'][d].code, 'R'));
  });
});

test('chi non ha stazioni resta comunque nella griglia, con un codice per ogni giorno', () => {
  // Decisione presa: resta visibile per l'assegnazione a mano. Fissa anche
  // l'invariante "ogni cella ha un codice" per il caso senza stazioni, che
  // sceglierlo vuoto romperebbe.
  const staff = [{ id:'x', name:'Senza stazioni', stations:[], weeklyQuota:[{count:7,codes:['P']}] }];
  const { newShifts } = computeShifts(staff, { colazione:[], pranzo:[], cena:[] }, {config:BASE});
  assert.equal(Object.keys(newShifts['x']).length, 7);
  GIORNI7.forEach(d=> assert.ok(newShifts['x'][d].code, `manca il codice del ${d}`));
});

test('chi non ha stazioni non toglie copertura a nessun altro', () => {
  const brigata = [
    { id:'a1', name:'A1', stations:['a'], weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}] },
    { id:'a2', name:'A2', stations:['a'], weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}] },
    { id:'b1', name:'B1', stations:['b'], weeklyQuota:[{count:5,codes:['S']},{count:2,codes:['R']}] },
  ];
  const senza = { id:'x', name:'Senza stazioni', stations:[], weeklyQuota:[{count:7,codes:['P','S']}] };
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[{stationId:'b',count:1}] };
  for(let i=0;i<50;i++){
    const con  = computeShifts(brigata.concat([senza]), needs, {config:BASE});
    const solo = computeShifts(brigata, needs, {config:BASE});
    assert.equal(con.shortfalls.length, solo.shortfalls.length,
      'la presenza di chi non ha stazioni ha cambiato le scoperture');
    assert.equal(con.extras.length, solo.extras.length,
      'la presenza di chi non ha stazioni ha cambiato i turni oltre quota');
  }
});

test('chi non è pianificabile viene dichiarato, non lasciato da intuire', () => {
  const staff = [
    { id:'x', name:'Senza stazioni', stations:[], weeklyQuota:[{count:7,codes:['P']}] },
    { id:'y', name:'Collega',        stations:['a'], weeklyQuota:[{count:7,codes:['P']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const r = computeShifts(staff, needs, {config:BASE});
  assert.equal(r.nonPianificabili.length, 1);
  assert.equal(r.nonPianificabili[0].staffId, 'x');
  // Su un mese la persona va nominata una volta sola, non una per settimana.
  const dates = monthDates(new Date(2026, 8, 1));
  const m = computeShiftsForDates(staff, needs, {config:BASE, dates});
  assert.equal(m.nonPianificabili.length, 1);
});

/* ===================== TURNI OLTRE QUOTA: CHI SI PUÒ CHIAMARE =====================
   `puoFareExtra` dice se la persona è disponibile a turni OLTRE la sua quota.
   Il default è "sì", perché chi ha già i dati salvati non ha il campo: deve
   comportarsi esattamente come prima, senza nessuna migrazione. */

test('chi non può fare extra non viene chiamato oltre quota: il buco si dichiara', () => {
  // Gemello del test "turno extra: se un secondo qualificato esiste...":
  // stessa brigata, stesso fabbisogno, ma Marco ha detto di no.
  const staff = [
    { id:'s1', name:'Marco', stations:['a'], weeklyQuota:[{count:7,codes:['R']}], puoFareExtra:false },
    { id:'s2', name:'Luca',  stations:['a'], weeklyQuota:[{count:7,codes:['P']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:2}], cena:[] };
  const { shortfalls, extras, newShifts } = computeShifts(staff, needs, {config:BASE});
  assert.equal(extras.length, 0, 'nessuno doveva essere chiamato oltre quota');
  assert.equal(shortfalls.length, 7, 'il buco va dichiarato, non risolto chiamando chi ha detto di no');
  GIORNI7.forEach(d=> assert.equal(newShifts['s1'][d].code, 'R'));
});

test('il campo assente vale come sì: i dati già salvati non cambiano comportamento', () => {
  const brigata = flag => [
    Object.assign({ id:'s1', name:'Marco', stations:['a'], weeklyQuota:[{count:7,codes:['R']}] },
                  flag === undefined ? {} : {puoFareExtra:flag}),
    { id:'s2', name:'Luca', stations:['a'], weeklyQuota:[{count:7,codes:['P']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:2}], cena:[] };
  [undefined, true].forEach(flag=>{
    const { extras, shortfalls } = computeShifts(brigata(flag), needs, {config:BASE});
    assert.equal(extras.length, 7, 'senza il campo il comportamento deve restare quello di prima');
    assert.equal(shortfalls.length, 0);
  });
});

test('chi non può fare extra riceve comunque i turni della SUA quota', () => {
  // Il divieto vale oltre la quota, non dentro. Se il filtro finisse fra i
  // candidati normali, questa persona non lavorerebbe più affatto.
  const staff = [
    { id:'s1', name:'Marco', stations:['a'], weeklyQuota:[{count:7,codes:['P']}], puoFareExtra:false },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const { newShifts, extras, shortfalls } = computeShifts(staff, needs, {config:BASE});
  assert.equal(extras.length, 0);
  assert.equal(shortfalls.length, 0);
  GIORNI7.forEach(d=>{
    assert.equal(newShifts['s1'][d].code, 'P', `il ${d} manca un turno che la quota prevedeva`);
    assert.equal(newShifts['s1'][d].stationId, 'a');
    assert.equal(newShifts['s1'][d].extra, false);
  });
});

test('fra due qualificati l\'extra va a chi lo può fare', () => {
  const staff = [
    { id:'s1', name:'Marco', stations:['a'], weeklyQuota:[{count:7,codes:['R']}], puoFareExtra:false },
    { id:'s2', name:'Luca',  stations:['a'], weeklyQuota:[{count:7,codes:['R']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  // Ripetuto: l'ordine dei candidati è mescolato, un solo giro non prova nulla.
  for(let i=0;i<50;i++){
    const { extras, shortfalls } = computeShifts(staff, needs, {config:BASE});
    assert.equal(shortfalls.length, 0, 'un candidato disponibile c\'era');
    assert.equal(extras.length, 7);
    extras.forEach(e=> assert.equal(e.staffId, 's2', 'chiamato chi aveva detto di no'));
  }
});

test('il divieto di extra vale in ogni settimana del periodo', () => {
  // Il raggruppamento per settimana ricostruisce lo stato a ogni giro: qui si
  // controlla che il campo non si perda per strada.
  const staff = [
    { id:'s1', name:'Marco', stations:['a'], weeklyQuota:[{count:7,codes:['R']}], puoFareExtra:false },
    { id:'s2', name:'Luca',  stations:['a'], weeklyQuota:[{count:7,codes:['P']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:2}], cena:[] };
  const dates = monthDates(new Date(2026, 8, 1));
  const { extras, newShifts } = computeShiftsForDates(staff, needs, {config:BASE, dates});
  assert.equal(extras.length, 0);
  dates.forEach(d=> assert.equal(newShifts['s1'][d].code, 'R', `il ${d} Marco è stato chiamato`));
});

/* ===================== L'INTELLIGENZA DEL GENERATORE =====================
   I test qui sotto non controllano che il codice non esploda: misurano.
   Ognuno porta accanto il numero che dava il motore PRIMA, misurato eseguendolo
   (400 generazioni per scenario), così se un domani qualcuno tocca gli
   ordinamenti si vede subito cosa si è perso. */

// Sei persone da 4 turni di lavoro (24 slot di quota) contro un fabbisogno di 4
// al pranzo per 7 giorni (28 turni). Quattro turni oltre quota sono inevitabili:
// è il divario strutturale fra fabbisogno e quote. Tutto ciò che supera quattro
// è spreco del generatore.
const BRIGATA_STRETTA = Array.from({length:6}, (_,i)=>({
  id:'p'+i, name:'P'+i, stations:['a'],
  weeklyQuota:[{count:4,codes:['P']},{count:3,codes:['R']}],
}));
const FABBISOGNO_STRETTO = { colazione:[], pranzo:[{stationId:'a',count:4}], cena:[] };

test('gli extra scendono al minimo strutturale: nessun turno oltre quota sprecato', () => {
  // PRIMA: media 4,17 a settimana, con punte di 6. DOPO: sempre esattamente 4.
  // La differenza è la quota che veniva bruciata all'inizio della settimana
  // senza guardare quanti giorni restassero da coprire.
  for(let i=0;i<200;i++){
    const { extras, shortfalls } = computeShifts(BRIGATA_STRETTA, FABBISOGNO_STRETTO, {config:BASE});
    assert.equal(shortfalls.length, 0);
    assert.equal(extras.length, 4,
      `${extras.length} turni oltre quota: il divario fra fabbisogno e quote ne giustifica 4`);
  }
});

test('gli extra non cadono più a metà settimana: la quota arriva fino in fondo', () => {
  // PRIMA, extra medi per giorno: Ven 0,06 · Sab 1,11 · Dom 3,00.
  // DOPO: solo l'ultimo giorno, quello in cui la quota è oggettivamente finita.
  for(let i=0;i<200;i++){
    const { extras } = computeShifts(BRIGATA_STRETTA, FABBISOGNO_STRETTO, {config:BASE});
    extras.forEach(e=> assert.ok(GIORNI7.indexOf(e.day) >= 5,
      `un turno oltre quota il ${e.day}: la quota è stata bruciata troppo presto`));
  }
});

test('gli extra si concentrano su una persona sola, non su tutta la brigata', () => {
  // PRIMA: 7 extra sparsi su 3,46 teste diverse in media (fino a 4 su 4).
  // DOPO: 1 sola. Sette telefonate a sette persone diventano una telefonata a
  // una persona, che è il modo in cui il prospetto si fa a mano.
  const staff = Array.from({length:4}, (_,i)=>({
    id:'q'+i, name:'Q'+i, stations:['a'], weeklyQuota:[{count:7,codes:['R']}],
  }));
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  for(let i=0;i<200;i++){
    const { extras } = computeShifts(staff, needs, {config:BASE});
    assert.equal(extras.length, 7);
    // Va misurato DENTRO la singola settimana: sommando più generazioni il
    // conteggio torna uniforme comunque e non proverebbe niente.
    assert.equal(new Set(extras.map(e=>e.staffId)).size, 1,
      'gli extra si sono sparsi su più persone invece di concentrarsi');
  }
});

test('il motore sa quanto dura un turno e pareggia le ore fra pari qualifica', () => {
  // PRIMA il motore non guardava mai le ore: SP (11h) e P (8h) erano la stessa
  // cosa, e a parità di qualifica decideva solo il caso. Scarto max-min entro la
  // singola settimana: media 6,45 ore, caso peggiore 12. DOPO: media 2,60, caso
  // peggiore 6. La soglia sta in mezzo apposta.
  const staff = Array.from({length:4}, (_,i)=>({
    id:'h'+i, name:'H'+i, stations:['a'],
    weeklyQuota:[{count:5,codes:['SP','P','S']},{count:2,codes:['R']}],
  }));
  const needs = { colazione:[],
    pranzo:[{stationId:'a',count:2}], cena:[{stationId:'a',count:2}] };
  for(let i=0;i<200;i++){
    const { newShifts } = computeShifts(staff, needs, {config:BASE});
    const ore = staff.map(s=> Object.values(newShifts[s.id])
      .reduce((n,c)=> n + ((BASE.turnoDef[c.code]||{}).hours||0), 0));
    const scarto = Math.max(...ore) - Math.min(...ore);
    assert.ok(scarto <= 8, `una settimana con ${scarto} ore di scarto fra pari qualifica`);
  }
});

test('ore mancanti o a zero nella configurazione non mandano in tilt l ordinamento', () => {
  // Le ore arrivano dalla configurazione della cucina: possono essere vuote.
  // Un NaN nel confronto non si vede, rende solo l'ordinamento indefinito.
  const cfg = buildShiftConfig(
    [{id:'pranzo',name:'Pranzo'}],
    [{code:'P', label:'Pranzo', hours:'', services:['pranzo']}]
  );
  assert.equal(cfg.turnoDef['P'].hours, 0);
  const staff = [
    { id:'a1', name:'A1', stations:['a'], weeklyQuota:[{count:7,codes:['P']}] },
    { id:'a2', name:'A2', stations:['a'], weeklyQuota:[{count:7,codes:['P']}] },
  ];
  const { newShifts, shortfalls } = computeShifts(staff, {pranzo:[{stationId:'a',count:1}]}, {config:cfg});
  assert.equal(shortfalls.length, 0);
  GIORNI7.forEach(d=>{
    assert.ok(newShifts['a1'][d].code, 'cella senza codice');
    assert.ok(newShifts['a2'][d].code, 'cella senza codice');
  });
});

/* ----------------------- Il tetto ai turni oltre quota ----------------------- */

test('con un tetto gli extra si spargono, invece di cadere tutti sulla stessa persona', () => {
  const staff = Array.from({length:4}, (_,i)=>({
    id:'q'+i, name:'Q'+i, stations:['a'], weeklyQuota:[{count:7,codes:['R']}],
  }));
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  for(let i=0;i<50;i++){
    const { extras } = computeShifts(staff, needs, {config:BASE, maxExtraPerPersona:2});
    assert.equal(extras.length, 7);
    const perPersona = {};
    extras.forEach(e=>{ perPersona[e.staffId] = (perPersona[e.staffId]||0)+1; });
    // Sette extra e un tetto di due su quattro persone: 2+2+2+1.
    Object.values(perPersona).forEach(n=> assert.ok(n <= 2, `${n} extra su una persona sola col tetto a 2`));
  }
});

test('il tetto si sfora invece di inventare una scopertura che non esiste', () => {
  // Una sola persona chiamabile: rispettare il tetto significherebbe dichiarare
  // scoperti cinque giorni che qualcuno potrebbe coprire. Una scopertura falsa
  // manda a cercare un problema che non c'è: meglio dire che si è sforato.
  const staff = [
    { id:'s1', name:'Marco', stations:['a'], weeklyQuota:[{count:7,codes:['R']}] },
    { id:'s2', name:'Luca',  stations:['a'], weeklyQuota:[{count:7,codes:['P']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:2}], cena:[] };
  const { extras, shortfalls } = computeShifts(staff, needs, {config:BASE, maxExtraPerPersona:2});
  assert.equal(shortfalls.length, 0, 'nessuna scopertura: un candidato cera tutti i giorni');
  assert.equal(extras.length, 7);
});

test('senza tetto il comportamento è quello di sempre', () => {
  const staff = [
    { id:'s1', name:'Marco', stations:['a'], weeklyQuota:[{count:7,codes:['R']}] },
    { id:'s2', name:'Luca',  stations:['a'], weeklyQuota:[{count:7,codes:['P']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:2}], cena:[] };
  const { extras } = computeShifts(staff, needs, {config:BASE});
  assert.equal(extras.length, 7);
});

/* ----------------------- Il seme: rigenerare uguale ----------------------- */

const BRIGATA_SEME = [
  { id:'a1', name:'A1', stations:['a'], weeklyQuota:[{count:3,codes:['SP']},{count:2,codes:['P','S']},{count:2,codes:['R']}] },
  { id:'a2', name:'A2', stations:['a'], weeklyQuota:[{count:3,codes:['SP']},{count:2,codes:['P','S']},{count:2,codes:['R']}] },
  { id:'j',  name:'Jolly', stations:['a','b'], weeklyQuota:[{count:6,codes:['P','S']},{count:1,codes:['R']}] },
  { id:'b1', name:'B1', stations:['b'], weeklyQuota:[{count:5,codes:['P','S']},{count:2,codes:['R']}] },
];
const FABBISOGNO_SEME = { colazione:[],
  pranzo:[{stationId:'a',count:1},{stationId:'b',count:1}],
  cena:[{stationId:'a',count:1},{stationId:'b',count:1}] };

test('con lo stesso seme si rigenera esattamente lo stesso prospetto', () => {
  const dates = monthDates(new Date(2026, 8, 1));
  const a = computeShiftsForDates(BRIGATA_SEME, FABBISOGNO_SEME, {config:BASE, dates, seed:'2026-09-01'});
  const b = computeShiftsForDates(BRIGATA_SEME, FABBISOGNO_SEME, {config:BASE, dates, seed:'2026-09-01'});
  assert.deepEqual(a.newShifts, b.newShifts, 'stesso seme, prospetto diverso: qualche punto usa ancora il caso');
  assert.deepEqual(a.extras, b.extras);
  assert.deepEqual(a.shortfalls, b.shortfalls);
});

test('semi diversi danno prospetti diversi: il seme viene usato davvero', () => {
  // Senza questo, il test precedente passerebbe anche con un motore rotto in
  // modo banale (per esempio se ignorasse il seme e fosse deterministico da sé).
  const dates = weekDates(new Date(2026, 8, 16));
  const a = computeShiftsForDates(BRIGATA_SEME, FABBISOGNO_SEME, {config:BASE, dates, seed:1});
  const diversi = [2,3,4,5,6,7,8].some(sm=>{
    const b = computeShiftsForDates(BRIGATA_SEME, FABBISOGNO_SEME, {config:BASE, dates, seed:sm});
    return JSON.stringify(a.newShifts) !== JSON.stringify(b.newShifts);
  });
  assert.ok(diversi, 'tutti i semi danno lo stesso risultato: il seme non viene usato');
});

test('senza seme il caso resta: due generazioni possono differire come prima', () => {
  const dates = weekDates(new Date(2026, 8, 16));
  const primo = JSON.stringify(computeShiftsForDates(BRIGATA_SEME, FABBISOGNO_SEME,
    {config:BASE, dates}).newShifts);
  let diverso = false;
  for(let i=0;i<40 && !diverso;i++){
    diverso = JSON.stringify(computeShiftsForDates(BRIGATA_SEME, FABBISOGNO_SEME,
      {config:BASE, dates}).newShifts) !== primo;
  }
  assert.ok(diverso, 'senza seme il motore è diventato deterministico: non era questo il patto');
});

test('un seme solo non fa uscire quattro settimane identiche', () => {
  const dates = monthDates(new Date(2026, 8, 1));
  const { newShifts } = computeShiftsForDates(BRIGATA_SEME, FABBISOGNO_SEME,
    {config:BASE, dates, seed:'2026-09-01'});
  const settimane = groupByWeek(dates).filter(g=> g.length === 7);
  const impronte = settimane.map(g=> g.map(d=> BRIGATA_SEME.map(s=> newShifts[s.id][d].code).join('')).join('|'));
  assert.ok(new Set(impronte).size > 1, 'le settimane del mese sono uscite tutte uguali');
});

test('il jolly non viene sprecato nemmeno fra i turni oltre quota', () => {
  // Canarino: la concentrazione degli extra non deve passare davanti alla
  // regola "chi sa fare meno stazioni va piazzato lì", che è una regressione
  // già pagata in produzione.
  const staff = [
    { id:'sp', name:'Specialista', stations:['a'], weeklyQuota:[{count:7,codes:['R']}] },
    { id:'jo', name:'Jolly',       stations:['a','b'], weeklyQuota:[{count:7,codes:['R']}] },
    { id:'b1', name:'B1',          stations:['b'], weeklyQuota:[{count:7,codes:['P']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1},{stationId:'b',count:2}], cena:[] };
  for(let i=0;i<50;i++){
    const { extras } = computeShifts(staff, needs, {config:BASE});
    const suA = extras.filter(e=> e.stationId === 'a');
    suA.forEach(e=> assert.equal(e.staffId, 'sp',
      'la stazione a è stata coperta dal jolly, che serviva altrove'));
  }
});
