import { lingua, t } from '../core/lingua.ts';
import { CODE_LABEL, SERVICE_LABEL, SHIFT_CONFIG, state } from '../core/state.js';
import { isoDate, parseISO, serviziDelCodice, stazioneDi, stazioniDi } from '../lib/logic.js';
import { dishTotalCost } from '../ricettario/costi.js';
import { weeklyExtraFromTurni } from '../turni/griglia.js';
import { switchTab } from '../ui/tabs.js';
import './dashboard-vista.ts';
/* ============================= DASHBOARD ====================================

   QUESTO FILE E' SOLO IL COLLANTE. Qui stanno le REGOLE — cos'e' un food cost
   fuori linea, chi sta facendo ore oltre il contratto, come si legge la partita
   di una giornata — e il componente riceve gia' le frasi da scrivere.

   La soglia del 35% e il resto possono cambiare senza toccare un pixel.
   ========================================================================== */

/* La partita si legge per SERVIZIO: chi a pranzo sta ai primi e a cena al pass
   fa due partite in una giornata, e «Turni di oggi» deve dirlo. Quando sono la
   stessa — cioe' quasi sempre — la riga resta identica a prima. */
function dettaglioPartite(cell){
  const nomeStazione = id => (state.stations.find(x=> x.id === id)||{}).name || '';
  const partite = stazioniDi(cell, SHIFT_CONFIG());
  if(partite.length <= 1) return partite.length ? ' · ' + nomeStazione(partite[0]) : '';
  return ' · ' + (serviziDelCodice(cell.code, SHIFT_CONFIG())||[]).map(sv=>{
    const n = nomeStazione(stazioneDi(cell, sv));
    return n ? n + ' (' + SERVICE_LABEL(sv).toLowerCase() + ')' : null;
  }).filter(Boolean).join(' / ');
}

function avvisi(){
  const fuori = [];

  // Food cost sopra il 35%: la soglia oltre la quale un piatto, per quanto
  // buono, non paga la cucina che lo fa.
  const costoAlto = state.recipes.filter(d=>{
    const costo = dishTotalCost(d);
    const prezzo = parseFloat(d.priceActual) || 0;
    return prezzo ? (costo / prezzo * 100) > 35 : false;
  });
  if(costoAlto.length){
    fuori.push(t('{n} piatti hanno un food cost reale sopra il 35%: {elenco}.',
      { n: costoAlto.length, elenco: costoAlto.map(r => r.name).join(', ') }));
  }

  const oltreContratto = weeklyExtraFromTurni().filter(o => o.extra > 0);
  if(oltreContratto.length){
    fuori.push(t('Secondo il planning, {chi} fa ore extra rispetto al contratto.',
      { chi: oltreContratto.map(o => o.name).join(', ') }));
  }

  return fuori;
}

let vista = null;

export function renderDashboard(){
  const el = document.getElementById('dash-panel');
  if(!el) return;
  if(!vista || !vista.isConnected){
    vista = document.createElement('cmd-dashboard');
    // «0 piatti in ricettario» e' una domanda travestita da numero, e la
    // risposta sta due schermate piu' in la'. Il componente dice solo dove
    // vuole andare; come ci si va lo sa questo file.
    vista.addEventListener('dashboard-vai', e => switchTab(e.detail.dove));
    el.replaceChildren(vista);
  }

  const oggi = isoDate(new Date());
  vista.avvisi = avvisi();
  vista.numeri = [
    { numero: state.recipes.length,    etichetta: t('Piatti in ricettario'), dove: 'ricette/piatti' },
    { numero: state.subrecipes.length, etichetta: t('Sub-ricette'),          dove: 'ricette/subricette' },
    { numero: state.staff.length,      etichetta: t('Persone in brigata'),   dove: 'impostazioni/brigata' },
    { numero: state.menus.length,      etichetta: t('Menu attivi'),          dove: 'menu' },
  ];
  vista.turniOggi = state.staff.map(s=>{
    const cell = (state.shifts[s.id] || {})[oggi];
    return cell ? { nome: s.name, turno: CODE_LABEL(cell.code) + dettaglioPartite(cell) } : null;
  }).filter(Boolean);
  vista.giorno = parseISO(oggi).toLocaleDateString(lingua(),
    { weekday:'long', day:'numeric', month:'long' });
}
