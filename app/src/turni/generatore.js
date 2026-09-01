import { t } from '../core/lingua.ts';
import { SERVICE_LABEL, conferma, esc, periodDates, refreshShiftConfig, save, setPeriodAnchor, setPeriodMode, shiftPeriod, state, toast } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { DAYS, REST_CODE, codeAllowed, constraintFor, generaMigliore, parseISO, puoFareExtra } from '../lib/logic.js';
import { renderDashboard } from '../viste/dashboard.js';
import { renderOreExtra, renderTurni } from './griglia.js';
import { caricaRichieste, constraintsFromRequests } from './richieste.js';
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
  const missingQuota = state.staff.filter(s=> !(s.weeklyQuota&&s.weeklyQuota.length));
  if(missingQuota.length){ toast('Imposta prima le quote per: '+missingQuota.map(s=>s.name).join(', ')); return; }
  // Chi non ha stazioni non viene pianificato: lo dice il motore nel riepilogo
  // qui sotto (nonPianificabili), non un avviso che sparisce dopo due secondi.

  const dates = periodDates();
  const constraints = constraintsFromRequests();
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
    {config: refreshShiftConfig(), dates, constraints, stazioni: state.stations, eccedenza,
     // I turni gia' salvati servono al motore per un motivo solo: se il periodo
     // taglia una settimana a meta', deve sapere quante ore quella persona ha
     // gia' fatto nei giorni che restano fuori. La settimana e' sempre
     // lunedi-domenica anche quando la finestra ne mostra sei giorni.
     turniEsistenti: state.shifts,
     tentativi: 20, scambi: 400});
  // Si sovrascrivono SOLO le date del periodo: i turni delle altre settimane
  // gia' pianificate non devono sparire perche' se ne rigenera una.
  state.staff.forEach(s=>{
    state.shifts[s.id] = Object.assign(state.shifts[s.id]||{}, newShifts[s.id]||{});
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
      const key = parseISO(sf.day).toLocaleDateString('it-IT',{weekday:'short', day:'numeric', month:'short'});
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
    const chi = quotaNonSpesa.map(q=> `${esc(q.staffName)} (${q.turni})`).join(', ');
    const tot = quotaNonSpesa.reduce((n2,q)=> n2+q.turni, 0);
    premessa += `<div class="ok-box">${tot} turn${tot>1?'i':'o'} di quota non ${tot>1?'sono stati':'e stato'} assegnat${tot>1?'i':'o'}: il fabbisogno impostato non ${tot>1?'li':'lo'} chiedeva — ${chi}. ` +
      `Nella colonna Ore queste persone risultano sotto le ore contrattuali, ed e corretto: prima il conto tornava perche l'app assegnava turni che non coprivano nessun servizio. ` +
      `Se devono comunque lavorare, alza il fabbisogno di quel servizio oppure assegna i turni a mano.</div>`;
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
  logEl.innerHTML = html;
  toast(shortfalls.length ? 'Turni generati — alcune postazioni restano scoperte, vedi dettagli' : (extras.length ? 'Turni generati — con alcuni turni extra' : 'Turni generati — fabbisogno coperto'));
}
document.getElementById('btn-generate-shifts').addEventListener('click', generateRandomShifts);
document.querySelectorAll('#ecc-modo button').forEach(b=> b.addEventListener('click', ()=>{
  const cfg = state.eccedenzaOre || (state.eccedenzaOre = {modo:'auto', giorni:[]});
  cfg.modo = b.dataset.modo;
  save('eccedenzaOre'); renderEccedenza();
}));

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
  const cfg = state.eccedenzaOre || (state.eccedenzaOre = {modo:'auto', giorni:[]});
  document.querySelectorAll('#ecc-modo button').forEach(b=>
    b.classList.toggle('on', b.dataset.modo === cfg.modo));
  document.getElementById('ecc-giorni-wrap').classList.toggle('hidden', cfg.modo !== 'giorni');
  const box = document.getElementById('ecc-giorni');
  box.innerHTML = DAYS.map(g=>{
    const i = (cfg.giorni||[]).indexOf(g);
    return `<button type="button" data-g="${esc(g)}" class="${i>=0?'on':''}">${esc(g)}${i>=0?` <b>${i+1}</b>`:''}</button>`;
  }).join('');
  box.querySelectorAll('button').forEach(b=> b.addEventListener('click', ()=>{
    const g = b.dataset.g;
    cfg.giorni = cfg.giorni || [];
    const i = cfg.giorni.indexOf(g);
    if(i>=0) cfg.giorni.splice(i,1); else cfg.giorni.push(g);
    save('eccedenzaOre'); renderEccedenza();
  }));
}

export function renderPubblicazione(){
  const box = document.getElementById('pubblica-box');
  // Chi non può modificare non pubblica niente: per lui il riquadro non esiste.
  box.classList.toggle('hidden', Cloud.enabled && !Cloud.canWrite());
  if(Cloud.enabled && !Cloud.canWrite()) return;

  const dates = periodDates();
  const pubblicate = new Set(state.publishedShifts || []);
  const quante = dates.filter(d=>pubblicate.has(d)).length;
  const tutte = quante === dates.length;

  document.getElementById('pubblica-stato').textContent = tutte
    ? t('Periodo pubblicato')
    : (quante ? t('Pubblicato in parte: {n} giorni su {tot}', {n: quante, tot: dates.length})
              : t('Non ancora pubblicato'));
  document.getElementById('pubblica-nota').textContent = tutte
    ? t('La brigata vede questi turni.')
    : t('La brigata non vede questi turni finché non li pubblichi.');

  const btn = document.getElementById('btn-pubblica');
  btn.textContent = tutte ? t('Nascondi') : t('Pubblica');
  btn.classList.toggle('ghost', tutte);
}

document.getElementById('btn-pubblica').addEventListener('click', async ()=>{
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
});
