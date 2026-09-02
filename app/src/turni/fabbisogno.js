import { SERVICES, SERVICE_LABEL, esc, periodDates, periodLabel, refreshShiftConfig, save, state } from '../core/state.js';
import { contoCapienza } from '../lib/logic.js';
import { coloreStazione } from './griglia.js';
/* ============================= TURNI: fabbisogno per turno/stazione ============================= */
export function renderNeeds(){
  const el = document.getElementById('needs-panel');
  if(!state.stations.length){ el.innerHTML = `<div class="empty">Crea prima le stazioni.</div>`; return; }
  el.innerHTML = `<div class="capienza-box"></div>` + SERVICES().map(sv=>{
    const rows = state.staffingNeeds[sv]||[];
    return `
    <div class="panel">
      <h3>${esc(SERVICE_LABEL(sv))}</h3>
      <div id="needs-rows-${sv}">
        ${rows.map((r,i)=>`
          <div class="ing-row" data-i="${i}" style="grid-template-columns:2fr 1fr auto;">
            <select class="need-station" data-sv="${sv}" data-i="${i}">
              ${state.stations.map(st=>`<option value="${st.id}" ${r.stationId===st.id?'selected':''}>${esc(st.name)}</option>`).join('')}
            </select>
            <input type="number" class="need-count" data-sv="${sv}" data-i="${i}" value="${r.count}" min="0">
            <button type="button" class="need-rm" data-sv="${sv}" data-i="${i}">✕</button>
          </div>`).join('')}
      </div>
      <button class="btn ghost small mt-1" data-addneed="${sv}" type="button">+ Riga</button>
    </div>`;
  }).join('');
  el.querySelectorAll('[data-addneed]').forEach(b=>{
    b.addEventListener('click', ()=>{
      state.staffingNeeds[b.dataset.addneed].push({stationId: state.stations[0].id, count:1});
      save('staffingNeeds'); renderNeeds();
    });
  });
  el.querySelectorAll('.need-station').forEach(sel=>{
    sel.addEventListener('change', ()=>{ state.staffingNeeds[sel.dataset.sv][sel.dataset.i].stationId = sel.value; save('staffingNeeds'); renderCapienza(); });
  });
  el.querySelectorAll('.need-count').forEach(inp=>{
    // Si ridisegna SOLO il conto, non tutto il pannello: renderNeeds() a ogni
    // tasto premuto ricostruirebbe gli <input> e il fuoco se ne andrebbe dopo
    // la prima cifra. Il conto è l'unica cosa che deve seguire il numero.
    inp.addEventListener('input', ()=>{ state.staffingNeeds[inp.dataset.sv][inp.dataset.i].count = parseInt(inp.value)||0; save('staffingNeeds'); renderCapienza(); });
  });
  el.querySelectorAll('.need-rm').forEach(b=>{
    b.addEventListener('click', ()=>{ state.staffingNeeds[b.dataset.sv].splice(parseInt(b.dataset.i),1); save('staffingNeeds'); renderNeeds(); });
  });
  renderCapienza();
}

/* ============================= IL CONTO DI CAPIENZA =============================

   «Io NON guardo giorno per giorno, prima mi faccio un'idea in testa e poi
   inizio.» L'idea in testa è un'aritmetica, e il motore la sa già fare
   (`contoCapienza`, logic.js): per ogni partita quanti posti servono nel
   periodo, quanti ne coprono le persone che la sanno fare con le quote che
   hanno, e quindi quanti turni extra saranno inevitabili.

   Finora quel numero si scopriva DOPO aver premuto il bottone, leggendo le
   scoperture nel riepilogo — cioè quando i turni erano già scritti e la
   settimana precedente già sovrascritta. Qui si legge prima.

   L'unità è il POSTO-SERVIZIO, non la giornata: «due al lavaggio» a pranzo e a
   cena fanno 4 posti in un giorno, 28 in una settimana. Chi conta in giornate
   trova 14 dove lo chef ne conta 28, e la riga direbbe una cosa falsa.

   DUE RIQUADRI, LO STESSO CONTO. Uno sta nella scheda Fabbisogno, dove i numeri
   si cambiano, e si aggiorna a ogni tasto: è lì che serve vedere se alzare il
   fabbisogno di uno sfonda la capienza. L'altro sta sopra il pulsante «Genera
   turni», perché è lì che la decisione si prende. Sono lo stesso HTML: due
   conti diversi per la stessa domanda sarebbero due risposte diverse.

   PERCHÉ È UN NUMERO MINIMO. Il conto è aritmetica sul periodo: non sa che
   giovedì tre persone sono in ferie, né quali richieste sono state approvate.
   Quelle riducono la capienza, mai il contrario — quindi gli extra dichiarati
   qui sono un PAVIMENTO, e il riepilogo dopo la generazione può dirne di più.
   La riga lo scrive, perché «0 extra inevitabili» letto come «0 extra» è una
   promessa che il generatore non ha fatto.
   ============================================================================ */

/* Il riquadro nella scheda del piano non sta nel markup: si aggancia da qui,
   sopra il pulsante che genera. Sopra e non sotto — un conto che si legge dopo
   aver premuto il bottone è il riepilogo, e quello c'è già. */
function montaBoxPiano(){
  const btn = document.getElementById('btn-generate-shifts');
  if(!btn || document.getElementById('capienza-piano')) return;
  const d = document.createElement('div');
  d.id = 'capienza-piano';
  d.className = 'capienza-box';
  // Sopra la RIGA dei pulsanti, non dentro: da quando il pulsante «Svuota» gli
  // sta accanto, `btn.before()` infilava il riquadro dentro la riga e i tre
  // finivano affiancati — su un telefono il bottone si riduceva a 82 pixel.
  const riga = btn.closest('.row') || btn;
  riga.before(d);
}

/* Chi dà una mano a questa partita restando sulla propria. È la stessa
   relazione che legge il motore (`costruisciCoperture`), letta al contrario per
   poterla scrivere nel `title`: senza, «coperti 28 su 21 posti» sulla riga del
   lavaggio è un numero che non si spiega. */
function donatoriDi(stationId){
  return state.stations.filter(x=> (x.copreAnche||[]).includes(stationId)).map(x=> x.name);
}

/* Quanti posti chiede questa partita, servizio per servizio: "Pranzo 2 · Cena 2".
   Nella riga non ci starebbe, nel `title` sì. */
function dettaglioServizi(stationId){
  return SERVICES().map(sv=>{
    const n = (state.staffingNeeds[sv]||[])
      .filter(r=> r.stationId === stationId)
      .reduce((t,r)=> t + (parseInt(r.count)||0), 0);
    return n > 0 ? SERVICE_LABEL(sv) + ' ' + n : null;
  }).filter(Boolean).join(' · ');
}

function rigaHtml(p){
  const st = state.stations.find(x=> x.id === p.stationId);
  const nome = st ? st.name : '—';
  const quanti = p.qualificati.length;
  const pieno = p.domanda > 0 ? Math.min(100, Math.round(100 * p.allocata / p.domanda)) : 100;
  const dono = donatoriDi(p.stationId);
  const titolo = [
    nome + ' — ' + dettaglioServizi(p.stationId) + ' al giorno',
    p.domanda + ' posti nel periodo, ' + p.allocata + ' coperti',
    p.rimbalzo ? p.rimbalzo + ' arrivano dalla mano di ' + dono.join(', ') : null,
    quanti ? quanti + (quanti===1?' persona la sa fare':' persone la sanno fare') : 'nessuno in brigata la sa fare',
  ].filter(Boolean).join(' · ');
  return `<div class="cap-riga${p.mancanti?' scoperta':''}" title="${esc(titolo)}">
    <span class="cap-nome"><i class="ct-pallino" style="--pallino:${coloreStazione(p.stationId)}"></i>${esc(nome)}</span>
    <span class="cap-n">${p.domanda}</span>
    <span class="cap-n">${p.allocata}${p.rimbalzo?'<sup title="di cui dalla mano di un\'altra partita">*</sup>':''}</span>
    <span class="cap-n ${p.mancanti?'manca':'ok'}">${p.mancanti || '—'}</span>
    <span class="cap-barra"><i style="width:${pieno}%"></i></span>
    <span class="cap-chi">${quanti ? quanti + (quanti===1?' persona':' persone') : 'nessuno la sa fare'}</span>
  </div>`;
}

export function renderCapienza(){
  montaBoxPiano();
  const box = [...document.querySelectorAll('.capienza-box')];
  if(!box.length) return;
  const dates = periodDates();
  const conto = contoCapienza(state.staff, state.staffingNeeds, {
    config: refreshShiftConfig(), dates, stazioni: state.stations,
  });
  // Nessun fabbisogno impostato: non c'è niente da contare, e un riquadro di
  // zeri occuperebbe lo schermo per dire «non hai ancora deciso niente».
  if(!conto.partite.length){ box.forEach(b=> b.innerHTML = ''); return; }

  const domanda = conto.partite.reduce((n,p)=> n + p.domanda, 0);
  const coperti = conto.partite.reduce((n,p)=> n + p.allocata, 0);
  const mancano = conto.extraStrutturali;
  const senzaNessuno = conto.partite.filter(p=> !p.qualificati.length);
  // IL CONTO STA CHIUSO, e la riga di sopra dice gia' la sola cosa che serve
  // prima di premere: quanti posti servono, quanti sono coperti, quanti extra
  // saranno inevitabili. Il dettaglio partita per partita si apre se lo chiedi.
  // Prima questo riquadro era alto 1568 pixel su un telefono, ed era il vero
  // motivo per cui per vedere i turni bisognava scorrere: il riepilogo dopo la
  // generazione, che avevo gia' condensato, ne pesava 250.
  const sintesi = `<b class="cap-cifra">${domanda}</b> servono ·
    <b class="cap-cifra${coperti>=domanda?' ok':''}">${coperti}</b> coperti` +
    (mancano ? ` · <b class="cap-cifra alert">${mancano}</b> extra inevitabil${mancano>1?'i':'e'}` : '');
  const html = `
    <div class="panel capienza">
      <div class="riassunto-riga" style="border:0;padding:0;background:none;">
        <span class="wrap-anywhere">${sintesi}</span>
        <button class="btn ghost small" id="btn-conto-dettagli">Il conto</button>
      </div>
      <div id="conto-dettagli" class="hidden mt-3">
      <p class="small-note mt-0">${esc(periodLabel())} · ${conto.giorni} giorni.
        Si contano i <b>posti</b>: una persona, su una partita, in un servizio — «due al lavaggio»
        a pranzo e a cena sono 4 posti al giorno.</p>
      <div class="cap-somma">
        <span><b class="cap-cifra">${domanda}</b> servono</span>
        <span><b class="cap-cifra${coperti>=domanda?' ok':''}">${coperti}</b> coperti</span>
        <span><b class="cap-cifra${mancano?' manca':' ok'}">${mancano}</b> extra inevitabili</span>
      </div>
      <div class="cap-righe">
        <div class="cap-riga intestazione">
          <span class="cap-nome">Partita</span>
          <span class="cap-n">servono</span><span class="cap-n">coperti</span><span class="cap-n">mancano</span>
          <span class="cap-barra"></span><span class="cap-chi">chi la sa fare</span>
        </div>
        ${conto.partite.map(rigaHtml).join('')}
      </div>
      ${mancano ? `<p class="small-note">Quei ${mancano} posti non li copre nessuna quota: il generatore chiamerà qualcuno
        <b>oltre la sua quota</b>, e quel turno costa di più. Si tolgono in tre modi — si assume, si alza la quota
        settimanale di chi già la sa fare, o si abbassa il fabbisogno di quella partita.</p>` : ''}
      ${senzaNessuno.length ? `<p class="small-note text-alert">Nessuno in brigata sa fare
        ${senzaNessuno.map(p=> esc((state.stations.find(x=>x.id===p.stationId)||{}).name || '—')).join(', ')}:
        quei posti restano scoperti comunque, nemmeno un turno extra li chiude. Le partite si assegnano
        nella scheda della persona, in Brigata.</p>` : ''}
      <p class="small-note">È un <b>minimo</b>. Il conto non sa chi sarà in ferie o quali richieste
        sono approvate: quelle tolgono capienza, non ne aggiungono. Dopo la generazione il riepilogo
        può dire più extra di così, mai meno.</p>
      </div>
    </div>`;
  box.forEach(b=>{
    b.innerHTML = html;
    const btn = b.querySelector('#btn-conto-dettagli');
    const det = b.querySelector('#conto-dettagli');
    if(btn && det) btn.addEventListener('click', ()=>{
      const chiuso = det.classList.toggle('hidden');
      btn.textContent = chiuso ? 'Il conto' : 'Chiudi';
    });
  });
}
