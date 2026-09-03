import { CODE_LABEL, WORKING_CODES, save, state } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { REST_CODE, bloccaGenerazione, problemiQuota } from '../lib/logic.js';
import { t } from '../core/lingua.ts';
import './quote-vista.ts';
/* ============================= TURNI: quote settimanali per persona =========

   QUESTO FILE E' SOLO IL COLLANTE. Il disegno sta in quote-vista.ts.
   ========================================================================== */

// Codici selezionabili in una quota: i turni di lavoro configurati, più il Riposo.
const QUOTA_CODES = () => WORKING_CODES().concat([REST_CODE]);

/* Da problema a frase. La REGOLA sta in logic.js, dove ha dei test e dove la
   vede anche il generatore; qui si traduce soltanto. Tenerle separate e' cio'
   che impedisce alla schermata e al generatore di dire due cose diverse sulla
   stessa quota. */
function frasi(problemi){
  return problemi.map(p =>
    p.tipo === 'nessun_gruppo'
      ? t('Nessun gruppo: senza, il generatore non le assegna niente.')
    : p.tipo === 'totale'
      // Uno o piu' d'uno sono due frasi, non un numero infilato nella stessa:
      // «1 giorni resterebbero vuoti» si legge come un difetto dell'app, e chi
      // lo legge smette di fidarsi anche del resto della riga. Il dizionario
      // fa cosi' anche altrove («persona la sa fare» / «persone la sanno fare»).
      ? (p.totale < p.atteso
          ? (p.atteso - p.totale === 1
              ? t('{n} turni su 7: un giorno resterebbe vuoto.', { n: p.totale })
              : t('{n} turni su 7: {q} giorni resterebbero vuoti.',
                  { n: p.totale, q: p.atteso - p.totale }))
          : (p.totale - p.atteso === 1
              ? t('{n} turni su 7: uno sparirebbe, e non sapresti quale.', { n: p.totale })
              : t('{n} turni su 7: {q} sparirebbero, e non sapresti quali.',
                  { n: p.totale, q: p.totale - p.atteso })))
    : p.tipo === 'gruppi_senza_codici'
      ? t('Un gruppo non ha nessuna sigla accesa: diventerebbe riposo senza dirtelo.')
    : p.tipo === 'gruppi_a_zero'
      ? t('Un gruppo è a zero turni: non fa niente, si può togliere.')
      : ''
  ).filter(Boolean);
}

function daDisegnare(){
  return state.staff.map(s => {
    const problemi = problemiQuota(s);
    return {
      id: s.id,
      nome: s.name,
      stazioni: (s.stations || []).slice(),
      gruppi: (s.weeklyQuota || []).map(g => ({
        conteggio: parseInt(g.count, 10) || 0,
        codici: (g.codes || []).slice(),
      })),
      problemi: frasi(problemi),
      blocca: bloccaGenerazione(problemi),
    };
  });
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
