import { CODE_LABEL, WORKING_CODES, save, state } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { REST_CODE } from '../lib/logic.js';
import './quote-vista.ts';
/* ============================= TURNI: quote settimanali per persona =========

   QUESTO FILE E' SOLO IL COLLANTE. Il disegno sta in quote-vista.ts.
   ========================================================================== */

// Codici selezionabili in una quota: i turni di lavoro configurati, più il Riposo.
const QUOTA_CODES = () => WORKING_CODES().concat([REST_CODE]);

function daDisegnare(){
  return state.staff.map(s => ({
    id: s.id,
    nome: s.name,
    stazioni: (s.stations || []).slice(),
    gruppi: (s.weeklyQuota || []).map(g => ({
      conteggio: parseInt(g.count, 10) || 0,
      codici: (g.codes || []).slice(),
    })),
  }));
}

let vista = null;

export function renderQuotas(){
  const el = document.getElementById('quota-panel');
  if(!el) return;
  if(!vista || !vista.isConnected){
    vista = document.createElement('cmd-quote');
    collega(vista);
    el.replaceChildren(vista);
  }
  vista.persone = daDisegnare();
  vista.stazioni = state.stations.map(st => ({ id: st.id, nome: st.name }));
  vista.codici = QUOTA_CODES().map(c => ({ codice: c, etichetta: CODE_LABEL(c) }));
  vista.soloLettura = Cloud.enabled && !Cloud.canWrite();
}

function collega(v){
  const persona = id => state.staff.find(x => x.id === id);

  v.addEventListener('quota-stazione', e => {
    const s = persona(e.detail.personaId);
    if(!s) return;
    const attuali = s.stations || [];
    s.stations = e.detail.acceso
      ? attuali.concat(e.detail.stazioneId).filter((x,i,a)=> a.indexOf(x)===i)
      : attuali.filter(x => x !== e.detail.stazioneId);
    save('staff'); renderQuotas();
  });

  v.addEventListener('quota-gruppo-aggiungi', e => {
    const s = persona(e.detail.personaId);
    if(!s) return;
    s.weeklyQuota = (s.weeklyQuota || []).concat({ count: 1, codes: [REST_CODE] });
    save('staff'); renderQuotas();
  });

  v.addEventListener('quota-gruppo-rimuovi', e => {
    const s = persona(e.detail.personaId);
    if(!s || !s.weeklyQuota) return;
    s.weeklyQuota.splice(e.detail.indice, 1);
    save('staff'); renderQuotas();
  });

  v.addEventListener('quota-conteggio', e => {
    const s = persona(e.detail.personaId);
    const g = s && s.weeklyQuota && s.weeklyQuota[e.detail.indice];
    if(!g) return;
    g.count = e.detail.valore;
    save('staff'); renderQuotas();
  });

  v.addEventListener('quota-codice', e => {
    const s = persona(e.detail.personaId);
    const g = s && s.weeklyQuota && s.weeklyQuota[e.detail.indice];
    if(!g) return;
    const attuali = g.codes || [];
    g.codes = e.detail.acceso
      ? attuali.concat(e.detail.codice).filter((x,i,a)=> a.indexOf(x)===i)
      : attuali.filter(x => x !== e.detail.codice);
    save('staff'); renderQuotas();
  });
}
