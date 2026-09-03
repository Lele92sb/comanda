import { save, state, toast, uid } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { ingredientEffectiveCost } from './costi.js';
import './ingredienti-vista.ts';
/* ============================= INGREDIENTI ==================================

   QUESTO FILE E' SOLO IL COLLANTE. L'elenco e' <cmd-ingredienti> e la scheda
   e' <cmd-scheda-ingrediente>; qui resta cio' che loro non possono sapere:
   dove stanno i dati, come si calcola il costo effettivo, e che scegliendo
   «+ Nuovo fornitore» va creato anche il fornitore in anagrafica.
   ========================================================================== */

const soloLettura = () => Cloud.enabled && !Cloud.canWrite();

function daDisegnare(){
  return state.ingredients.map(ing => ({
    id: ing.id,
    nome: ing.name,
    fornitore: ing.supplier || '',
    unita: ing.unit || 'kg',
    prezzo: ing.price == null ? '' : String(ing.price),
    resa: parseFloat(ing.yieldPct) || 100,
    costoEffettivo: ingredientEffectiveCost(ing),
    resaStimata: Boolean(ing.yieldEstimated),
  }));
}

let elenco = null;

export function renderIngredients(){
  const el = document.getElementById('ing-list');
  if(!el) return;
  if(!elenco || !elenco.isConnected){
    elenco = document.createElement('cmd-ingredienti');
    collega(elenco);
    el.replaceChildren(elenco);
  }
  elenco.ingredienti = daDisegnare();
  elenco.soloLettura = soloLettura();
}

function collega(vista){
  vista.addEventListener('ingrediente-nuovo', ()=> apriScheda(null));
  vista.addEventListener('ingrediente-modifica', e =>
    apriScheda(state.ingredients.find(i => i.id === e.detail.id)));
  vista.addEventListener('ingrediente-elimina', e => {
    state.ingredients = state.ingredients.filter(i => i.id !== e.detail.id);
    save('ingredients'); renderIngredients(); toast('Ingrediente eliminato');
  });
}

let scheda = null;

function chiudiScheda(){
  const holder = document.getElementById('ing-form-holder');
  if(holder) holder.replaceChildren();
  scheda = null;
}

function apriScheda(esistente){
  const holder = document.getElementById('ing-form-holder');
  if(!holder) return;
  const ing = esistente || {};

  scheda = document.createElement('cmd-scheda-ingrediente');
  scheda.nuovo = !esistente;
  scheda.fornitori = state.suppliers.map(s => s.name);
  scheda.ingrediente = {
    id: ing.id || uid(),
    nome: ing.name || '',
    fornitore: ing.supplier || '',
    unita: ing.unit || 'kg',
    prezzo: ing.price == null ? '' : String(ing.price),
    resa: String(parseFloat(ing.yieldPct) || 100),
  };

  scheda.addEventListener('ingrediente-annulla', chiudiScheda);
  scheda.addEventListener('ingrediente-salva', e => {
    const g = e.detail.ingrediente;
    // Un fornitore scritto a mano che non esiste ancora entra in anagrafica:
    // altrimenti resterebbe scritto solo dentro questo ingrediente, e la
    // scheda Fornitori direbbe che non c'e'.
    if(g.fornitore && !state.suppliers.some(s => s.name.toLowerCase() === g.fornitore.toLowerCase())){
      state.suppliers.push({ id: uid(), name: g.fornitore, piva:'', phone:'', email:'', address:'' });
      save('suppliers');
    }
    const idx = state.ingredients.findIndex(x => x.id === g.id);
    // Si PARTE dall'ingrediente che c'era: `yieldEstimated` e qualunque campo
    // aggiunto in futuro sopravvivono alla modifica invece di sparire.
    const aggiornato = Object.assign({}, idx >= 0 ? state.ingredients[idx] : {}, {
      id: g.id,
      name: g.nome,
      supplier: g.fornitore,
      unit: g.unita,
      price: g.prezzo,
      yieldPct: g.resa,
    });
    if(idx >= 0) state.ingredients[idx] = aggiornato; else state.ingredients.push(aggiornato);
    save('ingredients'); chiudiScheda(); renderIngredients(); toast('Ingrediente salvato');
  });

  holder.replaceChildren(scheda);
  scheda.updateComplete.then(()=> scheda.renderRoot.querySelector('#g-nome')?.focus());
}

document.getElementById('btn-new-ing').addEventListener('click', ()=> apriScheda(null));
