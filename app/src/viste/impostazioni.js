// Il collante fra <cmd-impostazioni> e i dati veri. Traduce gli eventi del
// componente in modifiche a `state`, e nient'altro: il componente non sa che
// esista un database, questo file non sa come sia fatta la schermata.
import { save, state } from '../core/state.js';
import { t } from '../core/lingua.ts';
import { VALUTE, impostaValuta, soldi, valutaValida } from '../core/valuta.ts';
import { Cloud } from '../lib/cloud.js';
import './impostazioni-vista.ts';

let vista = null;

export function renderImpostazioni(){
  const el = document.getElementById('impostazioni-panel');
  if(!el) return;

  if(!vista || !vista.isConnected){
    vista = document.createElement('cmd-impostazioni');
    vista.addEventListener('impostazioni-valuta', async e => {
      // Un codice che il browser non sa formattare non entra nei dati: fuori
      // di qui diventerebbe un prezzo senza segno su ogni schermata.
      if(!valutaValida(e.detail.valore)) return;
      state.impostazioni = { ...(state.impostazioni || {}), valuta: e.detail.valore };
      impostaValuta(e.detail.valore);
      const ok = await save('impostazioni');
      // Si ridisegna comunque: se il salvataggio e' stato rifiutato, `save`
      // l'ha gia' detto, e la tendina deve tornare a mostrare il valore vero.
      if(!ok) impostaValuta(state.impostazioni.valuta);
      renderImpostazioni();
      // I prezzi sono su OGNI schermata del ricettario e del menu, e sono gia'
      // disegnati. Ridisegnarli tutti da qui vorrebbe dire che questo file
      // conosce tutte le viste dell'app: si ricarica, che e' una riga sola e
      // non lascia mezza app coi prezzi vecchi.
      if(ok) location.reload();
    });
    el.replaceChildren(vista);
  }

  vista.valute = VALUTE.map(v => ({ valore: v.codice, etichetta: v.codice + ' · ' + t(v.nome) }));
  vista.valuta = state.impostazioni?.valuta || 'EUR';
  vista.esempio = soldi(1234.5);
  vista.soloLettura = Cloud.enabled && !Cloud.canWrite();
}
