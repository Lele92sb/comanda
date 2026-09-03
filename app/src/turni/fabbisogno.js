import { SERVICES, SERVICE_LABEL, periodDates, periodLabel, refreshShiftConfig, save, state } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { contoCapienza } from '../lib/logic.js';
import { coloreStazione } from './griglia.js';
import './capienza-vista.ts';
import './fabbisogno-vista.ts';
/* ============================= TURNI: fabbisogno per turno/stazione =========

   QUESTO FILE E' SOLO IL COLLANTE fra i dati e due componenti:
   <cmd-fabbisogno> (le righe che si modificano) e <cmd-capienza> (il conto).

   ============================= IL CONTO DI CAPIENZA =========================

   «Io NON guardo giorno per giorno, prima mi faccio un'idea in testa e poi
   inizio.» L'idea in testa è un'aritmetica, e il motore la sa già fare
   (`contoCapienza`, logic.js): per ogni partita quanti posti servono nel
   periodo, quanti ne coprono le persone che la sanno fare con le quote che
   hanno, e quindi quanti turni extra saranno inevitabili.

   Finora quel numero si scopriva DOPO aver premuto il bottone, leggendo le
   scoperture nel riepilogo — cioè quando i turni erano già scritti e la
   settimana precedente già sovrascritta. Qui si legge prima.

   DUE RIQUADRI, LO STESSO CONTO. Uno sta nella scheda Fabbisogno, dove i numeri
   si cambiano, e si aggiorna a ogni tasto: è lì che serve vedere se alzare il
   fabbisogno di uno sfonda la capienza. L'altro sta sopra il pulsante «Genera
   turni», perché è lì che la decisione si prende. Sono lo stesso componente:
   due conti diversi per la stessa domanda sarebbero due risposte diverse.

   PERCHÉ È UN NUMERO MINIMO. Il conto è aritmetica sul periodo: non sa che
   giovedì tre persone sono in ferie, né quali richieste sono state approvate.
   Quelle riducono la capienza, mai il contrario — quindi gli extra dichiarati
   qui sono un PAVIMENTO, e il riepilogo dopo la generazione può dirne di più.
   ========================================================================== */

const soloLettura = () => Cloud.enabled && !Cloud.canWrite();

/* ---------------------------------------------------------------- FABBISOGNO */

let vista = null;

export function renderNeeds(){
  const el = document.getElementById('needs-panel');
  if(!el) return;
  if(!vista || !vista.isConnected){
    vista = document.createElement('cmd-fabbisogno');
    collega(vista);
    // Il conto STA SOPRA le righe che lo cambiano: è lì che serve vedere se
    // alzare il lavaggio di uno sfonda la brigata, e vederlo dopo aver
    // scorso dodici righe non serve a niente. Il contenitore lo riempie
    // renderCapienza(), che è la stessa funzione che riempie quello sopra il
    // pulsante «Genera turni».
    const conto = document.createElement('div');
    conto.className = 'capienza-box';
    el.replaceChildren(conto, vista);
  }
  vista.stazioni = state.stations.map(st => ({ id: st.id, nome: st.name }));
  vista.servizi = SERVICES().map(sv => ({
    id: sv,
    nome: SERVICE_LABEL(sv),
    righe: (state.staffingNeeds[sv] || []).map(r => ({
      stazioneId: r.stationId,
      conteggio: parseInt(r.count, 10) || 0,
    })),
  }));
  vista.soloLettura = soloLettura();
  renderCapienza();
}

function collega(v){
  const righe = id => state.staffingNeeds[id] || (state.staffingNeeds[id] = []);

  v.addEventListener('fabbisogno-riga-aggiungi', e => {
    if(!state.stations.length) return;
    righe(e.detail.servizioId).push({ stationId: state.stations[0].id, count: 1 });
    save('staffingNeeds'); renderNeeds();
  });

  v.addEventListener('fabbisogno-riga-rimuovi', e => {
    righe(e.detail.servizioId).splice(e.detail.indice, 1);
    save('staffingNeeds'); renderNeeds();
  });

  v.addEventListener('fabbisogno-stazione', e => {
    const r = righe(e.detail.servizioId)[e.detail.indice];
    if(!r) return;
    r.stationId = e.detail.stazioneId;
    save('staffingNeeds'); renderNeeds();
  });

  // A ogni tasto: si aggiorna SOLO il conto. Niente salvataggio e niente
  // ridisegno delle righe — il campo in cui si sta scrivendo resta dov'è.
  v.addEventListener('fabbisogno-conteggio-provvisorio', e => {
    const r = righe(e.detail.servizioId)[e.detail.indice];
    if(!r) return;
    r.count = e.detail.valore;
    renderCapienza();
  });

  // All'uscita dal campo: si salva, una volta sola, col numero finito.
  v.addEventListener('fabbisogno-conteggio', e => {
    const r = righe(e.detail.servizioId)[e.detail.indice];
    if(!r) return;
    r.count = e.detail.valore;
    save('staffingNeeds'); renderCapienza();
  });
}

/* ------------------------------------------------------------------ CAPIENZA */

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
   poterla scrivere nel suggerimento: senza, «coperti 28 su 21 posti» sulla riga
   del lavaggio è un numero che non si spiega. */
function donatoriDi(stationId){
  return state.stations.filter(x=> (x.copreAnche||[]).includes(stationId)).map(x=> x.name);
}

/* Quanti posti chiede questa partita, servizio per servizio: "Pranzo 2 · Cena 2".
   Nella riga non ci starebbe, nel suggerimento sì. */
function dettaglioServizi(stationId){
  return SERVICES().map(sv=>{
    const n = (state.staffingNeeds[sv]||[])
      .filter(r=> r.stationId === stationId)
      .reduce((t,r)=> t + (parseInt(r.count)||0), 0);
    return n > 0 ? SERVICE_LABEL(sv) + ' ' + n : null;
  }).filter(Boolean).join(' · ');
}

function nomeStazione(id){
  const st = state.stations.find(x=> x.id === id);
  return st ? st.name : '—';
}

export function renderCapienza(){
  montaBoxPiano();
  const contenitori = [...document.querySelectorAll('.capienza-box')];
  if(!contenitori.length) return;

  const dates = periodDates();
  const conto = contoCapienza(state.staff, state.staffingNeeds, {
    config: refreshShiftConfig(), dates, stazioni: state.stations,
  });

  const dati = {
    periodo: periodLabel(),
    giorni: conto.giorni,
    domanda: conto.partite.reduce((n,p)=> n + p.domanda, 0),
    coperti: conto.partite.reduce((n,p)=> n + p.allocata, 0),
    extra: conto.extraStrutturali,
    righe: conto.partite.map(p => ({
      nome: nomeStazione(p.stationId),
      colore: coloreStazione(p.stationId),
      domanda: p.domanda,
      coperti: p.allocata,
      mancanti: p.mancanti,
      rimbalzo: p.rimbalzo,
      qualificati: p.qualificati.length,
      donatori: donatoriDi(p.stationId),
      servizi: dettaglioServizi(p.stationId),
    })),
    senzaNessuno: conto.partite.filter(p=> !p.qualificati.length).map(p=> nomeStazione(p.stationId)),
  };

  // Due contenitori, due componenti: ognuno si ricorda da solo se e' aperto o
  // chiuso. Prima erano la stessa stringa di HTML infilata in due posti, con
  // dentro due elementi che portavano lo stesso id.
  for(const box of contenitori){
    let c = box.querySelector('cmd-capienza');
    if(!c){ c = document.createElement('cmd-capienza'); box.replaceChildren(c); }
    c.conto = dati;
  }
}
