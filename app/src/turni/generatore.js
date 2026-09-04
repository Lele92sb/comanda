import { dataCorta, giornoMese, t } from '../core/lingua.ts';
import { SERVICE_LABEL, conferma, esc, periodDates, refreshShiftConfig, save, setPeriodAnchor, setPeriodMode, shiftPeriod, state, toast } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { DAYS, REST_CODE, bloccaGenerazione, codeAllowed, constraintFor, generaMigliore, parseISO, puoFareExtra, quoteStorte, settimaneIntere } from '../lib/logic.js';
import { renderDashboard } from '../viste/dashboard.js';
import { renderOreExtra, renderTurni } from './griglia.js';
import { caricaRichieste, constraintsFromRequests } from './richieste.js';
import './generatore-vista.ts';
/* ============================= TURNI: generatore casuale (motore in logic.js, need-driven, testato) ============================= */

/* Chi avrebbe potuto coprire questa postazione, ma non e' stato chiamato
   perche' ha spento "puo' fare turni extra".

   Serve perche' il vecchio messaggio di scopertura era diventato falso: diceva
   "nessun qualificato e' libero quel giorno", e da quando si puo' dichiarare di
   non fare turni oltre la quota una persona puo' essere liberissima e
   comunque non chiamabile. Sono due scoperture diverse e si risolvono in due
   modi diversi — una assumendo o qualificando qualcuno, l'altra facendo una
   telefonata. Dirle con la stessa frase manda a cercare il problema sbagliato.

   "Libero" qui vuol dire a riposo: ferie e malattia non sono disponibilita',
   e chi ha una richiesta approvata che blocca il giorno non e' libero comunque
   — quello e' un vincolo assoluto, non una preferenza. */
function rinunciatariPer(sf, constraints){
  const cfg = refreshShiftConfig();
  // Non basta che sia a riposo e qualificato: deve poter fare PROPRIO QUESTO
  // servizio. Chi ha una richiesta approvata "solo pranzo" non è un
  // rinunciatario su una scopertura di cena — è un vincolo concordato, e
  // riaccendergli gli extra non coprirebbe comunque quel buco.
  const puoCoprireIlServizio = s => (cfg.serviceCodes[sf.service] || [])
    .some(c => codeAllowed(constraints, s.id, sf.day, c, cfg.codeToServices));
  return state.staff.filter(s=>
    !puoFareExtra(s)
    && s.stations && s.stations.includes(sf.stationId)
    && !(constraintFor(constraints, s.id, sf.day) || {}).blocked
    && puoCoprireIlServizio(s)
    && (((state.shifts[s.id]||{})[sf.day]||{}).code || '') === REST_CODE
  ).map(s=> s.name);
}

async function generateRandomShifts(){
  if(!state.staff.length){ toast('Aggiungi prima la brigata'); return; }
  // Le richieste approvate sono vincoli assoluti: vanno rilette adesso, non
  // usando quelle caricate chissà quando.
  await caricaRichieste();
  // QUI SI FERMA. Prima si controllava solo che la quota ESISTESSE, e una
  // quota che c'e' ma non fa sette passava: il motore la tagliava a sette da
  // solo, in silenzio, e il prospetto usciva sbagliato senza che niente lo
  // dicesse. Ora si guarda anche il totale, e non si parte.
  const storte = quoteStorte(state.staff).filter(x => bloccaGenerazione(x.problemi));
  if(storte.length){
    renderBloccoQuote();
    document.getElementById('quote-storte-box')
      ?.scrollIntoView({ block:'nearest', behavior:'smooth' });
    return;
  }
  // Chi non ha stazioni non viene pianificato: lo dice il motore nel riepilogo
  // qui sotto (nonPianificabili), non un avviso che sparisce dopo due secondi.

  const daSalvare = periodDates();
  // IL MOTORE LAVORA SEMPRE SU SETTIMANE INTERE, anche quando tu guardi un mese.
  // Idea dello chef: "visto che il settimanale funziona, il mensile puo'
  // generare tutte settimane separate complete da lunedi a domenica e poi pero'
  // mostrare solo i risultati del mese preciso".
  // La quota e le ore di contratto hanno senso solo su sette giorni: su una
  // settimana tagliata a meta' dal bordo del mese il conto non si puo' fare, e
  // prima infatti usciva sbagliato in tutti i modi possibili.
  const dates = settimaneIntere(daSalvare);
  const constraints = constraintsFromRequests();
  // I giorni fuori dal periodo che hai chiesto, ma dentro le settimane che il
  // motore deve completare: se hanno gia' dei turni NON si rifanno, si prendono
  // com'erano. Diventano vincoli fissi esattamente come una richiesta
  // approvata — con in piu' la partita, altrimenti il motore crederebbe quelle
  // postazioni scoperte e ce ne metterebbe altre sopra.
  const bordi = new Set(daSalvare.map(String));
  const inBrigata = state.staff.filter(p=> p.stations && p.stations.length);
  const scritto = d => inBrigata.length > 0 &&
    inBrigata.every(p=> ((state.shifts[p.id]||{})[d]||{}).code);

  // UNA SETTIMANA GIA' FATTA PER INTERO NON SI RIFA'.
  //
  // Il caso: hai gia' preparato la settimana del 31 agosto, poi generi il mese
  // di settembre. Quella settimana sta a cavallo. Fissare il solo lunedi' e
  // rigenerare gli altri sei giorni sembra la cosa giusta, e invece e' il
  // problema: il lunedi' era stato deciso dentro un equilibrio che ora si
  // rompe, e per rimetterlo in piedi il motore deve chiamare turni oltre quota.
  // Misurato sulla cucina vera: 4,1 extra e 32 quote sfondate su 520, tutte in
  // quella settimana. Sul mese generato da zero: zero e zero.
  //
  // Quella settimana e' gia' a posto: si lascia stare tutta, e i giorni del
  // mese che le appartengono restano quelli. Il riepilogo lo dice.
  const settimaneSalte = [];
  const daGenerare = dates.filter(d=>{
    const lun = new Date(d); lun.setDate(lun.getDate() - ((lun.getDay()+6)%7));
    const giorniSett = [...Array(7)].map((_,i)=>{ const x=new Date(lun); x.setDate(lun.getDate()+i);
      return x.toISOString().slice(0,10); });
    const tocca = giorniSett.some(x=> !bordi.has(x));      // la settimana esce dal periodo?
    if(!tocca) return true;                                 // tutta dentro: si genera
    if(!giorniSett.every(scritto)) return true;             // non e' completa: si genera
    const k = giorniSett[0];
    if(!settimaneSalte.includes(k)) settimaneSalte.push(k);
    return false;
  });

  let giorniFissati = 0;
  daGenerare.forEach(d=>{
    if(bordi.has(d)) return;
    state.staff.forEach(p=>{
      const cella = (state.shifts[p.id]||{})[d];
      if(!cella || !cella.code) return;
      constraints[p.id] = constraints[p.id] || {};
      // Una richiesta approvata batte tutto: se c'e' gia', non la si tocca.
      if(constraints[p.id][d]) return;
      constraints[p.id][d] = { blocked: cella.code, fissa: cella };
      giorniFissati++;
    });
  });
  // Contate prima di aggiungere gli impegni altrove: sono due cose diverse e
  // vanno spiegate separatamente a chi legge il riepilogo.
  const nRichieste = Object.values(constraints).reduce((n,g)=>n+Object.keys(g).length, 0);
  const nPersoneRichieste = Object.keys(constraints).length;

  // Chi lavora anche in un'altra cucina non puo' essere in due posti lo stesso
  // giorno: gli impegni altrove valgono come un vincolo assoluto, esattamente
  // come una richiesta approvata.
  let altrove = {};
  try{ altrove = await Cloud.impegniAltrove(state.staff, dates); }
  catch(e){ console.error('impegni altrove non letti', e); }
  Object.entries(altrove).forEach(([staffId, giorni])=>{
    Object.keys(giorni).forEach(d=>{
      constraints[staffId] = constraints[staffId] || {};
      if(!constraints[staffId][d]) constraints[staffId][d] = {blocked:'R'};
    });
  });
  // `stazioni` NON e' un doppione di `state.stations` gia' noto altrove: e'
  // l'unica strada per cui la mano che una partita da' a un'altra (`copreAnche`)
  // arriva al motore. Senza, il riquadro «copre anche» nella scheda della
  // stazione si accende, si salva, e non cambia un turno.
  // Le ore di contratto che il fabbisogno non chiede non restano in tasca: si
  // collocano. Il motore ha come predefinito 'lascia' per non cambiare da solo
  // il risultato di chi lo chiama nei test; qui invece il predefinito e' 'auto',
  // che e' quello che ha chiesto lo chef — le ore le paga comunque, tanto vale
  // averle in cucina la sera che tira.
  const eccedenza = state.eccedenzaOre || { modo:'auto', giorni:[] };
  // Non una passata sola: venti bozze, ognuna aggiustata con quattrocento
  // scambi, e si mostra la migliore. E' l'idea dello chef — "se il generatore
  // prima di compilare i turni si facesse lui dei preturni mentali e poi va a
  // modificare quelli aggiustandoli secondo le regole e solo dopo li mostra" —
  // e risolve due cose che una passata sola non sapeva risolvere: i turni
  // sempre uguali e i tre spezzati di fila.
  // Misurato sulla sua cucina: prospetti diversi da 6 su 20 a 12 su 12,
  // persone con tre spezzati di fila da 5,00 a 0,00, copertura invariata.
  // Costa 104 millisecondi: lui aveva messo in conto cinque secondi.
  const { newShifts, shortfalls, extras, nonPianificabili, quotaNonSpesa,
          eccedenzeCollocate } = generaMigliore(state.staff, state.staffingNeeds,
    {config: refreshShiftConfig(), dates: daGenerare, constraints, stazioni: state.stations, eccedenza,
     // I turni gia' salvati servono al motore per un motivo solo: se il periodo
     // taglia una settimana a meta', deve sapere quante ore quella persona ha
     // gia' fatto nei giorni che restano fuori. La settimana e' sempre
     // lunedi-domenica anche quando la finestra ne mostra sei giorni.
     turniEsistenti: state.shifts,
     tentativi: 20, scambi: 400});
  // Si sovrascrivono SOLO le date del periodo: i turni delle altre settimane
  // gia' pianificate non devono sparire perche' se ne rigenera una.
  // Si salva SOLO quello che il periodo chiedeva. I giorni in piu' servivano al
  // motore per far tornare il conto delle ore su settimane intere, e finiscono
  // qui: scriverli vorrebbe dire che generando settembre ti riscrivo di
  // nascosto quattro giorni di ottobre.
  state.staff.forEach(s=>{
    const suoi = newShifts[s.id] || {};
    const solo = {};
    daSalvare.forEach(d=>{ if(suoi[d]) solo[d] = suoi[d]; });
    state.shifts[s.id] = Object.assign(state.shifts[s.id]||{}, solo);
  });
  save('shifts');
  renderTurni(); renderOreExtra(); renderPubblicazione(); renderDashboard();

  const logEl = document.getElementById('generate-log');
  let html = '';
  if(extras.length){
    const byPerson = {};
    extras.forEach(ex=>{ byPerson[ex.staffName] = (byPerson[ex.staffName]||0)+1; });
    html += `<div class="alert-box">Il fabbisogno impostato supera le quote della brigata: ${extras.length} turni EXTRA (oltre quota) sono stati assegnati per coprire comunque le postazioni — ` +
      Object.entries(byPerson).map(([name,n])=>`${esc(name)} (+${n})`).join(', ') +
      `. Sono segnati con "extra" nella griglia qui sotto.</div>`;
  }
  if(shortfalls.length){
    const byDay = {};
    let quantiRinunciatari = 0;
    shortfalls.forEach(sf=>{
      const st = state.stations.find(x=>x.id===sf.stationId);
      const key = dataCorta(parseISO(sf.day));
      const spenti = rinunciatariPer(sf, constraints);
      if(spenti.length) quantiRinunciatari++;
      byDay[key] = byDay[key] || [];
      byDay[key].push(`${esc(SERVICE_LABEL(sf.service))} · ${st?esc(st.name):'—'} (mancano ${sf.missing}) — ` +
        (spenti.length
          ? `chi poteva coprirla ha i turni extra spenti: <b>${spenti.map(esc).join(', ')}</b>`
          : `nessun qualificato era libero quel giorno`));
    });
    html += `<div class="alert-box">⚠ Anche assegnando turni extra, restano postazioni scoperte:<br>` +
      Object.entries(byDay).map(([day,lines])=>`<b>${day}</b>: ${lines.join('<br>')}`).join('<br>') +
      `</div><p class="small-note">Per risolvere: ` +
      (quantiRinunciatari ? `chiedi a chi ha spento "può fare turni extra" nella sua scheda, oppure ` : '') +
      `aggiungi personale qualificato per quella stazione, o abbassa il fabbisogno richiesto.</p>`;
  }
  const nAltrove = Object.values(altrove).reduce((n,g)=>n+Object.keys(g).length, 0);
  let premessa = '';
  if(nonPianificabili.length){
    // Senza questo, chi non ha stazioni si ritrova una fila di R nella griglia
    // e sembra un difetto del generatore invece di una conseguenza.
    const nomi = nonPianificabili.map(p=> esc(p.staffName)).join(', ');
    premessa += `<div class="alert-box">Il generatore non ha dato turni a ${nomi}: ${nonPianificabili.length>1?'non hanno':'non ha'} nessuna stazione assegnata, e un turno senza stazione non copre nessun servizio — conterebbe nelle ore ma non coprirebbe niente. ` +
      `Nella griglia ${nonPianificabili.length>1?'restano visibili, marcati':'resta visibile, marcato'} con un pallino vuoto: i turni si assegnano a mano, oppure si assegnano le stazioni nella scheda della persona.</div>`;
  }
  if(settimaneSalte.length){
    const q = settimaneSalte.map(k=> giornoMese(parseISO(k)));
    premessa += `<div class="ok-box">${settimaneSalte.length === 1 ? 'La settimana' : 'Le settimane'} del ${esc(q.join(', '))} ${settimaneSalte.length === 1 ? 'era già completa' : 'erano già complete'} e ${settimaneSalte.length === 1 ? 'non è stata rifatta' : 'non sono state rifatte'}: sta a cavallo del periodo, e rifarne solo una parte avrebbe richiesto turni oltre quota per rimettere in piedi un equilibrio che era già a posto. Se la vuoi diversa, rigenerala dalla vista settimana.</div>`;
  }
  if(eccedenzeCollocate && eccedenzeCollocate.length){
    // Tenuta SEPARATA dai turni extra, e non e' pignoleria: un extra e' oltre
    // la quota e costa di piu', un'eccedenza e' dentro la quota ed e' gia'
    // pagata. Metterle nella stessa riga vorrebbe dire far credere allo chef
    // di spendere soldi che ha gia' speso.
    const perTesta = {};
    eccedenzeCollocate.forEach(e=>{ perTesta[e.staffName] = (perTesta[e.staffName]||0)+1; });
    const dove = (eccedenza.modo === 'giorni' && eccedenza.giorni && eccedenza.giorni.length)
      ? `sui giorni che hai scelto (${eccedenza.giorni.join(', ')})`
      : "sui giorni dove il servizio preme di più";
    premessa += `<div class="ok-box">${eccedenzeCollocate.length} or${eccedenzeCollocate.length>1?'e':'a'} di contratto collocat${eccedenzeCollocate.length>1?'e':'a'} ${dove} — ` +
      Object.entries(perTesta).map(([nome,n2])=>`${esc(nome)} (+${n2})`).join(', ') +
      `. Non sono turni extra: stanno dentro la quota di queste persone, le stavi gia' pagando.</div>`;
  }
  if(quotaNonSpesa && quotaNonSpesa.length){
    // Da quando il generatore non rabbocca piu' i turni che non servono,
    // qualcuno puo' chiudere la settimana sotto le ore contrattuali. E' un
    // numero vero — prima il pareggio si otteneva assegnando turni che non
    // coprivano nessun servizio — ma senza questa riga sembra un difetto.
    // DUE MOTIVI DIVERSI, e confonderli costa tempo a chi legge. Il primo:
    // il fabbisogno non chiedeva quei turni, e allora c'e' una decisione da
    // prendere. Il secondo: la settimana e' tagliata dal bordo del periodo e
    // non e' ancora finita, e allora non c'e' niente da fare — si assegneranno
    // quando si genera il resto. Lo chef ha visto «43 turni non assegnati
    // perche' non servono» su un mese e ha dovuto chiedere se erano i giorni
    // mancanti: erano quelli, e la frase glielo nascondeva.
    const bordo = quotaNonSpesa.filter(q=> q.motivo === 'settimana incompleta');
    const veri  = quotaNonSpesa.filter(q=> q.motivo !== 'settimana incompleta');
    const somma = g => g.reduce((n2,q)=> n2+q.turni, 0);
    const elenco = g => g.map(q=> `${esc(q.staffName)} (${q.turni})`).join(', ');
    if(bordo.length){
      // I giorni della prima e dell'ultima settimana che restano fuori dal
      // periodo: sono quelli che spiegano il numero.
      const fuori = [];
      const primo = parseISO(dates[0]), ultimo = parseISO(dates[dates.length-1]);
      for(let k=1;k<=6;k++){
        const d = new Date(primo); d.setDate(primo.getDate()-k);
        if(d.getDay() === 0) break;                       // domenica: settimana finita
        fuori.unshift(dataCorta(d));
      }
      for(let k=1;k<=6;k++){
        const d = new Date(ultimo); d.setDate(ultimo.getDate()+k);
        fuori.push(dataCorta(d));
        if(d.getDay() === 0) break;                       // arrivati a domenica
      }
      const n1 = somma(bordo);
      premessa += `<div class="ok-box">${n1} turn${n1>1?'i':'o'} appartengono a settimane che il periodo taglia a metà, e verranno assegnat${n1>1?'i':'o'} quando genererai anche i giorni che mancano` +
        (fuori.length ? ` — ${esc(fuori.join(', '))}` : '') + `. ` +
        `La settimana è sempre lunedì-domenica: finché non è intera le ore non si possono chiudere. Non c'è niente da sistemare.</div>`;
    }
    if(veri.length){
      const n2 = somma(veri);
      premessa += `<div class="ok-box">${n2} turn${n2>1?'i':'o'} di quota non ${n2>1?'sono stati':'è stato'} assegnat${n2>1?'i':'o'}: il fabbisogno impostato non ${n2>1?'li':'lo'} chiedeva — ${elenco(veri)}. ` +
        `Nella colonna Ore queste persone risultano sotto le ore contrattuali, ed è corretto: prima il conto tornava perché l'app assegnava turni che non coprivano nessun servizio. ` +
        `Se devono comunque lavorare, alza il fabbisogno di quel servizio oppure assegna i turni a mano.</div>`;
    }
  }
  if(nRichieste){
    premessa += `<div class="ok-box">Rispettate le richieste approvate: ${nRichieste} giorni vincolati su ${nPersoneRichieste} person${nPersoneRichieste>1?'e':'a'}.</div>`;
  }
  if(nAltrove){
    const nomi = [...new Set(Object.values(altrove).flatMap(g=>Object.values(g)))];
    premessa += `<div class="ok-box">${nAltrove} giorni lasciati liberi: quelle persone lavorano in un'altra cucina (${nomi.map(esc).join(', ')}).</div>`;
  }
  html = premessa + html;
  if(!extras.length && !shortfalls.length){
    html += `<div class="ok-box">✓ Fabbisogno coperto per tutti i servizi, tutti i giorni, senza bisogno di turni extra.</div>`;
  }
  // UNA RIGA, e il resto dietro un clic.
  //
  // Le informazioni erano giuste ma il posto no: cinque riquadri uno sotto
  // l'altro, e per arrivare ai turni bisognava scorrere mezza pagina. Parole
  // dello chef: "sono molto invadenti e per vedere i turni bisogna scorrere
  // troppo".
  // Quello che non puo' aspettare — un buco da coprire — resta scritto anche
  // a riepilogo chiuso: e' l'unica cosa che chiede una decisione oggi.
  // UNA RIGA, e il resto dietro un clic.
  //
  // Le informazioni erano giuste ma il posto no: cinque riquadri uno sotto
  // l'altro, e per arrivare ai turni bisognava scorrere mezza pagina. Parole
  // dello chef: "sono molto invadenti e per vedere i turni bisogna scorrere
  // troppo".
  // Quello che non puo' aspettare — un buco da coprire — resta scritto anche
  // a riepilogo chiuso: e' l'unica cosa che chiede una decisione oggi, e per
  // questo va davanti a tutto, col «!» che il componente legge come «rosso».
  logEl.innerHTML = html;

  const nScoperti = shortfalls.reduce((n2,x)=> n2 + (x.missing||1), 0);
  // Il dettaglio si apre insieme al riepilogo: sono la stessa cosa vista da
  // due distanze, e tenerli separati vuol dire due stati da tenere allineati.
  const nQuoteDaDecidere = (quotaNonSpesa || [])
    .filter(q => q.motivo !== 'settimana incompleta').length;
  logEl.classList.toggle('hidden', nScoperti === 0 && nQuoteDaDecidere === 0);
  const voci = [];
  if(nScoperti) voci.push(`!${nScoperti} post${nScoperti>1?'i scoperti':'o scoperto'}`);
  if(extras.length) voci.push(`${extras.length} extra`);
  if(eccedenzeCollocate && eccedenzeCollocate.length) voci.push(`${eccedenzeCollocate.length} or${eccedenzeCollocate.length>1?'e':'a'} collocat${eccedenzeCollocate.length>1?'e':'a'}`);
  if(nonPianificabili.length) voci.push(`${nonPianificabili.length} senza stazione`);
  if(quotaNonSpesa && quotaNonSpesa.length) voci.push(`${quotaNonSpesa.reduce((n2,q)=>n2+q.turni,0)} turni non assegnati`);

  const riass = montaRiepilogo();
  if(riass){
    riass.voci = voci;
    riass.conDettagli = Boolean(html);
    // SI APRE DA SOLO QUANDO C'E' UN BUCO DA COPRIRE.
    //
    // «Una riga e il resto dietro un clic» vale quando e' andato tutto bene:
    // li' il riquadro chiuso e' un riassunto. Con dei posti scoperti no —
    // quella e' l'unica cosa che chiede una decisione oggi, e chiederla dietro
    // un pulsante vuol dire che il messaggio in basso resta l'unica cosa che
    // si vede, e quello passa in tre secondi e non si clicca.
    // Si apre anche quando qualcuno chiude la settimana sotto le sue ore: e'
    // esattamente la domanda che si fa chi guarda («perche' Marco fa 32 ore e
    // non 40?»), e la risposta e' li' dentro, scritta per nome. Non si apre
    // per le settimane tagliate dal bordo del periodo: quelle si sistemano da
    // sole generando il resto, e aprire ogni volta vorrebbe dire un riquadro
    // sempre aperto, cioe' di nuovo cinque riquadri invadenti.
    const quoteDaDecidere = (quotaNonSpesa || [])
      .filter(q => q.motivo !== 'settimana incompleta').length;
    riass.aperto = nScoperti > 0 || quoteDaDecidere > 0;
  }

  // Il messaggio che passa dice COSA e' successo, non «vedi i dettagli»: i
  // dettagli sono aperti li' sopra e restano, questo passa in tre secondi. Un
  // messaggio che manda da un'altra parte e poi sparisce manda nel vuoto.
  toast(shortfalls.length
    ? t('Turni generati — restano {n} posti scoperti', { n: nScoperti })
    : (extras.length ? t('Turni generati — con alcuni turni extra')
                     : t('Turni generati — fabbisogno coperto')));
}
/* IL BLOCCO, SCRITTO DOVE SI PREME.

   Un `toast` non basta per una cosa da riparare: dura due secondi e se ne va,
   e chi torna dopo aver sistemato meta' delle quote non ha piu' l'elenco. Qui
   resta finche' resta la ragione — che e' esattamente il mestiere di
   <cmd-avviso>.

   E il bottone si spegne. Un bottone che si puo' premere e non fa niente
   insegna che l'app e' rotta; uno spento, con accanto scritto perche', insegna
   cosa manca. */
function frasiQuotaStorta(x){
  return x.problemi.map(p =>
    p.tipo === 'nessun_gruppo'
      ? t('{chi}: nessun gruppo di turni', { chi: x.nome })
    : p.tipo === 'totale'
      ? t('{chi}: {n} turni invece di 7', { chi: x.nome, n: p.totale })
    : p.tipo === 'gruppi_senza_codici'
      ? t('{chi}: un gruppo senza nessuna sigla accesa', { chi: x.nome })
      : null
  ).filter(Boolean);
}

let vistaBlocco = null;

export function renderBloccoQuote(){
  const el = document.getElementById('quote-storte-box');
  if(!el) return;
  const storte = quoteStorte(state.staff).filter(x => bloccaGenerazione(x.problemi));
  const bottone = document.getElementById('btn-generate-shifts');

  if(!storte.length){
    if(vistaBlocco){ vistaBlocco.remove(); vistaBlocco = null; }
    if(bottone) bottone.disabled = false;
    return;
  }
  if(bottone) bottone.disabled = true;

  if(!vistaBlocco || !vistaBlocco.isConnected){
    vistaBlocco = document.createElement('cmd-avviso');
    vistaBlocco.setAttribute('tono', 'allarme');
    el.replaceChildren(vistaBlocco);
  }
  const righe = storte.flatMap(frasiQuotaStorta);
  vistaBlocco.textContent =
    (storte.length === 1
      ? t('Non posso generare: una quota non fa 7.')
      : t('Non posso generare: {n} quote non fanno 7.', { n: storte.length })) + ' ' +
    righe.join(' · ') + ' — ' +
    t('Sette sono i giorni della settimana, riposi compresi. Chi ne dichiara meno lascia dei giorni vuoti; chi ne dichiara di più se ne vede sparire alcuni, e non sa quali. Si sistemano in Impostazioni cucina → Quote per persona.');
}

document.getElementById('btn-generate-shifts').addEventListener('click', generateRandomShifts);

// SVUOTA. Cancella i turni del periodo mostrato, non tutti quelli che esistono:
// il periodo e' quello che hai davanti, ed e' l'unica cosa che ti aspetti di
// perdere. Se qualcuno di quei giorni era pubblicato, lo si dice PRIMA: la
// brigata li ha gia' visti e cancellarli senza avvisare e' il modo migliore per
// far presentare qualcuno a un turno che non esiste piu'.
document.getElementById('btn-svuota-turni').addEventListener('click', async ()=>{
  const dates = periodDates();
  const quanti = state.staff.reduce((n,p)=>
    n + dates.filter(d=> ((state.shifts[p.id]||{})[d]||{}).code).length, 0);
  if(!quanti){ toast(t("Non c'è niente da svuotare in questo periodo")); return; }
  const pubblicate = new Set(state.publishedShifts || []);
  const nPubb = dates.filter(d=> pubblicate.has(d)).length;
  const ok = await conferma(
    t('Svuotare i turni di questo periodo?'),
    t('{n} turni verranno cancellati.', {n: quanti})
      + (nPubb ? ' ' + (nPubb === 1
          ? t('Uno di questi giorni è già pubblicato: la brigata lo vede adesso e dopo non lo vedrà più.')
          : t('{g} di questi giorni sono già pubblicati: la brigata li vede adesso e dopo non li vedrà più.', {g: nPubb})) : '')
      + ' ' + t('I turni degli altri periodi non si toccano.'),
    {conferma: t('Svuota'), pericolo: true});
  if(!ok) return;
  state.staff.forEach(p=>{ dates.forEach(d=>{ if(state.shifts[p.id]) delete state.shifts[p.id][d]; }); });
  const salvato = await save('shifts');
  if(!salvato) return;
  // Un giorno svuotato non resta «pubblicato»: non c'e' piu' niente da vedere,
  // e lasciarlo segnato darebbe «Pubblicato in parte: 1 giorno su 7» su una
  // griglia vuota. La pubblicazione segue i turni, non li precede.
  if(nPubb){
    const restano = new Set(state.publishedShifts || []);
    dates.forEach(d=> restano.delete(d));
    state.publishedShifts = [...restano].sort();
    await save('publishedShifts');
  }
  document.getElementById('generate-riassunto').classList.add('hidden');
  document.getElementById('generate-log').classList.add('hidden');
  renderTurni(); renderOreExtra(); renderPubblicazione(); renderDashboard();
  toast(t('Turni svuotati'));
});

// REVOCA. Toglie la pubblicazione dei giorni del periodo, e si puo' fare SEMPRE
// — anche a periodo pubblicato solo a meta'. Prima il pulsante diventava
// «Nascondi» unicamente quando il periodo era pubblicato per intero: con mezzo
// periodo pubblicato per sbaglio non c'era modo di tornare indietro.
async function revoca(){
  const dates = periodDates();
  const pubblicate = new Set(state.publishedShifts || []);
  const quanti = dates.filter(d=> pubblicate.has(d)).length;
  if(!quanti){ toast(t("In questo periodo non c'è niente di pubblicato")); return; }
  const ok = await conferma(
    t('Togliere la pubblicazione?'),
    t('{n} giorni torneranno invisibili alla brigata. I turni restano come sono: si possono ripubblicare quando vuoi.', {n: quanti}),
    {conferma: t('Revoca')});
  if(!ok) return;
  dates.forEach(d=> pubblicate.delete(d));
  state.publishedShifts = [...pubblicate].sort();
  const salvato = await save('publishedShifts');
  if(!salvato) return;
  renderPubblicazione(); renderTurni();
  toast(t('Pubblicazione revocata'));
}

/* La vista dell'eccedenza sta dichiarata QUI e non accanto alla sua funzione:
   `renderEccedenza()` viene chiamata poche righe piu' sotto, mentre il modulo
   si sta ancora caricando, e una `let` piu' in basso e' irraggiungibile fino
   a quel punto. Costava un errore a ogni avvio, e con lui tutto il resto del
   modulo: i tre pulsanti del periodo non venivano mai collegati. */
let vistaEccedenza = null;

/* ---- Navigazione del periodo ---- */
function aggiornaPeriodo(){ renderTurni(); renderOreExtra(); renderPubblicazione(); renderEccedenza(); }
// Anche al primo disegno, non solo cambiando periodo: senza, i pulsanti
// restano tutti spenti e sembra che nessun modo sia scelto.
renderEccedenza();
document.querySelectorAll('.period-modes button').forEach(b=>b.addEventListener('click', ()=>{
  setPeriodMode(b.dataset.period);
  aggiornaPeriodo();
}));
document.getElementById('period-prev').addEventListener('click', ()=>{ shiftPeriod(-1); aggiornaPeriodo(); });
document.getElementById('period-next').addEventListener('click', ()=>{ shiftPeriod(1);  aggiornaPeriodo(); });
document.getElementById('period-today').addEventListener('click', ()=>{ setPeriodAnchor(new Date()); aggiornaPeriodo(); });

/* ============================= PUBBLICAZIONE DEI TURNI =============================
   Chi ha solo lettura vede un turno solo quando la sua data è stata pubblicata.
   Il filtro vero è nel database (leggi_sezione): qui c'è solo il comando.
   ============================================================================ */
// I giorni in ORDINE di preferenza, non interruttori: cliccandoli si accodano,
// e l'app scorre la lista dall'alto finché le ore ci stanno. Il numero accanto
// al nome dice a che punto della fila sta quel giorno — senza, «Ven e Sab
// accesi» non direbbe quale dei due viene prima quando ne avanza una sola.

export function renderEccedenza(){
  const el = document.getElementById('eccedenza-panel');
  if(!el) return;
  const cfg = state.eccedenzaOre || (state.eccedenzaOre = {modo:'auto', giorni:[]});
  if(!vistaEccedenza || !vistaEccedenza.isConnected){
    vistaEccedenza = document.createElement('cmd-eccedenza');
    vistaEccedenza.giorniPossibili = DAYS;
    vistaEccedenza.addEventListener('eccedenza-modo', e => {
      cfg.modo = e.detail.modo; save('eccedenzaOre'); renderEccedenza();
    });
    // Non e' un interruttore: i giorni si ACCODANO, e l'ordine e' il dato.
    // Premendo un giorno gia' in fila lo si toglie; premendone uno nuovo va in
    // fondo. L'app poi scorre la fila dall'alto finche' le ore ci stanno.
    vistaEccedenza.addEventListener('eccedenza-giorno', e => {
      cfg.giorni = cfg.giorni || [];
      const i2 = cfg.giorni.indexOf(e.detail.giorno);
      if(i2 >= 0) cfg.giorni.splice(i2, 1); else cfg.giorni.push(e.detail.giorno);
      save('eccedenzaOre'); renderEccedenza();
    });
    el.replaceChildren(vistaEccedenza);
  }
  vistaEccedenza.modo = cfg.modo;
  vistaEccedenza.giorni = (cfg.giorni || []).slice();
  vistaEccedenza.soloLettura = Cloud.enabled && !Cloud.canWrite();
}

let vistaRiepilogo = null;

function montaRiepilogo(){
  const el = document.getElementById('generate-riassunto');
  if(!el) return null;
  if(!vistaRiepilogo || !vistaRiepilogo.isConnected){
    vistaRiepilogo = document.createElement('cmd-riepilogo');
    vistaRiepilogo.addEventListener('riepilogo-inverti', ()=>{
      const log = document.getElementById('generate-log');
      if(log) log.classList.toggle('hidden');
    });
    el.replaceChildren(vistaRiepilogo);
  }
  return vistaRiepilogo;
}

let vistaPubblicazione = null;

export function renderPubblicazione(){
  const el = document.getElementById('pubblica-box');
  if(!el) return;
  if(!vistaPubblicazione || !vistaPubblicazione.isConnected){
    vistaPubblicazione = document.createElement('cmd-pubblicazione');
    vistaPubblicazione.addEventListener('pubblicazione-inverti', invertiPubblicazione);
    vistaPubblicazione.addEventListener('pubblicazione-revoca', revoca);
    el.replaceChildren(vistaPubblicazione);
  }
  const dates = periodDates();
  const pubblicate = new Set(state.publishedShifts || []);
  vistaPubblicazione.giorniTotali = dates.length;
  vistaPubblicazione.giorniPubblicati = dates.filter(d => pubblicate.has(d)).length;
  // Chi non può modificare non pubblica niente: per lui il riquadro non esiste.
  vistaPubblicazione.nascosta = Cloud.enabled && !Cloud.canWrite();
}

async function invertiPubblicazione(){
  const dates = periodDates();
  const pubblicate = new Set(state.publishedShifts || []);
  const tutte = dates.every(d=>pubblicate.has(d));

  if(tutte){
    const ok = await conferma(t('Nascondere questi turni alla brigata?'),
      t('Torneranno invisibili finché non li pubblichi di nuovo. I turni restano come sono.'),
      {conferma: t('Nascondi')});
    if(!ok) return;
    dates.forEach(d=>pubblicate.delete(d));
  } else {
    dates.forEach(d=>pubblicate.add(d));
  }

  state.publishedShifts = [...pubblicate].sort();
  const salvato = await save('publishedShifts');
  if(!salvato) return;
  renderPubblicazione();
  toast(tutte ? t('Turni nascosti') : t('Turni pubblicati — la brigata li vede'));
}
