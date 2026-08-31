// Test del motore di generazione turni (app/logic.js).
// Uso node:test, incluso in Node 18+, per non aggiungere dipendenze esterne a un progetto
// che deve restare semplice da eseguire ovunque con "npm test".
import test from 'node:test';
import assert from 'node:assert/strict';
import { DAYS, computeShifts, buildShiftConfig, computeShiftsForDates,
         weekDates, monthDates, groupByWeek, isoDate, startOfWeek, dayName,
         codeAllowed, contoCapienza,
         stazioneDi, stazioniDi, normalizzaCella, assegnaStazione,
         serviziDelCodice } from '../app/src/lib/logic.js';
// La cucina VERA dello chef, esportata dall'app: e' il banco su cui si misura
// il generatore. Vedi il blocco in fondo al file.
import { DEROMA } from './dati/cucina-deroma.js';

// Configurazione classica (colazione/pranzo/cena con spezzato): è quella che
// l'app crea da sola per chi non ne ha una propria.
const BASE = buildShiftConfig(null, null);

// NESSUNO SU UNA PARTITA CHE NON SA FARE. E' la cosa piu' importante che questi
// test provano, e va letta dalla MAPPA servizio → stazione: da quando la cella
// ne ha una, guardare il solo `cell.stationId` proverebbe una stazione su due e
// resterebbe verde su un motore che sbaglia la seconda. Verde e cieco e' il modo
// piu' facile di rompersi da soli in questa modifica.
function noQualificationViolations(staff, newShifts, cfg){
  cfg = cfg || BASE;
  for(const s of staff){
    for(const day of Object.keys(newShifts[s.id])){
      const cell = newShifts[s.id][day];
      for(const st of stazioniDi(cell, cfg)){
        if(!(s.stations||[]).includes(st)){
          return `${s.name} assegnato a stazione non qualificata (${st}) il ${day}`;
        }
      }
    }
  }
  return null;
}

// La mappa deve avere ESATTAMENTE una chiave per servizio coperto dal codice:
// zero per R/M/F e per la cella vuota. Prende sia le chiavi orfane (un servizio
// tolto dal tipo di turno) sia i servizi dimenticati.
function noStationKeyViolations(staff, newShifts, cfg){
  cfg = cfg || BASE;
  for(const s of staff){
    for(const day of Object.keys(newShifts[s.id])){
      const cell = newShifts[s.id][day];
      const attesi = (serviziDelCodice(cell.code, cfg) || []).slice().sort();
      const trovati = Object.keys(cell.stations || {}).sort();
      if(attesi.join('|') !== trovati.join('|')){
        return `${s.name} il ${day}: codice ${cell.code||'—'} copre [${attesi}] ma la mappa dice [${trovati}]`;
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
  // ESATTAMENTE uno al pranzo, non "almeno uno". Qui prima c'era scritto il
  // contrario — "chi ha ancora quota da smaltire viene schedulato comunque, ed
  // è giusto così" — e quella riga era il difetto peggiore del generatore
  // messo per iscritto: la quota bruciata dove non serve è la quota che manca
  // il sabato, e diventa un turno extra. Parole dello chef: "sul fabbisogno
  // c'è scritto 1 e così deve essere, altrimenti servono troppi extra poi per
  // coprire la settimana".
  dates.forEach(d=>{
    const presenti = staff.filter(s=> newShifts[s.id][d].code === 'P').length;
    assert.equal(presenti, 1, `il ${d} al pranzo ci sono ${presenti} persone, il fabbisogno ne chiede 1`);
  });
  // E in totale: un posto al giorno, nessuno in più.
  const totLavorati = staff.reduce((n,s)=> n + lavorati(s.id), 0);
  assert.equal(totLavorati, dates.length,
    `${totLavorati} turni di lavoro per ${dates.length} giorni da coprire`);
  // Il mese tocca 5 settimane di calendario (la prima e l'ultima parziali), e
  // ogni settimana toccata porta la sua quota: il tetto è 5 turni per settimana
  // toccata, non 5 per ogni sette giorni di calendario.
  const settimane = groupByWeek(dates).length;
  staff.forEach(s=>{
    const riposi = Object.values(newShifts[s.id]).filter(c=>c.code==='R').length;
    // Con la copertura esatta il totale e' fissato dal fabbisogno (un posto al
    // giorno), quindi due persone se lo dividono: 15 e 15 nel caso perfetto,
    // 14 e 16 va altrettanto bene. Quello che conta e' che nessuno resti
    // fermo, cioe' che le quote ripartano ogni settimana invece di esaurirsi.
    assert.ok(lavorati(s.id) >= 12,
      `${s.name} lavora solo ${lavorati(s.id)} giorni: le quote non stanno ripartendo ogni settimana`);
    assert.ok(Math.abs(lavorati(staff[0].id) - lavorati(staff[1].id)) <= 4,
      `il lavoro e' spartito male: ${lavorati(staff[0].id)} contro ${lavorati(staff[1].id)}`);
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

test('gli extra si spargono sulla brigata, non si accumulano su una testa sola', () => {
  // Questo test diceva l'ESATTO CONTRARIO, ed è stato girato apposta.
  //
  // Il criterio della concentrazione era stato dedotto guardando un prospetto
  // di turni, non chiedendolo a chi lo aveva compilato. Lo chef, messo davanti
  // al risultato: "i turni non li assegno a chi lavora di più, ma semplicemente
  // nella partita dove serve", e "sono riuscito a coprire tutti i turni con
  // soli 6 extra dati a 6 persone diverse".
  //
  // Sette extra su una testa sola sono una settimana rovinata a una persona.
  // Sparsi su quattro, sono meno di due turni in più a testa.
  const staff = Array.from({length:4}, (_,i)=>({
    id:'q'+i, name:'Q'+i, stations:['a'], weeklyQuota:[{count:7,codes:['R']}],
  }));
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  for(let i=0;i<200;i++){
    const { extras } = computeShifts(staff, needs, {config:BASE});
    assert.equal(extras.length, 7);
    // Va misurato DENTRO la singola settimana: sommando più generazioni il
    // conteggio tornerebbe uniforme comunque e non proverebbe niente.
    assert.equal(new Set(extras.map(e=>e.staffId)).size, 4,
      'gli extra si sono accumulati invece di spargersi su tutta la brigata');
    // E spartiti in parti quasi uguali: 7 su 4 fa 2,2,2,1.
    const perTesta = {};
    extras.forEach(e=>{ perTesta[e.staffId] = (perTesta[e.staffId]||0)+1; });
    const conti = Object.values(perTesta);
    assert.ok(Math.max(...conti) - Math.min(...conti) <= 1,
      `spartizione sbilanciata: ${conti.join('/')}`);
  }
});

test('il motore sa quanto dura un turno e pareggia le ore fra pari qualifica', () => {
  // Questo test e' stato ri-tarato quando e' arrivata la copertura esatta, e
  // vale la pena dire perche' invece di cambiare il numero in silenzio.
  //
  // PRIMA della copertura esatta il riempimento finale rabboccava sempre la
  // quota fino in fondo, anche dove il fabbisogno non chiedeva nessuno: le ore
  // risultavano pareggiate, ma pareggiate con turni finti. Media 2,60.
  // DOPO, il motore produce solo i turni che servono, e le ore diventano quelle
  // vere. Misurato su 300 generazioni: media 9,00 e caso peggiore 9.
  //
  // Il criterio delle ore non pareggia piu' la media (senza di lui e' 8,60,
  // quindi perfino un filo meglio): quello che fa adesso e' TAGLIARE LA CODA.
  // Senza, il caso peggiore sale a 15. La soglia sta fra 9 e 15.
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
    assert.ok(scarto <= 11, `una settimana con ${scarto} ore di scarto fra pari qualifica`);
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

// ----------------------------------------------------------------------------
// I tre test che seguono nascono da una verifica avversariale: si è provato a
// CANCELLARE il codice che dichiaravano di proteggere, e la suite restava
// verde. Un test che sopravvive alla rimozione di ciò che difende non difende
// niente. Le soglie non sono scelte a occhio: stanno in mezzo fra la misura col
// codice e la misura senza, così il test è rosso sul motore mutilato.
// ----------------------------------------------------------------------------

test('la quota residua guida la scelta quando le quote NON sono tutte uguali', () => {
  // Il test che c'era usava sei persone identiche: con quote uguali "quota
  // residua" e "ore già fatte" ordinano allo stesso modo, quindi ciascuno dei
  // due criteri da solo dava lo stesso risultato e togliendone uno non
  // cambiava niente. Serve una brigata ETEROGENEA per vederli separati.
  // Misurato su 300 generazioni: col criterio 1,00 extra (peggiore 1);
  // senza, 2,00 (peggiore 2).
  const staff = [
    { id:'L1', name:'L1', stations:['a'], weeklyQuota:[{count:3,codes:['SP']},{count:4,codes:['R']}] },
    { id:'L2', name:'L2', stations:['a'], weeklyQuota:[{count:3,codes:['SP']},{count:4,codes:['R']}] },
    { id:'C1', name:'C1', stations:['a'], weeklyQuota:[{count:6,codes:['P']},{count:1,codes:['R']}] },
    { id:'C2', name:'C2', stations:['a'], weeklyQuota:[{count:6,codes:['P']},{count:1,codes:['R']}] },
  ];
  const needs = { colazione:[],
    pranzo:[{stationId:'a',count:2}], cena:[{stationId:'a',count:1}] };
  let peggiore = 0;
  for(let i=0;i<120;i++){
    const { extras } = computeShifts(staff, needs, {config:BASE});
    if(extras.length > peggiore) peggiore = extras.length;
  }
  assert.ok(peggiore <= 1, `caso peggiore ${peggiore} extra: la quota residua non sta guidando la scelta`);
});

test('il criterio delle ore taglia la coda: senza, il caso peggiore raddoppia', () => {
  // Questo test sostituisce uno che asseriva sulla MEDIA. Era giusto quando
  // l'ho scritto e non lo e' piu': con la copertura esatta il criterio delle
  // ore non migliora la media (9,00 con, 8,60 senza) ma dimezza il caso
  // peggiore (9 con, 15 senza). Un test che continuasse a guardare la media
  // fallirebbe difendendo una cosa che il codice non fa piu'.
  const staff = Array.from({length:4}, (_,i)=>({
    id:'m'+i, name:'M'+i, stations:['a'],
    weeklyQuota:[{count:5,codes:['SP','P','S']},{count:2,codes:['R']}],
  }));
  const needs = { colazione:[],
    pranzo:[{stationId:'a',count:2}], cena:[{stationId:'a',count:2}] };
  let peggiore = 0;
  for(let i=0;i<200;i++){
    const { newShifts } = computeShifts(staff, needs, {config:BASE});
    const ore = staff.map(s=> Object.values(newShifts[s.id])
      .reduce((n,c)=> n + ((BASE.turnoDef[c.code]||{}).hours||0), 0));
    const scarto = Math.max(...ore) - Math.min(...ore);
    if(scarto > peggiore) peggiore = scarto;
  }
  assert.ok(peggiore <= 11,
    `caso peggiore ${peggiore} ore di scarto: il criterio delle ore non sta tagliando la coda`);
});

test('un tetto agli extra pari a zero vuol dire NESSUN extra, non extra a volonta', () => {
  // Prima 0 non era né regola né preferenza: il filtro "extra fatti < 0" era
  // vuoto al primo giro, il tetto non scattava mai e si ripiegava sui candidati
  // liberi. Chi scriveva 0 per non avere extra otteneva sette extra tutti sulla
  // stessa persona: l'esatto contrario di quello che aveva chiesto.
  const staff = Array.from({length:3}, (_,i)=>({
    id:'z'+i, name:'Z'+i, stations:['a'], weeklyQuota:[{count:7,codes:['R']}],
  }));
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const dal = '2026-09-07', al = '2026-09-13';
  const { extras, shortfalls } = computeShiftsForDates(staff, needs,
    { config:BASE, dal, al, maxExtraPerPersona:0 });
  assert.equal(extras.length, 0, `tetto a zero ma ${extras.length} extra assegnati`);
  assert.ok(shortfalls.length > 0, 'il buco va dichiarato, non nascosto');
});

/* ===================== PRIORITA' DI PARTITA =====================
   `staff.stations` e' sempre stato un array, e l'ordine c'era gia': adesso
   quell'ordine E' la priorita', la prima stazione e' la partita principale.
   Nessuna coppia di partite e' cablata: la decide il titolare, e vale per
   qualunque combinazione. Parole dello chef: «alcune persone magari fanno primi
   e secondi o secondi e pass, quindi la priorita' la deve impostare sempre il
   titolare o chi per lui gestisce i dipendenti sulla piattaforma». */

test('la partita principale viene servita per prima, e a deciderlo e l ORDINE di stations', () => {
  // Due persone, le stesse due partite, ordini opposti. Nessuna delle due e'
  // piu' "specialista" dell'altra: se il motore non guardasse l'ordine, a
  // decidere resterebbe solo il mescolamento dei candidati.
  const brigata = (primaDiA, primaDiB) => [
    { id:'A', name:'A', stations:[primaDiA, primaDiB], weeklyQuota:[{count:7,codes:['P']}] },
    { id:'B', name:'B', stations:[primaDiB, primaDiA], weeklyQuota:[{count:7,codes:['P']}] },
  ];
  const needs = { colazione:[],
    pranzo:[{stationId:'primi',count:1},{stationId:'pass',count:1}], cena:[] };
  for(let i=0;i<50;i++){
    const dritto = computeShifts(brigata('primi','pass'), needs, {config:BASE});
    GIORNI7.forEach(d=>{
      assert.equal(dritto.newShifts['A'][d].stationId, 'primi',
        `il ${d} A e' finito fuori dalla sua partita principale`);
      assert.equal(dritto.newShifts['B'][d].stationId, 'pass',
        `il ${d} B e' finito fuori dalla sua partita principale`);
    });
    // Rovesciando i due elenchi si rovescia il prospetto: la prova che a
    // contare e' la posizione nell'array, non il nome della stazione ne'
    // l'ordine dell'anagrafica.
    const rovescio = computeShifts(brigata('pass','primi'), needs, {config:BASE});
    GIORNI7.forEach(d=>{
      assert.equal(rovescio.newShifts['A'][d].stationId, 'pass',
        `il ${d} l'ordine di stations e' stato ignorato`);
      assert.equal(rovescio.newShifts['B'][d].stationId, 'primi',
        `il ${d} l'ordine di stations e' stato ignorato`);
    });
  }
});

test('la partita principale non passa davanti alla regola del jolly', () => {
  // I due criteri possono litigare, e quando litigano vince quello vecchio.
  // Qui il pass e' la partita PRINCIPALE del jolly e la SECONDARIA dello
  // specialista: la priorita' da sola manderebbe il jolly al pass e lo
  // brucerebbe, che e' esattamente la regressione gia' pagata in produzione.
  const staff = [
    { id:'sp', name:'Specialista', stations:['lavaggio','pass'],
      weeklyQuota:[{count:7,codes:['P']}] },
    { id:'jo', name:'Jolly', stations:['pass','primi','secondi'],
      weeklyQuota:[{count:7,codes:['P']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'pass',count:1}], cena:[] };
  for(let i=0;i<50;i++){
    const { newShifts } = computeShifts(staff, needs, {config:BASE});
    GIORNI7.forEach(d=>{
      assert.equal(newShifts['sp'][d].stationId, 'pass',
        `il ${d} al pass e' andato il jolly, che serviva libero altrove`);
      assert.equal(newShifts['jo'][d].stationId, null,
        `il ${d} il jolly e' stato consumato al pass`);
    });
  }
});

test('la partita principale non fa saltare la copertura: prima si copre, poi si sceglie dove', () => {
  // La priorita' e' una preferenza, non un vincolo: quando la principale e'
  // gia' coperta la persona va sulla secondaria invece di restare a casa.
  const staff = [
    { id:'A', name:'A', stations:['primi','pass'], weeklyQuota:[{count:7,codes:['P']}] },
    { id:'B', name:'B', stations:['primi','pass'], weeklyQuota:[{count:7,codes:['P']}] },
  ];
  const needs = { colazione:[],
    pranzo:[{stationId:'primi',count:1},{stationId:'pass',count:1}], cena:[] };
  for(let i=0;i<50;i++){
    const { shortfalls, extras, newShifts } = computeShifts(staff, needs, {config:BASE});
    assert.equal(shortfalls.length, 0, 'la priorita di partita ha aperto un buco');
    assert.equal(extras.length, 0);
    GIORNI7.forEach(d=>{
      const occupate = [newShifts['A'][d].stationId, newShifts['B'][d].stationId].sort();
      assert.deepEqual(occupate, ['pass','primi'],
        `il ${d} le due postazioni non sono state coperte entrambe`);
    });
  }
});

test('anche la ripartizione della settimana segue la partita principale', () => {
  // «Mi divido prima le persone a partita»: il motore lo fa PRIMA di guardare
  // il primo giorno, distribuendo la capienza di ciascuno fra le stazioni. Se
  // li' l'ordine di `stations` non viene guardato, la capienza di una persona
  // finisce sulla partita sbagliata e a fine settimana manca dove serviva.
  //
  // Brigata di misura: otto persone, due partite a testa, cinque turni di
  // quota — cioe' esattamente il caso dello chef, dove il criterio "chi sa fare
  // meno stazioni" pareggia sempre e a decidere resta questo.
  // Misurato su 20 lotti da 120 generazioni: con il criterio 30-59 scoperture
  // per lotto, senza 114-155. La soglia sta in mezzo, non a occhio.
  const quota = [{count:5,codes:['P','S','SP']},{count:2,codes:['R']}];
  const staff = [
    { id:'P1', name:'P1', stations:['primi','secondi'],      weeklyQuota:quota },
    { id:'P2', name:'P2', stations:['primi','pass'],         weeklyQuota:quota },
    { id:'S1', name:'S1', stations:['secondi','primi'],      weeklyQuota:quota },
    { id:'S2', name:'S2', stations:['secondi','pass'],       weeklyQuota:quota },
    { id:'A1', name:'A1', stations:['antipasti','insalate'], weeklyQuota:quota },
    { id:'A2', name:'A2', stations:['antipasti','primi'],    weeklyQuota:quota },
    { id:'I1', name:'I1', stations:['insalate','antipasti'], weeklyQuota:quota },
    { id:'I2', name:'I2', stations:['pass','secondi'],       weeklyQuota:quota },
  ];
  const uno = n => ({stationId:n, count:1});
  const partite = ['primi','secondi','antipasti','insalate','pass'];
  const needs = { colazione:[], pranzo:partite.map(uno), cena:partite.map(uno) };
  let scoperte = 0;
  for(let i=0;i<120;i++){
    scoperte += computeShifts(staff, needs, {config:BASE}).shortfalls.length;
  }
  assert.ok(scoperte <= 85,
    `${scoperte} scoperture su 120 generazioni: la capienza settimanale non sta seguendo la partita principale`);
});

/* ===================== DOPPIA PARTITA: CHI COPRE ANCHE ALTRO =====================
   «Quando Rakib sta alle insalate lo conto comunque nei due del lavaggio,
   perche' mentre fa le insalate aiuta l'altro al lavaggio.»
   L'impostazione sta sulla STAZIONE (`copreAnche`), non sulla persona: e' un
   fatto della cucina — le insalate stanno accanto al lavaggio — e vale per
   chiunque ci stia, anche per l'ultimo arrivato. Senza `stazioni` fra le
   opzioni non cambia niente, ed e' il caso di tutti i dati gia' salvati. */

const STAZ_RAKIB = [
  {id:'insalate', name:'Insalate', copreAnche:['lavaggio']},
  {id:'lavaggio', name:'Lavaggio'},
];
const BRIGATA_RAKIB = [
  { id:'rakib', name:'Rakib', stations:['insalate'], weeklyQuota:[{count:7,codes:['SP']}] },
  { id:'l1',    name:'L1',    stations:['lavaggio'], weeklyQuota:[{count:7,codes:['SP']}] },
];
const FABBISOGNO_RAKIB = { colazione:[],
  pranzo:[{stationId:'insalate',count:1},{stationId:'lavaggio',count:2}],
  cena:  [{stationId:'insalate',count:1},{stationId:'lavaggio',count:2}] };

test('chi sta alle insalate conta anche nei due del lavaggio', () => {
  // Il lavaggio ne chiede due e in brigata c'e' un solo lavapiatti: senza la
  // mano di Rakib un posto al giorno resta scoperto, a pranzo e a cena.
  const senza = computeShifts(BRIGATA_RAKIB, FABBISOGNO_RAKIB, {config:BASE});
  assert.equal(senza.shortfalls.reduce((n,s)=>n+s.missing, 0), 14,
    'senza la doppia partita devono restare scoperti 14 posti: e il metro del test');

  for(let i=0;i<50;i++){
    const con = computeShifts(BRIGATA_RAKIB, FABBISOGNO_RAKIB, {config:BASE, stazioni:STAZ_RAKIB});
    assert.equal(con.shortfalls.length, 0,
      'Rakib alle insalate doveva contare anche nei due del lavaggio');
    assert.equal(con.extras.length, 0, 'nessuno andava chiamato oltre quota');
  }
});

test('chi da una mano resta segnato sulla SUA stazione, non su quella che aiuta', () => {
  // Nella griglia Rakib sta alle insalate: e' li' che lo si cerca. Segnarlo al
  // lavaggio sarebbe anche un turno su una stazione per cui non e' qualificato.
  const { newShifts } = computeShifts(BRIGATA_RAKIB, FABBISOGNO_RAKIB,
    {config:BASE, stazioni:STAZ_RAKIB});
  assert.equal(noQualificationViolations(BRIGATA_RAKIB, newShifts), null);
  GIORNI7.forEach(d=> assert.equal(newShifts['rakib'][d].stationId, 'insalate',
    `il ${d} Rakib e' stato spostato al lavaggio invece di restare alle insalate`));
});

test('chi da una mano viene coperto PRIMA di chi la riceve', () => {
  // L'ordine e' tutto: se il lavaggio venisse servito per primo si prenderebbe
  // le sue persone dedicate, e la mano dalle insalate arriverebbe a giochi
  // fatti. Qui il lavaggio e' anche la stazione piu' RARA (due qualificati
  // contro tre), quindi la sola rarita' lo manderebbe davanti.
  const staff = [
    { id:'l1', name:'L1', stations:['lavaggio'], weeklyQuota:[{count:7,codes:['P']}] },
    { id:'l2', name:'L2', stations:['lavaggio'], weeklyQuota:[{count:7,codes:['R']}], puoFareExtra:false },
    { id:'r1', name:'R1', stations:['insalate'], weeklyQuota:[{count:7,codes:['P']}] },
    { id:'r2', name:'R2', stations:['insalate'], weeklyQuota:[{count:7,codes:['R']}], puoFareExtra:false },
    { id:'r3', name:'R3', stations:['insalate'], weeklyQuota:[{count:7,codes:['R']}], puoFareExtra:false },
  ];
  const needs = { colazione:[],
    pranzo:[{stationId:'lavaggio',count:2},{stationId:'insalate',count:1}], cena:[] };
  const stazioni = [
    {id:'lavaggio', name:'Lavaggio'},
    {id:'insalate', name:'Insalate', copreAnche:['lavaggio']},
  ];
  const senza = computeShifts(staff, needs, {config:BASE});
  assert.equal(senza.shortfalls.reduce((n,s)=>n+s.missing,0), 7,
    'senza la doppia partita restano scoperti 7 posti: e il metro del test');
  for(let i=0;i<50;i++){
    const { shortfalls } = computeShifts(staff, needs, {config:BASE, stazioni});
    assert.equal(shortfalls.length, 0,
      'il lavaggio si e preso i suoi candidati prima che le insalate potessero aiutarlo');
  }
});

test('la mano si passa lungo tutta la catena, non solo al primo anello', () => {
  // a copre b, b copre c: chi sta su a chiude anche c. Fermarsi al primo salto
  // lascerebbe c scoperta tutti i giorni.
  const staff = [{ id:'r', name:'R', stations:['a'], weeklyQuota:[{count:7,codes:['P']}] }];
  const needs = { colazione:[],
    pranzo:[{stationId:'a',count:1},{stationId:'b',count:1},{stationId:'c',count:1}], cena:[] };
  const stazioni = [
    {id:'a', name:'A', copreAnche:['b']},
    {id:'b', name:'B', copreAnche:['c']},
    {id:'c', name:'C'},
  ];
  assert.equal(computeShifts(staff, needs, {config:BASE}).shortfalls.reduce((n,s)=>n+s.missing,0), 14,
    'senza la doppia partita restano scoperti 14 posti: e il metro del test');
  const { shortfalls } = computeShifts(staff, needs, {config:BASE, stazioni});
  assert.equal(shortfalls.length, 0, 'la catena si e fermata al primo anello');
});

test('due stazioni che si coprono a vicenda non mandano il motore in circolo', () => {
  // Un anello e' un errore di configurazione plausibile ("le insalate coprono
  // il lavaggio" piu' "il lavaggio copre le insalate"): la chiusura transitiva
  // deve fermarsi, non girare all'infinito. Se questo test si pianta invece di
  // fallire, e' comunque rosso.
  const staff = [{ id:'r', name:'R', stations:['a'], weeklyQuota:[{count:7,codes:['P']}] }];
  const needs = { colazione:[],
    pranzo:[{stationId:'a',count:1},{stationId:'b',count:1}], cena:[] };
  const stazioni = [
    {id:'a', name:'A', copreAnche:['b']},
    {id:'b', name:'B', copreAnche:['a']},
  ];
  const { newShifts, shortfalls } = computeShifts(staff, needs, {config:BASE, stazioni});
  assert.equal(Object.keys(newShifts['r']).length, 7);
  assert.equal(shortfalls.length, 0, 'una persona su a chiude anche b, anche con l anello');
});

test('un copreAnche verso una stazione che non e nel fabbisogno non rompe niente', () => {
  const staff = [{ id:'r', name:'R', stations:['a'], weeklyQuota:[{count:7,codes:['P']}] }];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const stazioni = [{id:'a', name:'A', copreAnche:['fantasma','a']}];  // e anche verso se stessa
  const { newShifts, shortfalls } = computeShifts(staff, needs, {config:BASE, stazioni});
  assert.equal(shortfalls.length, 0);
  GIORNI7.forEach(d=> assert.equal(newShifts['r'][d].code, 'P'));
});

test('senza stazioni fra le opzioni il motore si comporta esattamente come prima', () => {
  // La retrocompatibilita' e' il punto: nessuna cucina ha `copreAnche` finche'
  // non lo imposta. Con lo stesso seme i tre casi devono dare lo STESSO
  // prospetto — opzione assente, elenco vuoto, elenco senza nessun copreAnche.
  const dates = monthDates(new Date(2026, 8, 1));
  const stazioniNude = [{id:'a', name:'A'}, {id:'b', name:'B'}];
  const gen = opt => computeShiftsForDates(BRIGATA_SEME, FABBISOGNO_SEME,
    Object.assign({config:BASE, dates, seed:'2026-09-01'}, opt));
  const riferimento = gen({});
  [{}, {stazioni:[]}, {stazioni:stazioniNude}].forEach((opt,i)=>{
    const r = gen(opt);
    assert.deepEqual(r.newShifts, riferimento.newShifts, `variante ${i}: prospetto diverso`);
    assert.deepEqual(r.shortfalls, riferimento.shortfalls, `variante ${i}: scoperture diverse`);
    assert.deepEqual(r.extras, riferimento.extras, `variante ${i}: extra diversi`);
  });
});

test('la doppia partita vale anche generando un mese intero', () => {
  // computeShiftsForDates spezza il periodo in settimane e ricostruisce le
  // opzioni a ogni giro: `stazioni` non deve perdersi per strada.
  const dates = monthDates(new Date(2026, 8, 1));
  const senza = computeShiftsForDates(BRIGATA_RAKIB, FABBISOGNO_RAKIB, {config:BASE, dates});
  assert.equal(senza.shortfalls.reduce((n,s)=>n+s.missing,0), 60,
    'senza la doppia partita restano scoperti 60 posti nel mese: e il metro del test');
  const con = computeShiftsForDates(BRIGATA_RAKIB, FABBISOGNO_RAKIB,
    {config:BASE, dates, stazioni:STAZ_RAKIB});
  assert.equal(con.shortfalls.length, 0,
    'stazioni non e arrivata fino al motore settimana per settimana');
});

/* ===================== I RIPOSI SPALMATI =====================
   «Li divido equamente in tutti i giorni della settimana in modo che ogni
   giorno riposi lo stesso numero di persone o quasi, per non avere giorni in
   cui ho 6 persone di riposo e altri in cui ce ne sta una sola.» E soprattutto:
   «io NON guardo giorno per giorno, prima mi faccio un'idea in testa e poi
   inizio» — quindi il conto si fa PRIMA del primo giorno, non aggiustando
   strada facendo. */

const DAYS7 = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];
function riposiPerGiorno(staff, newShifts){
  return DAYS7.map(d=> staff.filter(s=> newShifts[s.id][d].code === 'R').length);
}
function scartoRiposi(staff, newShifts){
  const r = riposiPerGiorno(staff, newShifts);
  return Math.max(...r) - Math.min(...r);
}

// Brigata di misura: dodici persone su sei partite, quote diverse fra loro (chi
// sei giorni, chi cinque, chi quattro). E' la taglia in cui il difetto si
// vedeva a occhio nudo: senza pianificazione i riposi uscivano con 4,50 di
// scarto medio fra il giorno piu' scarico e il piu' pieno, con punte di 5 —
// cioe' proprio la settimana con sei a casa un giorno e uno solo il giorno dopo.
const Q6 = [{count:6,codes:['P','S','SP']},{count:1,codes:['R']}];
const Q5 = [{count:5,codes:['P','S','SP']},{count:2,codes:['R']}];
const Q4 = [{count:4,codes:['P','S','SP']},{count:3,codes:['R']}];
const BRIGATA12 = [
  {id:'1', name:'1', stations:['primi','secondi'],      weeklyQuota:Q6},
  {id:'2', name:'2', stations:['primi','pass'],         weeklyQuota:Q5},
  {id:'3', name:'3', stations:['secondi','primi'],      weeklyQuota:Q5},
  {id:'4', name:'4', stations:['secondi','pass'],       weeklyQuota:Q4},
  {id:'5', name:'5', stations:['antipasti','insalate'], weeklyQuota:Q6},
  {id:'6', name:'6', stations:['antipasti','primi'],    weeklyQuota:Q5},
  {id:'7', name:'7', stations:['insalate','antipasti'], weeklyQuota:Q5},
  {id:'8', name:'8', stations:['pass','secondi'],       weeklyQuota:Q4},
  {id:'9', name:'9', stations:['lavaggio'],             weeklyQuota:Q6},
  {id:'10',name:'10',stations:['lavaggio','insalate'],  weeklyQuota:Q4},
  {id:'11',name:'11',stations:['primi','antipasti'],    weeklyQuota:Q5},
  {id:'12',name:'12',stations:['pass','insalate'],      weeklyQuota:Q4},
];
const UNO = n => ({stationId:n, count:1});
const PARTITE6 = ['primi','secondi','antipasti','insalate','pass','lavaggio'];
const FABBISOGNO12 = { colazione:[], pranzo:PARTITE6.map(UNO), cena:PARTITE6.map(UNO) };

// La brigata dello chef: otto persone, due partite a testa, cinque turni di
// quota. Serve piu' avanti, dove il conto deve tornare esatto.
const QUOTA5 = [{count:5,codes:['P','S','SP']},{count:2,codes:['R']}];
const BRIGATA8 = [
  { id:'P1', name:'P1', stations:['primi','secondi'],      weeklyQuota:QUOTA5 },
  { id:'P2', name:'P2', stations:['primi','pass'],         weeklyQuota:QUOTA5 },
  { id:'S1', name:'S1', stations:['secondi','primi'],      weeklyQuota:QUOTA5 },
  { id:'S2', name:'S2', stations:['secondi','pass'],       weeklyQuota:QUOTA5 },
  { id:'A1', name:'A1', stations:['antipasti','insalate'], weeklyQuota:QUOTA5 },
  { id:'A2', name:'A2', stations:['antipasti','primi'],    weeklyQuota:QUOTA5 },
  { id:'I1', name:'I1', stations:['insalate','antipasti'], weeklyQuota:QUOTA5 },
  { id:'I2', name:'I2', stations:['pass','secondi'],       weeklyQuota:QUOTA5 },
];
const PARTITE5 = ['primi','secondi','antipasti','insalate','pass'];
const FABBISOGNO8 = { colazione:[], pranzo:PARTITE5.map(UNO), cena:PARTITE5.map(UNO) };

test('i riposi si spalmano sui giorni: mai sei a casa un giorno e uno solo il giorno dopo', () => {
  // Misurato su 200 settimane con gli stessi semi: scarto medio 4,50 e punta 5
  // prima della pianificazione, 2,00 e punta 2 dopo. La soglia sta in mezzo,
  // non a occhio.
  let somma = 0, peggio = 0;
  for(let i=0;i<80;i++){
    const { newShifts } = computeShifts(BRIGATA12, FABBISOGNO12, {config:BASE, seed:'r'+i});
    const x = scartoRiposi(BRIGATA12, newShifts);
    somma += x; if(x > peggio) peggio = x;
  }
  assert.ok(peggio <= 3,
    `${peggio} riposi di scarto fra il giorno piu' pieno e il piu' scarico: non sono spalmati`);
  assert.ok(somma/80 <= 2.6,
    `scarto medio ${(somma/80).toFixed(2)} su 80 settimane: i riposi non sono spalmati`);
});

test('spalmare i riposi non apre buchi: la copertura viene prima della forma', () => {
  // Il piano dei riposi e' un vincolo MORBIDO: se rispettarlo lasciasse una
  // postazione scoperta, si sfora. Il metro e' il comportamento precedente
  // sulla stessa brigata e sugli stessi semi — 99 posti scoperti su 200
  // settimane. Se pianificare costasse copertura questo numero salirebbe;
  // invece scende a 51, perche' i turni smettono di ammucchiarsi nei primi
  // giorni e ne restano per il sabato.
  let scoperti = 0;
  for(let i=0;i<200;i++){
    scoperti += computeShifts(BRIGATA12, FABBISOGNO12, {config:BASE, seed:'s'+i})
      .shortfalls.reduce((n,x)=> n + x.missing, 0);
  }
  assert.ok(scoperti <= 70,
    `${scoperti} posti scoperti su 200 settimane, contro i 99 di prima: il piano dei riposi sta togliendo copertura`);
});

test('spalmare i riposi non chiama nessuno oltre quota', () => {
  // Un piano che pretende piu' gente di quanta ne resta in cassa si paga in
  // turni extra, e un extra e' una spesa vera. La prima versione ne faceva
  // comparire 78 su 300 settimane, tutti all'ultimo giorno e tutti sulla
  // partita con piu' turni allocati: il piano chiedeva due teste dove ne era
  // rimasta una, invece di far fare a quella uno spezzato.
  let extra = 0, peggio = 0;
  for(let i=0;i<120;i++){
    const r = computeShifts(BRIGATA8, FABBISOGNO8, {config:BASE, seed:'m'+i});
    extra += r.extras.length;
    const x = scartoRiposi(BRIGATA8, r.newShifts);
    if(x > peggio) peggio = x;
  }
  assert.equal(extra, 0,
    `${extra} turni oltre quota: il piano dei riposi chiede piu' gente di quanta ce n'e'`);
  assert.ok(peggio <= 1,
    `${peggio} riposi di scarto fra il giorno piu' pieno e il piu' scarico`);
});

/* ===================== GLI SPEZZATI A GIRO =====================
   Difetto vero, visto sul prospetto: a parita' di cinque giorni lavorati una
   persona faceva 52 ore e un'altra 43, perche' gli spezzati da undici ore
   finivano sempre sulle stesse teste mentre alle altre toccavano i turni
   singoli da otto. Il criterio delle ore c'era gia', ma sceglieva la PERSONA
   senza sapere quanto sarebbe durato il TURNO che stava per darle. */

const ORE_DI = c => (BASE.turnoDef[c] || {}).hours || 0;
// Lo scarto che conta e' fra chi ha lavorato lo STESSO numero di giorni: chi
// ne fa quattro invece di cinque ha meno ore per un motivo che non e' questo.
function scartoOreAPariGiorni(staff, newShifts){
  const perGiorni = {};
  staff.forEach(s=>{
    const ore = DAYS7.reduce((n,d)=> n + ORE_DI(newShifts[s.id][d].code), 0);
    const giorni = DAYS7.filter(d=> ORE_DI(newShifts[s.id][d].code) > 0).length;
    (perGiorni[giorni] = perGiorni[giorni] || []).push(ore);
  });
  let x = 0;
  Object.keys(perGiorni).forEach(g=>{
    if(perGiorni[g].length > 1) x = Math.max(x, Math.max(...perGiorni[g]) - Math.min(...perGiorni[g]));
  });
  return x;
}

test('gli spezzati vanno a giro: a parita di giorni lavorati le ore non si sbilanciano', () => {
  // Sei persone a pari quota su due partite, tre di casa alla prima e tre alla
  // seconda. Misurato su 300 settimane a semi fissi: 9,00 ore di scarto medio
  // fra chi ha lavorato gli stessi giorni, 6,00 dopo. La soglia sta in mezzo.
  const staff = Array.from({length:6}, (_,i)=>({
    id:'z'+i, name:'z'+i,
    stations: i<3 ? ['a','b'] : ['b','a'],
    weeklyQuota: [{count:5,codes:['P','S','SP']},{count:2,codes:['R']}],
  }));
  const needs = { colazione:[],
    pranzo:[{stationId:'a',count:2},{stationId:'b',count:1}],
    cena:  [{stationId:'a',count:2},{stationId:'b',count:1}] };
  let somma = 0, peggio = 0;
  for(let i=0;i<200;i++){
    const { newShifts } = computeShifts(staff, needs, {config:BASE, seed:'o'+i});
    const x = scartoOreAPariGiorni(staff, newShifts);
    somma += x; if(x > peggio) peggio = x;
  }
  assert.ok(somma/200 <= 7.5,
    `${(somma/200).toFixed(2)} ore di scarto medio fra chi ha lavorato gli stessi giorni: gli spezzati stanno ancora sulle stesse teste`);
  assert.ok(peggio <= 6, `punta di ${peggio} ore di scarto`);
});

test('il turno lungo a chi ha meno ore non toglie copertura alla brigata grande', () => {
  // Stessa brigata da dodici del piano dei riposi. Il metro e' il comportamento
  // precedente sugli stessi semi: 18,00 ore di scarto medio e 87 posti scoperti
  // su 300 settimane. Dopo: 15,03 e zero scoperti — il criterio delle ore non
  // si paga in copertura, la migliora.
  let somma = 0, scoperti = 0;
  for(let i=0;i<200;i++){
    const r = computeShifts(BRIGATA12, FABBISOGNO12, {config:BASE, seed:'o'+i});
    somma += scartoOreAPariGiorni(BRIGATA12, r.newShifts);
    scoperti += r.shortfalls.reduce((n,x)=> n + x.missing, 0);
  }
  assert.ok(somma/200 <= 16.5,
    `${(somma/200).toFixed(2)} ore di scarto medio, contro le 18,00 di prima`);
  assert.equal(scoperti, 0,
    `${scoperti} posti scoperti: il criterio delle ore sta togliendo copertura`);
});

test('quando la sera la copre solo lo spezzato, il turno corto non passa davanti', () => {
  // Due persone che in quota hanno solo lo spezzato, due che hanno solo il
  // turno di pranzo. La sera nessuno la copre da solo: la copre chi fa lo
  // spezzato, e quel turno va trattato per quello che e' — lungo — anche
  // quando il budget della giornata direbbe di no. Ignorandolo, davanti
  // andavano i due del pranzo, la sera restava comunque a uno spezzato, e si
  // ritrovavano tre persone al lavoro per due posti: quota bruciata un giorno
  // prima e un secondo turno oltre quota la domenica.
  const staff = [
    { id:'L1', name:'L1', stations:['a'], weeklyQuota:[{count:3,codes:['SP']},{count:4,codes:['R']}] },
    { id:'L2', name:'L2', stations:['a'], weeklyQuota:[{count:3,codes:['SP']},{count:4,codes:['R']}] },
    { id:'C1', name:'C1', stations:['a'], weeklyQuota:[{count:6,codes:['P']},{count:1,codes:['R']}] },
    { id:'C2', name:'C2', stations:['a'], weeklyQuota:[{count:6,codes:['P']},{count:1,codes:['R']}] },
  ];
  const needs = { colazione:[],
    pranzo:[{stationId:'a',count:2}], cena:[{stationId:'a',count:1}] };
  for(let i=0;i<60;i++){
    const r = computeShifts(staff, needs, {config:BASE, seed:'e'+i});
    assert.equal(r.shortfalls.length, 0, 'la brigata bastava');
    assert.equal(r.extras.length, 1,
      `${r.extras.length} turni oltre quota invece di 1: la sera ha sprecato un turno di pranzo`);
  }
});

/* ===================== IL CONTO DI CAPIENZA =====================
   «Io NON guardo giorno per giorno, prima mi faccio un'idea in testa e poi
   inizio.» Il conto che lo chef fa prima di cominciare, e che il generatore
   non faceva: quanti posti servono per partita, quanti ne coprono le persone
   che la sanno fare, quanti extra sono quindi inevitabili.
   L'unita' e' il POSTO-SERVIZIO (giorno, servizio, stazione, k-esima persona),
   non la giornata: «due al lavaggio» a pranzo e a cena fanno 28 posti in
   settimana, non 14. */

// La brigata su cui lo chef ha fatto il conto a voce. Yuri sta su DUE partite
// (insalate e lavaggio, in quest'ordine: le insalate sono la sua partita di
// casa) — e' il caso in cui la capienza e' una sola e non si somma su
// entrambe. Diverso da Rakib, che sta solo alle insalate e da' una mano al
// lavaggio senza spendere niente in piu': quello e' `copreAnche`, e si conta
// in un altro modo (test piu' sotto).
const BRIGATA_CONTO = [
  { id:'yuri', name:'Yuri', stations:['insalate','lavaggio'],
    weeklyQuota:[{count:3,codes:['SP']},{count:4,codes:['R']}] },   // 3 spezzati = 6 posti
  { id:'i2',   name:'I2',   stations:['insalate'],
    weeklyQuota:[{count:4,codes:['SP']},{count:3,codes:['R']}] },   // 4 spezzati = 8 posti
  { id:'l1',   name:'L1',   stations:['lavaggio'],
    weeklyQuota:[{count:7,codes:['SP']}] },                          // 7 spezzati = 14 posti
  { id:'l2',   name:'L2',   stations:['lavaggio'],
    weeklyQuota:[{count:6,codes:['SP']},{count:1,codes:['R']}] },   // 6 spezzati = 12 posti
];
// Il lavaggio ne chiede due a pranzo e due a cena: 4 al giorno, 28 in settimana.
// Le insalate uno e uno: 2 al giorno, 14 in settimana. Il lavaggio e' scritto
// per primo apposta — e' la partita MENO rara, e deve essere allocata per
// seconda lo stesso.
const FABBISOGNO_CONTO = { colazione:[],
  pranzo:[{stationId:'lavaggio',count:2},{stationId:'insalate',count:1}],
  cena:  [{stationId:'lavaggio',count:2},{stationId:'insalate',count:1}] };

const partitaDi = (conto, st) => conto.partite.find(p=> p.stationId === st);

test('il conto dello chef sul lavaggio: 28 richiesti, 32 di capienza, 26 disponibili, 2 mancanti', () => {
  const conto = contoCapienza(BRIGATA_CONTO, FABBISOGNO_CONTO, {config:BASE});
  const lav = partitaDi(conto, 'lavaggio');
  assert.equal(lav.domanda, 28,
    'i posti-servizio del lavaggio in settimana sono 28 (2+2 al giorno per 7), non 14 giornate');
  assert.equal(lav.capienza, 32,
    'la capienza lorda del lavaggio e 14+12+6: Yuri ci sta dentro anche se le insalate sono la sua partita di casa');
  assert.equal(lav.spesaAltrove, 6,
    'i 6 posti di Yuri se li prendono le insalate: la sua capienza e una sola e non si somma su entrambe le partite');
  assert.equal(lav.disponibile, 26, '32 meno i 6 spesi alle insalate');
  assert.equal(lav.allocata, 26);
  assert.equal(lav.mancanti, 2, 'restano 2 posti che nessuna quota copre');

  const ins = partitaDi(conto, 'insalate');
  assert.equal(ins.domanda, 14);
  assert.equal(ins.mancanti, 0, 'le insalate si chiudono: 6 di Yuri piu 8 di I2');

  assert.equal(conto.extraStrutturali, 2,
    'due posti mancanti sono due posti di extra strutturale, e si sanno prima di generare');
});

test('i 6 spesi altrove si deducono dal fabbisogno delle insalate, non si ricevono da fuori', () => {
  // Stessa identica brigata, ma alle insalate non serve nessuno: la capienza di
  // Yuri non ha piu' dove andare e torna tutta al lavaggio. Se il -6 fosse un
  // numero passato da fuori questo conto non cambierebbe.
  const soloLavaggio = { colazione:[],
    pranzo:[{stationId:'lavaggio',count:2}], cena:[{stationId:'lavaggio',count:2}] };
  const lav = partitaDi(contoCapienza(BRIGATA_CONTO, soloLavaggio, {config:BASE}), 'lavaggio');
  assert.equal(lav.capienza, 32, 'la capienza lorda e la stessa di prima');
  assert.equal(lav.spesaAltrove, 0, 'senza fabbisogno alle insalate non c e niente di speso altrove');
  assert.equal(lav.disponibile, 32);
  assert.equal(lav.mancanti, 0, 'con i 6 di Yuri i 28 posti si coprono tutti');
});

test('i 2 posti mancanti sono il turno oltre quota che il generatore poi chiama davvero', () => {
  // Il conto e' una previsione, e va verificata contro chi genera. Due posti
  // mancanti su una partita che ha lo spezzato sono UN turno oltre quota: la
  // stessa persona chiude pranzo e cena.
  for(let seed=0; seed<30; seed++){
    const r = computeShifts(BRIGATA_CONTO, FABBISOGNO_CONTO, {config:BASE, seed});
    assert.equal(r.shortfalls.length, 0, 'con un extra la brigata copre tutto');
    assert.equal(r.extras.length, 1,
      `seme ${seed}: ${r.extras.length} turni oltre quota, il conto ne prevedeva 1 (2 posti / 2 servizi)`);
  }
});

test('su due settimane il conto raddoppia: le quote sono settimanali e ripartono', () => {
  // Fatto in un blocco solo, il periodo lungo gonfia la capienza: 32 contro una
  // domanda di 56, e il lavaggio sembrerebbe quasi coperto invece di mancare 4.
  const lunedi = startOfWeek(new Date(2026, 8, 14));
  const dueSettimane = Array.from({length:14}, (_,i)=>{
    const d = new Date(lunedi); d.setDate(lunedi.getDate()+i); return isoDate(d);
  });
  const conto = contoCapienza(BRIGATA_CONTO, FABBISOGNO_CONTO,
    {config:BASE, dates:dueSettimane});
  assert.equal(conto.settimane, 2, 'quattordici giorni sono due settimane di quota, non una');
  const lav = partitaDi(conto, 'lavaggio');
  assert.equal(lav.domanda, 56);
  assert.equal(lav.capienza, 64, 'la capienza si ricarica ogni lunedi: 32 piu 32');
  assert.equal(lav.spesaAltrove, 12);
  assert.equal(lav.mancanti, 4, 'due posti mancanti a settimana fanno quattro, non due');
});

test('la mano di rimbalzo non si spende: si aggiunge, e il conto lo dice come il generatore', () => {
  // Rakib sta alle insalate e conta nei due del lavaggio. Quel turno chiude un
  // posto alle insalate E uno al lavaggio nello stesso momento: contarlo come
  // una spesa direbbe che mancano 14 posti dove il generatore non ne lascia
  // scoperto nessuno. Il metro e' il generatore stesso, sulla stessa brigata.
  const senza = contoCapienza(BRIGATA_RAKIB, FABBISOGNO_RAKIB, {config:BASE});
  assert.equal(partitaDi(senza, 'lavaggio').mancanti, 14,
    'senza la doppia partita il conto deve prevedere i 14 posti che il generatore lascia scoperti');
  assert.equal(senza.extraStrutturali, 14);

  const con = contoCapienza(BRIGATA_RAKIB, FABBISOGNO_RAKIB, {config:BASE, stazioni:STAZ_RAKIB});
  const lav = partitaDi(con, 'lavaggio');
  assert.equal(lav.rimbalzo, 14, 'i 14 posti di Rakib alle insalate valgono anche al lavaggio');
  assert.equal(lav.spesaAltrove, 0, 'la mano di rimbalzo non toglie niente a nessuna tasca');
  assert.equal(con.extraStrutturali, 0,
    'il generatore su questa brigata non lascia niente scoperto: il conto deve dire la stessa cosa');
});

test('la partita piu rara si alloca per prima, anche se nel fabbisogno e scritta per seconda', () => {
  // Il pass lo sa fare solo PA, che pero' ha gli antipasti come partita di casa.
  // Se si allocasse per prima la partita scritta per prima, gli antipasti si
  // prenderebbero tutta la sua settimana e il pass resterebbe scoperto sette
  // volte, pur avendo la persona giusta in brigata.
  const staff = [
    { id:'pa', name:'PA', stations:['antipasti','pass'], weeklyQuota:[{count:7,codes:['P']}] },
    { id:'pb', name:'PB', stations:['antipasti'],        weeklyQuota:[{count:7,codes:['P']}] },
  ];
  const needs = { colazione:[],
    pranzo:[{stationId:'antipasti',count:1},{stationId:'pass',count:1}], cena:[] };
  const conto = contoCapienza(staff, needs, {config:BASE});
  assert.equal(conto.partite[0].stationId, 'pass',
    'il pass ha un solo qualificato in brigata: si conta per primo');
  assert.equal(conto.extraStrutturali, 0,
    'la brigata basta: allocando la partita rara per prima non manca niente');
});

test('dentro la partita si parte da chi ce l ha come principale', () => {
  // B ha il pass come partita di casa e la griglia come seconda. Se la griglia
  // si prendesse lui invece di A — che la griglia ce l'ha come unica partita —
  // al pass resterebbe solo C, che ha tre giorni di quota su sette richiesti.
  const staff = [
    { id:'b', name:'B', stations:['pass','griglia'], weeklyQuota:[{count:7,codes:['P']}] },
    { id:'a', name:'A', stations:['griglia'],        weeklyQuota:[{count:7,codes:['P']}] },
    { id:'c', name:'C', stations:['pass'],
      weeklyQuota:[{count:3,codes:['P']},{count:4,codes:['R']}] },
  ];
  const needs = { colazione:[],
    pranzo:[{stationId:'griglia',count:1},{stationId:'pass',count:1}], cena:[] };
  const conto = contoCapienza(staff, needs, {config:BASE});
  assert.equal(partitaDi(conto, 'pass').mancanti, 0,
    'la griglia ha preso B invece di A, e al pass sono rimasti solo i tre giorni di C');
  assert.equal(conto.extraStrutturali, 0);
});

test('dati vecchi: senza opzioni e senza campi nuovi il conto si fa lo stesso', () => {
  // Retrocompatibilita': una brigata salvata prima che esistessero `stazioni`,
  // `copreAnche` e l'ordine delle partite. Nessuna opzione, nessuna data: sette
  // giorni e una settimana, come ha sempre fatto il generatore.
  const vecchi = [
    { id:'p1', name:'Marco', stations:['st1'], weeklyQuota:[{count:5, codes:['P']}] },
    { id:'p2', name:'Luca',  stations:['st1','st2'], weeklyQuota:[{count:5, codes:['P']}] },
  ];
  const needs = { colazione:[], pranzo:[{stationId:'st1',count:1},{stationId:'st2',count:1}], cena:[] };
  const conto = contoCapienza(vecchi, needs);
  assert.equal(conto.giorni, 7);
  assert.equal(conto.settimane, 1);
  assert.equal(partitaDi(conto, 'st2').domanda, 7);
  assert.equal(partitaDi(conto, 'st2').capienza, 5, 'cinque turni di pranzo sono cinque posti');
  // Dieci posti di capienza contro quattordici richiesti: ne mancano quattro, e
  // sono gli stessi che il generatore deve tappare oltre quota.
  assert.equal(conto.extraStrutturali, 4);
});

test('nel conto, chi da una mano si alloca prima di chi la riceve', () => {
  // Stessa brigata del test sul generatore: il lavaggio e' anche la partita
  // piu' RARA (due qualificati contro tre), quindi la sola rarita' lo
  // manderebbe davanti — e la mano dalle insalate arriverebbe a giochi fatti,
  // cioe' non varrebbe niente. Il conto direbbe sette posti mancanti dove il
  // generatore non ne lascia scoperto nessuno.
  const staff = [
    { id:'l1', name:'L1', stations:['lavaggio'], weeklyQuota:[{count:7,codes:['P']}] },
    { id:'l2', name:'L2', stations:['lavaggio'], weeklyQuota:[{count:7,codes:['R']}], puoFareExtra:false },
    { id:'r1', name:'R1', stations:['insalate'], weeklyQuota:[{count:7,codes:['P']}] },
    { id:'r2', name:'R2', stations:['insalate'], weeklyQuota:[{count:7,codes:['R']}], puoFareExtra:false },
    { id:'r3', name:'R3', stations:['insalate'], weeklyQuota:[{count:7,codes:['R']}], puoFareExtra:false },
  ];
  const needs = { colazione:[],
    pranzo:[{stationId:'lavaggio',count:2},{stationId:'insalate',count:1}], cena:[] };
  const stazioni = [
    {id:'lavaggio', name:'Lavaggio'},
    {id:'insalate', name:'Insalate', copreAnche:['lavaggio']},
  ];
  const conto = contoCapienza(staff, needs, {config:BASE, stazioni});
  assert.equal(conto.partite[0].stationId, 'insalate',
    'le insalate danno la mano: vanno contate prima del lavaggio che la riceve');
  assert.equal(partitaDi(conto, 'lavaggio').rimbalzo, 7);
  assert.equal(conto.extraStrutturali, 0,
    'il generatore su questa brigata copre tutto: il conto deve dire la stessa cosa');
});

// ============================================================================
// LE ORE DI CONTRATTO CHE AVANZANO.
// «Se avanzano ore di contratto a qualcuno, le deve assegnare in automatico
// quando pensa che ne servano di piu'.» Lo chef quelle ore le paga comunque:
// meglio averle in cucina la sera forte che a casa. Ma la copertura esatta
// resta l'invariante — si colloca DOPO, e solo con la quota che avanza.
// ============================================================================

// Brigata di misura: otto persone, cinque partite, due a testa, quaranta ore a
// testa e cinque turni da otto in quota. Il fabbisogno ne chiede 35 in
// settimana e la brigata ne ha 40: cinque avanzano, ed e' esattamente il caso
// di cui parla lo chef.
const BRIGATA_ORE = [
  {id:'a1', name:'Anna',  hours:40, stations:['primi','pass'],         weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}]},
  {id:'a2', name:'Bruno', hours:40, stations:['primi','secondi'],      weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}]},
  {id:'b1', name:'Carla', hours:40, stations:['secondi','primi'],      weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}]},
  {id:'b2', name:'Dario', hours:40, stations:['secondi','pass'],       weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}]},
  {id:'c1', name:'Elena', hours:40, stations:['antipasti','insalate'], weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}]},
  {id:'c2', name:'Fabio', hours:40, stations:['antipasti','insalate'], weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}]},
  {id:'d1', name:'Gina',  hours:40, stations:['insalate','antipasti'], weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}]},
  {id:'d2', name:'Hamid', hours:40, stations:['pass','primi'],         weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}]},
];
const NEEDS_ORE = { colazione:[], cena:[], pranzo:[
  {stationId:'primi',count:1},{stationId:'secondi',count:1},{stationId:'antipasti',count:1},
  {stationId:'insalate',count:1},{stationId:'pass',count:1}] };

// Ore pianificate in settimana, come le conta la tabella della griglia.
function orePianificate(staff, newShifts, giorni){
  const out = {};
  staff.forEach(s=>{
    out[s.id] = giorni.reduce((n,d)=>
      n + ((BASE.turnoDef[(newShifts[s.id][d]||{}).code] || {}).hours || 0), 0);
  });
  return out;
}
// Sovracopertura contata SOLO sui turni di copertura: e' il numero che dimostra
// la copertura esatta, e se ci finissero dentro anche le eccedenze tornerebbe
// sporco e nessuno saprebbe piu' leggere una regressione vera.
function sovracoperturaDiCopertura(staff, needs, newShifts, giorni){
  let n = 0;
  for(const d of giorni){
    for(const sv of BASE.serviceIds){
      for(const nd of (needs[sv]||[])){
        let presenti = 0;
        for(const s of staff){
          const c = newShifts[s.id][d] || {};
          if(c.stationId !== nd.stationId) continue;
          if((c.origine || (c.extra ? 'extra' : 'copertura')) !== 'copertura') continue;
          if(!(BASE.codeToServices[c.code]||[]).includes(sv)) continue;
          presenti++;
        }
        n += Math.max(0, presenti - nd.count);
      }
    }
  }
  return n;
}

test('senza l impostazione le ore avanzate restano in tasca, esattamente come prima', () => {
  // Retrocompatibilita' numero uno: chi ha gia' i turni salvati e pubblicati non
  // deve vedere cambiare niente. Con l'opzione assente non gira una riga della
  // collocazione, e 'lascia' e' l'assenza scritta per esteso.
  const senza = computeShifts(BRIGATA_ORE, NEEDS_ORE, {config:BASE, seed:'x1'});
  const lascia = computeShifts(BRIGATA_ORE, NEEDS_ORE,
    {config:BASE, seed:'x1', eccedenza:{modo:'lascia', giorni:['Sab']}});
  assert.deepEqual(lascia.newShifts, senza.newShifts, 'con "lascia" il prospetto deve restare identico');
  assert.deepEqual(lascia.extras, senza.extras);
  assert.deepEqual(lascia.shortfalls, senza.shortfalls);
  assert.equal(senza.eccedenzeCollocate.length, 0);
  assert.equal(lascia.eccedenzeCollocate.length, 0);
  assert.equal(senza.quotaNonSpesa.reduce((n,q)=>n+q.turni,0), 5,
    'cinque turni di quota avanzano, e restano dichiarati come prima');
});

test('le ore gia pagate finiscono in cucina invece che a casa, e la copertura non si muove', () => {
  const senza = computeShifts(BRIGATA_ORE, NEEDS_ORE, {config:BASE, seed:'x2'});
  const con = computeShifts(BRIGATA_ORE, NEEDS_ORE,
    {config:BASE, seed:'x2', eccedenza:{modo:'auto'}});
  // 1. La copertura non peggiora di un posto: e' l'invariante che viene prima.
  assert.deepEqual(con.shortfalls, senza.shortfalls, 'la collocazione non deve aprire buchi');
  assert.deepEqual(con.extras, senza.extras, 'la collocazione non deve chiamare nessuno oltre quota');
  assert.equal(sovracoperturaDiCopertura(BRIGATA_ORE, NEEDS_ORE, senza.newShifts, DAYS), 0);
  assert.equal(sovracoperturaDiCopertura(BRIGATA_ORE, NEEDS_ORE, con.newShifts, DAYS), 0,
    'la sovracopertura di sola copertura deve restare zero: e il numero che dimostra il lavoro fatto prima');
  // 2. Le cinque ore avanzate sono state collocate.
  assert.equal(con.eccedenzeCollocate.length, 5, 'i cinque turni avanzati vanno collocati');
  assert.equal(con.quotaNonSpesa.length, 0, 'e allora in tasca non resta piu niente');
  // 3. Le ore lavorate salgono, ma la colonna "Extra" della tabella ore NO.
  const oreSenza = orePianificate(BRIGATA_ORE, senza.newShifts, DAYS);
  const oreCon   = orePianificate(BRIGATA_ORE, con.newShifts, DAYS);
  let sottoSenza = 0, sottoCon = 0;
  for(const s of BRIGATA_ORE){
    assert.ok(oreCon[s.id] <= s.hours + 1e-9,
      s.name+': '+oreCon[s.id]+'h pianificate contro '+s.hours+'h contrattuali — l eccedenza e diventata un extra travestito');
    sottoSenza += Math.max(0, s.hours - oreSenza[s.id]);
    sottoCon   += Math.max(0, s.hours - oreCon[s.id]);
  }
  assert.equal(sottoSenza, 40, 'cinque turni da otto ore non lavorati');
  assert.equal(sottoCon, 0, 'e la colonna "sotto le contrattuali" e proprio quella che deve scendere');
});

test('una eccedenza non e un turno extra, e la differenza sta nei dati', () => {
  // La distinzione che costa soldi veri se si sbaglia. Un solo campo a valori
  // esclusivi, non due booleani che permettono lo stato impossibile.
  const r = computeShifts(BRIGATA_ORE, NEEDS_ORE, {config:BASE, seed:'x3', eccedenza:{modo:'auto'}});
  let collocate = 0;
  for(const s of BRIGATA_ORE){
    for(const d of DAYS){
      const c = r.newShifts[s.id][d];
      assert.ok(['copertura','extra','eccedenza'].includes(c.origine), 'origine sempre valorizzata');
      assert.equal(c.extra, c.origine === 'extra', 'extra deve restare il campo derivato da origine');
      if(c.origine === 'eccedenza'){
        collocate++;
        assert.equal(c.extra, false, 'una eccedenza non e mai un extra: e gia pagata');
        assert.ok(c.stationId, 'un turno senza stazione non copre niente e non va collocato');
        assert.equal(r.extras.some(e=> e.staffId===s.id && e.day===d), false,
          'e non deve comparire nel conteggio degli extra');
      }
    }
  }
  assert.equal(collocate, r.eccedenzeCollocate.length, 'le celle collocate e la lista devono dire lo stesso numero');
});

test('il tetto delle ore contrattuali: quaranta ore restano quaranta', () => {
  // Sette slot da undici ore su un contratto da quaranta sono un extra
  // travestito. La quota e' in NUMERO DI TURNI, il contratto e' in ORE: senza
  // il secondo tetto la collocazione le sfonda senza accorgersene.
  const staff = [1,2,3].map(i=>
    ({id:'u'+i, name:'U'+i, hours:40, stations:['a'], weeklyQuota:[{count:7,codes:['SP']}]}));
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[{stationId:'a',count:1}] };
  const r = computeShifts(staff, needs, {config:BASE, seed:'x4', eccedenza:{modo:'auto'}});
  const ore = orePianificate(staff, r.newShifts, DAYS);
  for(const s of staff){
    assert.ok(ore[s.id] <= 40 + 1e-9, s.name+' arriva a '+ore[s.id]+'h contro 40h di contratto');
  }
  assert.ok(r.quotaNonSpesa.length > 0, 'la quota che non ci sta nelle ore resta in tasca');
  assert.ok(r.quotaNonSpesa.every(q=> q.motivo === 'ore contrattuali raggiunte'),
    'e il riepilogo deve dire perche, non lasciarlo indovinare');
  // La controprova: e' il tetto a fermarla, non la mancanza di quota. Tolto il
  // tetto la stessa brigata sfonda le quaranta ore, ed e' esattamente la cosa
  // che si sta impedendo.
  const senzaTetto = computeShifts(staff, needs, {config:BASE, seed:'x4',
    eccedenza:{modo:'auto', rispettaOreContrattuali:false}});
  const oreLibere = orePianificate(staff, senzaTetto.newShifts, DAYS);
  assert.ok(staff.some(s=> oreLibere[s.id] > 40),
    'senza tetto la quota in turni sfonda il contratto in ore: e la ragione per cui il tetto esiste');
});

test('ferie e riposi concordati non si spostano, nemmeno per ore gia pagate', () => {
  // LA REGOLA MADRE: la scelta del titolare e' una preferenza, una richiesta
  // approvata e' un vincolo. La preferenza si degrada, il vincolo mai.
  const staff = [
    {id:'v1', name:'Vito',  hours:40, stations:['a'], weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}]},
    {id:'v2', name:'Zaira', hours:40, stations:['a'], weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}]},
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const ferie = { v1:{} };
  DAYS.forEach(d=>{ ferie.v1[d] = {blocked:'F'}; });
  const r = computeShifts(staff, needs, {config:BASE, seed:'x5',
    constraints:ferie, eccedenza:{modo:'giorni', giorni:['Sab','Ven']}});
  DAYS.forEach(d=> assert.equal(r.newShifts['v1'][d].code, 'F',
    'una settimana di ferie resta una settimana di ferie'));
  assert.equal(r.eccedenzeCollocate.some(e=> e.staffId==='v1'), false,
    'a chi e in ferie non si colloca niente, nemmeno un turno gia pagato');
  const suo = r.quotaNonSpesa.find(q=> q.staffId==='v1');
  assert.ok(suo && suo.turni > 0, 'la sua quota resta in tasca');
  assert.equal(suo.motivo, 'nessun giorno ammissibile', 'e il riepilogo lo dice per nome e con il motivo');
});

test('un riposo CONCORDATO il giorno scelto non si tocca: la lista e una preferenza, la richiesta approvata no', () => {
  // Il caso che la ferie NON prova. Una cella di ferie si scrive 'F' e non
  // somiglia a un riposo; un riposo APPROVATO si scrive 'R', identico a quello
  // che mette il motore. Se la collocazione guardasse solo la lettera nella
  // cella se lo prenderebbe — ed e' il riposo che la persona si e' fatta
  // approvare. Il sabato qui e' anche il giorno in cima alla lista del
  // titolare, cioe' il posto dove la collocazione vuole andare per prima.
  const staff = [
    {id:'v1', name:'Vito',  stations:['a'], weeklyQuota:[{count:4,codes:['P']},{count:3,codes:['R']}]},
    {id:'v2', name:'Zaira', stations:['a'], weeklyQuota:[{count:4,codes:['P']},{count:3,codes:['R']}]},
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const constraints = { v1:{ Sab:{blocked:'R'} }, v2:{ Sab:{blocked:'R'} } };
  const r = computeShifts(staff, needs, {config:BASE, seed:'x6',
    constraints, eccedenza:{modo:'giorni', giorni:['Sab','Mer']}});
  assert.equal(r.newShifts['v1']['Sab'].code, 'R');
  assert.equal(r.newShifts['v2']['Sab'].code, 'R');
  assert.equal(r.eccedenzeCollocate.some(e=> e.day === 'Sab'), false,
    'il sabato erano tutti a riposo concordato: li nessuna ora si colloca, nemmeno se gia pagata');
  assert.ok(r.eccedenzeCollocate.length > 0, 'ma la quota avanzata va collocata lo stesso, altrove');
});

test('una partita che quel servizio non lo chiede non riceve nessuna ora collocata', () => {
  // Una persona ha due partite, ma della seconda il fabbisogno non chiede
  // nessuno. Collocarcela sarebbe di nuovo il TURNO FINTO: conta nelle ore, fa
  // scattare i falsi sforamenti e non copre niente. Ed e' anche la partita che
  // vincerebbe il confronto, perche' li non c'e' nessuno e sembra la piu
  // scoperta di tutte.
  const staff = [
    {id:'n1', name:'N1', stations:['a'],             weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}]},
    {id:'n2', name:'N2', stations:['a','magazzino'], weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}]},
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const r = computeShifts(staff, needs, {config:BASE, seed:'xd', eccedenza:{modo:'auto'}});
  assert.ok(r.eccedenzeCollocate.length > 0, 'la quota avanzata va collocata');
  assert.ok(r.eccedenzeCollocate.every(e=> e.stationId === 'a'),
    'il magazzino non e nel fabbisogno: un turno li non copre niente');
  DAYS.forEach(d=> assert.notEqual(r.newShifts['n2'][d].stationId, 'magazzino'));
});

test('il freno per giornata: cinque eccedenze e un giorno solo non fanno cinque persone in piu il sabato', () => {
  // Senza il freno, «sui giorni che scelgo io» e' un generatore di
  // sovracopertura con l'etichetta buona.
  const staff = [1,2,3,4,5].map(i=>
    ({id:'q'+i, name:'Q'+i, stations:['a'], weeklyQuota:[{count:7,codes:['P']}]}));
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const presenzeAlGiorno = (r) => DAYS.map(d=>
    staff.filter(s=> r.newShifts[s.id][d].stationId === 'a').length);
  const uno = computeShifts(staff, needs, {config:BASE, seed:'x7',
    eccedenza:{modo:'giorni', giorni:['Sab']}});
  assert.deepEqual(presenzeAlGiorno(uno), [2,2,2,2,2,2,2],
    'una persona richiesta piu una collocata: il freno di default e uno per stazione e servizio');
  assert.equal(uno.eccedenzeCollocate.length, 7);
  // Alzando il freno il titolare ottiene quello che ha chiesto, ma dichiarandolo.
  const tre = computeShifts(staff, needs, {config:BASE, seed:'x7',
    eccedenza:{modo:'giorni', giorni:['Sab'], maxPerGiornoPerStazione:3}});
  assert.equal(presenzeAlGiorno(tre)[5], 4, 'il sabato: uno richiesto piu tre collocati');
  assert.equal(tre.eccedenzeCollocate.length, 21);
});

test('stesso seme, stesse eccedenze: due generazioni si possono confrontare', () => {
  const opts = {config:BASE, seed:'stessoseme', eccedenza:{modo:'auto'}};
  const a = computeShifts(BRIGATA_ORE, NEEDS_ORE, opts);
  const b = computeShifts(BRIGATA_ORE, NEEDS_ORE, opts);
  assert.deepEqual(a.newShifts, b.newShifts, 'stesso seme, prospetto diverso: la collocazione usa ancora il caso');
  assert.deepEqual(a.eccedenzeCollocate, b.eccedenzeCollocate);
});

test('i giorni si scelgono per nome anche quando il periodo e fatto di date vere', () => {
  // In produzione `days` sono date ISO, nei test sono nomi. Senza la
  // conversione tollerante la funzione passa i test e non fa niente in
  // produzione, che e il modo peggiore di sbagliare.
  const staff = [1,2,3,4,5,6].map(i=>
    ({id:'w'+i, name:'W'+i, stations:['a'], weeklyQuota:[{count:2,codes:['P']},{count:5,codes:['R']}]}));
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const dates = weekDates(new Date(2026,8,16));
  const r = computeShiftsForDates(staff, needs, {config:BASE, dates, seed:'x8',
    eccedenza:{modo:'giorni', giorni:['Sab'], maxPerGiornoPerStazione:9}});
  const sabato = dates.find(d=> dayName(d) === 'Sab');
  assert.ok(r.eccedenzeCollocate.filter(e=> e.day === sabato).length >= 3,
    'il titolare ha scritto "Sab": con le date vere deve valere lo stesso');
  r.eccedenzeCollocate.forEach(e=>{
    if(e.day === sabato) return;
    const cella = r.newShifts[e.staffId][sabato];
    assert.ok(cella.code && cella.code !== 'R',
      'un giorno diverso dal sabato si ammette solo a chi il sabato stava gia lavorando');
  });
});

test('un giorno scelto fuori dal periodo non blocca la collocazione: si degrada al criterio automatico', () => {
  // Si genera lunedi-mercoledi e la lista dice "Sab". La lista e' un ORDINE, non
  // un obbligo: i giorni fuori lista stanno in coda, non sono vietati.
  const staff = [
    {id:'y1', name:'Y1', stations:['a'], weeklyQuota:[{count:3,codes:['P']}]},
    {id:'y2', name:'Y2', stations:['a'], weeklyQuota:[{count:3,codes:['P']}]},
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const giorni = ['Lun','Mar','Mer'];
  const r = computeShifts(staff, needs, {config:BASE, days:giorni, seed:'x9',
    eccedenza:{modo:'giorni', giorni:['Sab']}});
  assert.equal(r.eccedenzeCollocate.length, 3,
    'tre giorni, due persone, tre turni di copertura e tre avanzati: vanno collocati lo stesso');
  assert.ok(r.eccedenzeCollocate.every(e=> giorni.includes(e.day)));
});

test('senza ore contrattuali si colloca lo stesso, ma il riepilogo dichiara il controllo mancato', () => {
  // Il campo `hours` e' facoltativo in brigata e resta spesso vuoto. Sparisce il
  // secondo tetto e resta solo il pool: va detto, o un part-time con quote
  // generose diventa un extra travestito e nessuno se ne accorge.
  const staff = [
    {id:'z1', name:'Z1', stations:['a'], weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}]},
    {id:'z2', name:'Z2', stations:['a'], weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}]},
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const r = computeShifts(staff, needs, {config:BASE, seed:'xa', eccedenza:{modo:'auto'}});
  assert.ok(r.eccedenzeCollocate.length > 0);
  assert.ok(r.eccedenzeCollocate.every(e=> e.oreNonVerificate === true),
    'senza ore contrattuali il controllo sulle ore non si e potuto fare, e va scritto');
});

test('a chi non ha stazioni non si collocano ore: sarebbe di nuovo il turno finto', () => {
  const staff = [
    {id:'k1', name:'K1', hours:40, stations:['a'], weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}]},
    {id:'k2', name:'K2', hours:40, stations:[],    weeklyQuota:[{count:5,codes:['P']},{count:2,codes:['R']}]},
  ];
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const r = computeShifts(staff, needs, {config:BASE, seed:'xb', eccedenza:{modo:'auto'}});
  DAYS.forEach(d=> assert.equal(r.newShifts['k2'][d].code, 'R',
    'un turno senza stazione conta nelle ore e non copre niente: resta fuori'));
  assert.equal(r.eccedenzeCollocate.some(e=> e.staffId==='k2'), false);
});

test('su un mese le eccedenze si sommano fra le settimane, non si ricalcolano', () => {
  const staff = [1,2,3].map(i=>
    ({id:'m'+i, name:'M'+i, stations:['a'], weeklyQuota:[{count:4,codes:['P']},{count:3,codes:['R']}]}));
  const needs = { colazione:[], pranzo:[{stationId:'a',count:1}], cena:[] };
  const dates = monthDates(new Date(2026,8,1));
  const mese = computeShiftsForDates(staff, needs, {config:BASE, dates, seed:'xc',
    eccedenza:{modo:'auto'}});
  const settimane = groupByWeek(dates).length;
  assert.ok(mese.eccedenzeCollocate.length >= settimane,
    'ogni settimana riparte con le quote piene e ha la sua eccedenza');
  const giorniCollocati = new Set(mese.eccedenzeCollocate.map(e=> e.day));
  assert.equal(giorniCollocati.size, mese.eccedenzeCollocate.length,
    'due collocazioni sullo stesso giorno vorrebbero dire che una settimana ha riscritto l altra');
});

/* ===================== UNA STAZIONE PER SERVIZIO =====================
   «Potrebbe essere che la stessa persona stia a pranzo in una partita e a cena
   in un'altra.» La cella passa da una stazione per GIORNATA a una per SERVIZIO,
   e `stationId` resta scritto come campo derivato.

   Il primo blocco e' quello che conta piu' di tutti: lo chef ha turni veri gia'
   salvati e PUBBLICATI nella forma vecchia, e perderli sarebbe il danno
   peggiore che questo lavoro possa fare. */

// Una cucina come la trovava la versione precedente: la cella e'
// { code, stationId, extra } e basta. Scritta a mano apposta: una fixture
// generata dal codice nuovo proverebbe il codice nuovo con se stesso.
const TURNI_VECCHI = () => ({
  'p1': {
    '2026-09-14': {code:'SP', stationId:'primi',  extra:false},
    '2026-09-15': {code:'P',  stationId:'primi',  extra:false},
    '2026-09-16': {code:'R',  stationId:null,     extra:false},
    '2026-09-17': {code:'S',  stationId:'pass',   extra:true},
  },
  'p2': {
    '2026-09-14': {code:'C',  stationId:'colaz',  extra:false},
    '2026-09-15': {code:'F',  stationId:null,     extra:false},
    '2026-09-16': {code:'SP', stationId:'pass',   extra:false},
  },
});
// Il blocco che gira dentro migrateData(): normalizzazione IN LETTURA, la
// stessa strada che il progetto ha gia' percorso quattro volte in quel file.
function migraTurni(shifts, cfg){
  Object.keys(shifts).forEach(staffId=>
    Object.keys(shifts[staffId]).forEach(day=>
      normalizzaCella(shifts[staffId][day], cfg)));
  return shifts;
}

test('turni gia salvati e PUBBLICATI nella forma vecchia continuano a dire quello che dicevano', () => {
  const prima = TURNI_VECCHI();
  const dopo = migraTurni(TURNI_VECCHI(), BASE);
  Object.keys(prima).forEach(id=> Object.keys(prima[id]).forEach(day=>{
    const v = prima[id][day], n = dopo[id][day];
    assert.equal(n.code, v.code, 'il codice non si tocca');
    assert.equal(n.extra, v.extra, 'e nemmeno il campo extra');
    // Ogni servizio che quel turno copriva sta ancora sulla stessa stazione.
    (BASE.codeToServices[v.code] || []).forEach(sv=>
      assert.equal(stazioneDi(n, sv), v.stationId,
        id + ' ' + day + ': il servizio ' + sv + ' ha perso la stazione'));
    // E `stationId` resta scritto: e' un contratto verso il passato — le
    // cucine su una versione diversa e le schede gia' aperte lo leggono ancora.
    assert.equal(n.stationId, v.stationId);
  }));
});

test('una cella riscritta da un client VECCHIO resta leggibile: si ricade su stationId', () => {
  // E' l'unica perdita possibile, e va detta invece che nascosta: una versione
  // vecchia dell'app che salva DOPO la migrazione riscrive la cella intera e la
  // mappa sparisce. La giornata torna a una stazione sola — non diventa muta.
  const cella = {code:'SP', stations:{pranzo:'primi', cena:'pass'}, stationId:'primi', extra:false};
  assert.deepEqual(stazioniDi(cella, BASE), ['primi','pass']);
  delete cella.stations;                       // il client vecchio ha riscritto
  assert.equal(stazioneDi(cella, 'pranzo'), 'primi');
  assert.equal(stazioneDi(cella, 'cena'), 'primi', 'ricade sulla stazione sola, non su "nessuna"');
  assert.deepEqual(stazioniDi(cella, BASE), ['primi']);
});

test('la migrazione rispetta i SERVIZI PERSONALIZZATI, non i tre classici', () => {
  // E' il caso che si rompe se il blocco di migrazione finisce prima che la
  // configurazione della cucina sia pronta, e non si vedrebbe mai sulla
  // configurazione predefinita: le stazioni sparirebbero in silenzio dalla
  // griglia di chi si e' scritto i propri servizi.
  const vecchi = { 'b1': { '2026-09-14': {code:'AC', stationId:'bar', extra:false} } };
  migraTurni(vecchi, LOCALE);
  assert.deepEqual(vecchi['b1']['2026-09-14'].stations, {aperitivo:'bar', cena:'bar'});
  // Con la configurazione sbagliata (quella predefinita) 'AC' non esiste, e il
  // dato NON si butta via: la mappa resta vuota e stationId non si tocca.
  const sbagliata = { 'b1': { '2026-09-14': {code:'AC', stationId:'bar', extra:false} } };
  migraTurni(sbagliata, BASE);
  assert.deepEqual(sbagliata['b1']['2026-09-14'].stations, {});
  assert.equal(sbagliata['b1']['2026-09-14'].stationId, 'bar',
    'un codice sconosciuto non e una buona ragione per buttare via la stazione');
});

test('«nessuna» su un servizio non torna da sola al valore appena cancellato', () => {
  // Il dettaglio che sembra stile e non lo e': con un `||` al posto di
  // `!== undefined`, una stazione tolta a mano ricadrebbe sul vecchio stationId
  // e la cella tornerebbe da sola al valore appena cancellato.
  const cella = normalizzaCella({code:'SP', stationId:'primi'}, BASE);
  assegnaStazione(cella, 'cena', null, BASE);
  assert.equal(stazioneDi(cella, 'pranzo'), 'primi');
  assert.equal(stazioneDi(cella, 'cena'), null, 'tolta vuol dire tolta');
  assert.equal(cella.stationId, 'primi');
});

test('stationId e DERIVATO: lo riscrive un solo punto, e non diverge mai dalla mappa', () => {
  const cella = normalizzaCella({code:'SP', stationId:'primi'}, BASE);
  assegnaStazione(cella, 'cena', 'pass', BASE);
  assert.deepEqual(cella.stations, {pranzo:'primi', cena:'pass'});
  assert.equal(cella.stationId, 'primi', 'la stazione del primo servizio coperto');
  // Tolta la prima, il derivato scende alla seconda invece di dire "nessuna":
  // un client vecchio merita la partita che la persona fa davvero.
  assegnaStazione(cella, 'pranzo', null, BASE);
  assert.equal(cella.stationId, 'pass');
});

test('la mappa ha una chiave per servizio coperto: le orfane spariscono, i nuovi entrano', () => {
  // Cambiando il turno cambia cosa copre. Passando da P a SP il pranzo gia'
  // deciso non si ridecide, e la cena eredita.
  const cella = normalizzaCella({code:'P', stationId:'primi'}, BASE);
  assert.deepEqual(cella.stations, {pranzo:'primi'});
  cella.code = 'SP';
  normalizzaCella(cella, BASE);
  assert.deepEqual(cella.stations, {pranzo:'primi', cena:'primi'});
  // E tornando indietro la chiave orfana se ne va.
  cella.code = 'P';
  normalizzaCella(cella, BASE);
  assert.deepEqual(cella.stations, {pranzo:'primi'});
  // Un codice che non copre servizi non puo' portarsi dietro una stazione.
  cella.code = 'R';
  normalizzaCella(cella, BASE);
  assert.deepEqual(cella.stations, {});
  assert.equal(cella.stationId, null);
});

test('il prospetto generato rispetta i due invarianti sulla mappa, su ogni scenario', () => {
  const casi = [
    {staff: BRIGATA_ORE, needs: NEEDS_ORE, cfg: BASE, opz:{}},
    {staff: BRIGATA_ORE, needs: NEEDS_ORE, cfg: BASE, opz:{eccedenza:{modo:'auto'}}},
    {staff: BRIGATA_RAKIB, needs: FABBISOGNO_RAKIB, cfg: BASE, opz:{stazioni: STAZ_RAKIB}},
    {staff: [{id:'s1', name:'Barman', stations:['bar'], weeklyQuota:[{count:7,codes:['AC']}]}],
     needs: {brunch:[], aperitivo:[{stationId:'bar',count:1}], cena:[{stationId:'bar',count:1}]},
     cfg: LOCALE, opz:{}},
  ];
  casi.forEach((c,i)=>{
    for(const seme of ['q1','q2','q3']){
      const {newShifts} = computeShifts(c.staff, c.needs,
        Object.assign({config:c.cfg, seed:seme}, c.opz));
      assert.equal(noQualificationViolations(c.staff, newShifts, c.cfg), null, 'caso '+i);
      assert.equal(noStationKeyViolations(c.staff, newShifts, c.cfg), null, 'caso '+i);
    }
  });
});

/* --- «A pranzo in una partita, a cena in un'altra» ----------------------- */

test('a pranzo ai primi, a cena al pass: la seconda meta del turno va dove serve', () => {
  // Due ai primi a pranzo; a cena serve un primi e un pass. Chi sa fare anche
  // il pass, la sera, ai primi non serve piu': serve al pass. Prima la stazione
  // era una sola per giornata e quella meta' di turno non copriva niente.
  // MISURATO su cinque semi: 35 posti scoperti prima, 0 adesso.
  const staff = [
    {id:'A', name:'A', stations:['primi'],        weeklyQuota:[{count:7,codes:['SP']}]},
    {id:'B', name:'B', stations:['primi','pass'], weeklyQuota:[{count:7,codes:['SP']}]},
  ];
  const needs = { colazione:[],
    pranzo:[{stationId:'primi',count:2}],
    cena:  [{stationId:'primi',count:1},{stationId:'pass',count:1}] };
  for(const seme of ['a','b','c','d','e']){
    const {newShifts, shortfalls, extras} = computeShifts(staff, needs, {config:BASE, seed:seme});
    assert.equal(shortfalls.reduce((n,s)=>n+s.missing,0), 0, 'seme '+seme);
    assert.equal(extras.length, 0, 'e senza chiamare nessuno oltre quota');
    DAYS.forEach(d=>{
      const c = newShifts['B'][d];
      assert.equal(stazioneDi(c, 'pranzo'), 'primi');
      assert.equal(stazioneDi(c, 'cena'), 'pass',
        'la sera ai primi ci sta gia A: B serve al pass');
    });
  }
});

test('a decidere la seconda partita e l ORDINE di stations, non il codice', () => {
  // «La priorita' la deve impostare sempre il titolare.» Nessuna coppia di
  // partite e cablata: stesso identico caso, ordine ribaltato, esito ribaltato.
  const needs = { colazione:[],
    pranzo:[{stationId:'primi',count:2}],
    cena:  [{stationId:'primi',count:1},{stationId:'pass',count:1},{stationId:'lavaggio',count:1}] };
  const brigata = ordine => ([
    {id:'A', name:'A', stations:['primi'],  weeklyQuota:[{count:7,codes:['SP']}]},
    {id:'B', name:'B', stations:ordine,     weeklyQuota:[{count:7,codes:['SP']}]},
    {id:'C', name:'C', stations:['lavaggio','pass'], weeklyQuota:[{count:7,codes:['S']}]},
  ]);
  const conPass = computeShifts(brigata(['primi','pass','lavaggio']), needs, {config:BASE, seed:'o1'});
  const conLav  = computeShifts(brigata(['primi','lavaggio','pass']), needs, {config:BASE, seed:'o1'});
  DAYS.forEach(d=>{
    assert.equal(stazioneDi(conPass.newShifts['B'][d], 'cena'), 'pass',
      'col pass davanti nell elenco, la sera si va al pass');
    assert.equal(stazioneDi(conLav.newShifts['B'][d], 'cena'), 'lavaggio',
      'col lavaggio davanti, la sera si va al lavaggio');
  });
});

test('non ci si sposta quando la partita di partenza la sera serve ancora', () => {
  // E' il motivo per cui il turno accorpato era stato scelto: una persona sola
  // chiude due posti sulla STESSA partita. Spostarsi per inerzia aprirebbe il
  // buco che si era appena chiuso.
  const staff = [
    {id:'A', name:'A', stations:['primi','pass'], weeklyQuota:[{count:7,codes:['SP']}]},
  ];
  const needs = { colazione:[],
    pranzo:[{stationId:'primi',count:1}],
    cena:  [{stationId:'primi',count:1},{stationId:'pass',count:1}] };
  const {newShifts, shortfalls} = computeShifts(staff, needs, {config:BASE, seed:'p1'});
  DAYS.forEach(d=>{
    assert.equal(stazioneDi(newShifts['A'][d], 'pranzo'), 'primi');
    assert.equal(stazioneDi(newShifts['A'][d], 'cena'), 'primi',
      'ai primi la sera serve ancora: non ci si sposta');
  });
  // Il pass resta scoperto, ed e vero: in brigata c e una persona sola.
  assert.equal(shortfalls.every(s=> s.stationId === 'pass'), true);
});

test('il budget della settimana e un budget di TURNI, non di posti-servizio', () => {
  // IL RISCHIO SILENZIOSO di questa modifica. Un turno accorpato adesso tocca
  // due partite: se `turniResidui` si scalasse una volta per servizio invece
  // che una per turno, l aritmetica su cui poggia il metodo dello chef
  // (x = F - T spezzati, y = 2T - F singoli) si sbilancerebbe, il budget degli
  // spezzati scenderebbe a zero prima del tempo e il motore ripiegherebbe su
  // turni singoli e su turni oltre quota. Non da errore e non perde dati: si
  // vede solo qui, nella DISTRIBUZIONE.
  const staff = [1,2,3,4,5,6].map(i=>
    ({id:'w'+i, name:'W'+i, stations:['lavaggio','insalate'],
      weeklyQuota:[{count:5,codes:['P','S','SP']},{count:2,codes:['R']}]}));
  const needs = { colazione:[],
    pranzo:[{stationId:'lavaggio',count:2},{stationId:'insalate',count:1}],
    cena:  [{stationId:'lavaggio',count:2},{stationId:'insalate',count:1}] };
  for(const seme of ['t1','t2','t3','t4','t5']){
    const r = computeShifts(staff, needs, {config:BASE, seed:seme});
    assert.equal(r.extras.length, 0,
      'seme '+seme+': un extra qui vuol dire che il budget dei turni si e sbilanciato');
  }
});

// ============================================================================
// IL BANCO DI PROVA VERO: LA CUCINA DELLO CHEF.
//
// Tutto quello che sta sopra questa riga e' fatto di brigate costruite apposta
// per la regola che stanno provando — quindici persone tutte uguali, una
// partita a testa, capienza abbondante. Passavano tutte mentre sul prospetto
// vero il generatore sbagliava di brutto: 8,37 posti-servizio di sovracopertura
// e 10,12 di scopertura nella stessa settimana. Un banco di prova che non
// somiglia al cliente non prova niente.
//
// Questi test MISURANO, non descrivono: eseguono un lotto di generazioni con
// semi fissi e confrontano tre numeri con delle soglie. Le soglie non sono
// congetture — sono state ottenute eseguendo, e il pavimento contro cui si
// leggono e' stato costruito a mano e validato: su DEROMA un prospetto perfetto
// fa 0 di sovracopertura, 2 di scopertura (28 posti al lavaggio contro 26 di
// capienza, e i quattro del lavaggio non fanno turni extra) e 0 turni extra.
// ============================================================================

// Quante persone di troppo, sommate su ogni (giornata, servizio, partita).
// Si guarda la stazione DEL SERVIZIO — `stazioneDi(cella, sv)` — perche' da
// quando una persona puo' stare a pranzo su una partita e a cena su un'altra,
// leggere il solo `cell.stationId` conterebbe una stazione su due.
// Si contano solo le celle di COPERTURA: un'ora in eccedenza collocata dov'era
// gia' coperto e' una scelta dichiarata, con la sua lista e il suo freno, e
// mescolarla qui direbbe che il motore sbaglia mentre sta facendo quello che
// gli e' stato chiesto.
function sovracopertura(staff, newShifts, needs, cfg){
  const richiesti = {};
  cfg.serviceIds.forEach(sv=>{ richiesti[sv] = {};
    (needs[sv]||[]).forEach(n=>{
      richiesti[sv][n.stationId] = (richiesti[sv][n.stationId]||0) + (parseInt(n.count)||0);
    });
  });
  let troppi = 0;
  const dove = [];
  for(const day of DAYS){
    const presenti = {};
    cfg.serviceIds.forEach(sv=>{ presenti[sv] = {}; });
    for(const s of staff){
      const cella = newShifts[s.id][day];
      if(!cella || !cella.code) continue;
      const origine = cella.origine || (cella.extra ? 'extra' : 'copertura');
      if(origine !== 'copertura') continue;
      for(const sv of serviziDelCodice(cella.code, cfg)){
        const st = stazioneDi(cella, sv);
        if(st) presenti[sv][st] = (presenti[sv][st]||0) + 1;
      }
    }
    cfg.serviceIds.forEach(sv=> Object.keys(presenti[sv]).forEach(st=>{
      const ecc = presenti[sv][st] - (richiesti[sv][st]||0);
      if(ecc > 0){ troppi += ecc; dove.push(`${day} ${sv}/${st} ${presenti[sv][st]} su ${richiesti[sv][st]||0}`); }
    }));
  }
  return {troppi, dove};
}

// Il lotto: sempre gli stessi semi, cosi' il numero e' confrontabile fra due
// versioni del motore e non balla da un'esecuzione all'altra.
function lottoDeroma(quante, opzioni){
  const cfg = buildShiftConfig(DEROMA.services, DEROMA.shiftTypes);
  const esiti = [];
  for(let i=0; i<quante; i++){
    esiti.push(computeShifts(DEROMA.staff, DEROMA.staffingNeeds, Object.assign({
      config: cfg, stazioni: DEROMA.stations, seed: 'g'+i,
    }, opzioni||{})));
  }
  return {cfg, esiti};
}

test('DEROMA: mai piu persone del fabbisogno su una giornata, servizio, partita', () => {
  // L INVARIANTE. Parole dello chef: «continua a mettere due persone al pass,
  // sul fabbisogno c e scritto 1 e cosi deve essere».
  // Con la collocazione delle ore in eccedenza SPENTA — che e il default del
  // motore — nessuna cella di copertura puo eccedere il richiesto. Zero, non
  // "poche": una persona in piu e una persona che quel giorno stava a casa.
  const {cfg, esiti} = lottoDeroma(100, {eccedenza:{modo:'lascia'}});
  let totale = 0;
  const esempi = [];
  esiti.forEach((r,i)=>{
    const {troppi, dove} = sovracopertura(DEROMA.staff, r.newShifts, DEROMA.staffingNeeds, cfg);
    totale += troppi;
    if(troppi && esempi.length < 3) esempi.push('seme g'+i+': '+dove.join(', '));
  });
  assert.equal(totale, 0,
    'sovracopertura su 100 generazioni (era 837, cioe 8,37 a settimana): '+esempi.join(' | '));
});

// ONESTA SU QUANTO VALE QUELLO ZERO, perche chi legge un test verde tende a
// leggerci piu di quello che c e scritto.
//   - Vale anche su un mese intero (misurato: 0,00 su 30 generazioni da 31
//     giorni) e anche con «chi sta alle insalate copre il lavaggio» acceso
//     (0,00, e le scoperture scendono da 8,54 a 3,88).
//   - NON vale a scatola chiusa con le richieste approvate: sorteggiando un
//     giorno bloccato per circa un terzo della brigata restano 0,20 posti di
//     sovracopertura a settimana. Misurato caso per caso: in 19 su 20 TUTTI i
//     candidati rimasti avevano in tasca solo turni accorpati, cioe la scelta
//     era fra una persona in piu a pranzo e un buco a cena — e un buco falso
//     manda qualcuno a cercare un problema che non esiste. Non e un difetto da
//     tappare qui, e il ventesimo caso e 0,01 a settimana.
// Il test non fissa una soglia su quel caso: sarebbe una soglia sul mio
// generatore di richieste finte, non su una regola della cucina.

test('DEROMA: la sovracopertura non si toglie scavando buchi', () => {
  // IL MODO FACILE DI BARARE, e per questo sta in un test suo. Basta rinunciare
  // a un turno ogni volta che rischia di eccedere e la sovracopertura va a zero
  // da sola, lasciando la settimana piena di scoperture. Le due misure vanno
  // lette insieme o non dicono niente.
  // Le soglie sono i numeri MISURATI sul motore prima di questo lavoro —
  // 10,12 posti scoperti e 4,91 turni extra a settimana — e sono un tetto, non
  // un obiettivo: il pavimento verificato a mano e 2 e 0.
  const {esiti} = lottoDeroma(100, {eccedenza:{modo:'lascia'}});
  const scoperti = esiti.reduce((n,r)=>
    n + r.shortfalls.reduce((m,x)=> m + (x.missing||1), 0), 0) / esiti.length;
  const extra = esiti.reduce((n,r)=> n + r.extras.length, 0) / esiti.length;
  assert.ok(scoperti <= 10.12,
    'posti scoperti a settimana: '+scoperti.toFixed(2)+', peggio del motore di prima (10,12)');
  assert.ok(extra <= 4.91,
    'turni extra a settimana: '+extra.toFixed(2)+', peggio del motore di prima (4,91)');
  // E il numero di oggi, perche il prossimo che tocca il motore veda subito se
  // lo ha peggiorato senza far diventare rosso niente: 8,54 e 0,00.
  assert.ok(scoperti <= 9.00, 'posti scoperti a settimana: '+scoperti.toFixed(2)+' (oggi 8,54)');
  assert.ok(extra <= 0.50, 'turni extra a settimana: '+extra.toFixed(2)+' (oggi 0,00)');
});

test('DEROMA: nessuno su una partita che non sa fare, e la mappa resta sana', () => {
  // La rete di sicurezza del banco vero: le regole che i test sintetici gia
  // provano devono valere anche qui, dove le persone hanno due partite con
  // priorita, part-time da 6 e 7 ore e sei persone che non fanno extra.
  const {cfg, esiti} = lottoDeroma(20, {eccedenza:{modo:'lascia'}});
  esiti.forEach((r,i)=>{
    assert.equal(noQualificationViolations(DEROMA.staff, r.newShifts, cfg), null, 'seme g'+i);
    for(const s of DEROMA.staff){
      for(const day of DAYS){
        const cella = r.newShifts[s.id][day];
        if(!cella || !cella.code) continue;
        const servizi = serviziDelCodice(cella.code, cfg);
        // `stationId` resta il contratto verso il passato: sempre allineato
        // alla prima stazione della mappa.
        if(servizi.length){
          assert.equal(cella.stationId, stazioneDi(cella, servizi[0]),
            `seme g${i}, ${s.id} ${day}: stationId non allineato alla mappa`);
        }
      }
    }
  });
});
