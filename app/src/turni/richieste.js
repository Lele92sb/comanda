import { humanError } from '../account/accesso.js';
import { SERVICE_LABEL, conferma, state, toast } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { dataCorta, giornoMese } from '../core/lingua.ts';
import { isoDate, parseISO } from '../lib/logic.js';
import './richieste-vista.ts';
/* ============================= RICHIESTE DEL PERSONALE ============================= */
let RICHIESTE = [];

// La persona della brigata corrispondente a chi sta usando l'app. Il
// collegamento si imposta nell'anagrafica brigata; senza, si possono solo
// vedere le richieste altrui (da titolare) e non inviarne per sé.
function miaSchedaBrigata(){
  if(!Cloud.enabled) return null;
  return state.staff.find(s=> s.userId === Cloud.user.id) || null;
}
function nomeBrigata(staffId){
  const s = state.staff.find(x=>x.id===staffId);
  return s ? s.name : '(persona non più in brigata)';
}
function elencoDate(dal, al){
  const out = []; const fine = parseISO(al);
  for(let d = parseISO(dal); d <= fine; d.setDate(d.getDate()+1)) out.push(isoDate(d));
  return out;
}
const TIPO_LABEL = { ferie:'Ferie', riposo:'Riposo', servizio:'Solo certi servizi' };

// Da richieste approvate a vincoli per il motore. Un blocco (ferie/riposo) ha
// sempre la precedenza su una preferenza di servizio: è più stringente.
export function constraintsFromRequests(){
  const c = {};
  RICHIESTE.filter(r=>r.stato==='approvata').forEach(r=>{
    elencoDate(r.dal, r.al).forEach(d=>{
      c[r.staff_id] = c[r.staff_id] || {};
      const esistente = c[r.staff_id][d];
      if(esistente && esistente.blocked) return;
      if(r.tipo==='ferie')       c[r.staff_id][d] = {blocked:'F'};
      else if(r.tipo==='riposo') c[r.staff_id][d] = {blocked:'R'};
      else                       c[r.staff_id][d] = {services: r.servizi || []};
    });
  });
  return c;
}

export async function caricaRichieste(){
  try{ RICHIESTE = await Cloud.listRequests(); }
  catch(e){ console.error('richieste non caricate', e); RICHIESTE = []; }
}

/* Le richieste che aspettano una decisione. La dashboard le guarda per dirlo
   in prima pagina: sono l'unica cosa nell'app che sta ferma finche' qualcuno
   non decide, e una cosa ferma non si fa notare da sola.

   Legge quello che c'e' GIA' in memoria e non va in rete: la dashboard si
   ridisegna a ogni entrata nella scheda, e una lettura di rete a ogni entrata
   si sentirebbe. Chi vuole il dato fresco chiama prima `caricaRichieste()`. */
export function richiesteInAttesa(){
  return RICHIESTE.filter(r => r.stato === 'in_attesa');
}

let vista = null;

/* Il periodo scritto come lo si legge. Un giorno solo si dice per esteso —
   «giovedì 3 settembre» — perche' e' quello che si va a cercare nel calendario;
   un intervallo si accorcia e si dice quanti giorni sono, che e' la cosa che
   interessa a chi deve coprirli. */
function periodoScritto(dal, al){
  if(dal === al){
    return dataCorta(parseISO(dal));
  }
  const breve = iso => giornoMese(parseISO(iso));
  return breve(dal) + ' → ' + breve(al) + ' (' + elencoDate(dal, al).length + ' giorni)';
}

function daDisegnare(visibili){
  return visibili.map(r => ({
    id: r.id,
    chi: nomeBrigata(r.staff_id),
    dettaglio: r.tipo === 'servizio'
      ? 'solo: ' + (r.servizi || []).map(SERVICE_LABEL).join(', ')
      : TIPO_LABEL[r.tipo],
    periodo: periodoScritto(r.dal, r.al),
    nota: r.nota || '',
    stato: r.stato,
  }));
}

export async function renderRichieste(){
  const el = document.getElementById('req-panel');
  if(!el) return;
  await caricaRichieste();

  const sonoTitolare = !Cloud.enabled || Cloud.isOwner();
  const mia = miaSchedaBrigata();
  // Chi non e' titolare vede solo le proprie: e' il database a non mandargli
  // le altre (policy requests_select). Questo filtro non protegge niente, evita
  // solo di mostrare un elenco che sarebbe comunque vuoto.
  const visibili = sonoTitolare ? RICHIESTE : RICHIESTE.filter(r => mia && r.staff_id === mia.id);

  if(!vista || !vista.isConnected){
    vista = document.createElement('cmd-richieste');
    collega(vista);
    el.replaceChildren(vista);
  }
  vista.sonoTitolare = sonoTitolare;
  vista.mioNome = mia ? mia.name : '';
  vista.collegato = Boolean(mia);
  vista.persone = state.staff.map(s => ({ valore: s.id, etichetta: s.name }));
  vista.servizi = state.services.map(sv => ({ valore: sv.id, etichetta: sv.name }));
  vista.richieste = daDisegnare(visibili);
}

function collega(v){
  const dopo = async (fn, msg) => {
    try{ await fn(); toast(msg); renderRichieste(); }
    catch(e){ toast(humanError(e)); }
  };

  v.addEventListener('richiesta-crea', e => {
    const d = e.detail;
    const staffId = d.staffId || (miaSchedaBrigata() || {}).id;
    if(!staffId){ toast('Manca la persona a cui riferire la richiesta'); return; }
    dopo(()=> Cloud.createRequest({
      staff_id: staffId, dal: d.dal, al: d.al, tipo: d.tipo,
      servizi: d.servizi, nota: d.nota,
    }), Cloud.enabled && !Cloud.isOwner()
        ? 'Richiesta inviata — in attesa di approvazione'
        : 'Richiesta registrata');
  });

  v.addEventListener('richiesta-decidi', e => dopo(
    ()=> Cloud.decideRequest(e.detail.id, e.detail.esito),
    e.detail.esito === 'approvata'
      ? 'Approvata — vincola i prossimi turni generati'
      : 'Rifiutata'));

  v.addEventListener('richiesta-elimina', async e => {
    if(!await conferma('Eliminare questa richiesta?', null, {conferma:'Elimina', pericolo:true})) return;
    dopo(()=> Cloud.deleteRequest(e.detail.id), 'Richiesta eliminata');
  });
}
