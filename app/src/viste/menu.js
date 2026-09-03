import { save, state, toast, uid } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { dishTotalCost } from '../ricettario/costi.js';
import './menu-vista.ts';
/* ============================= MENU =========================================

   QUESTO FILE E' SOLO IL COLLANTE. Qui sta la regola: sopra il 35% il food cost
   medio e' fuori linea — la stessa soglia della dashboard, in un posto solo.
   ========================================================================== */

const SOGLIA_FOOD_COST = 35;

const soloLettura = () => Cloud.enabled && !Cloud.canWrite();

function daDisegnare(){
  return state.menus.map((m, i) => {
    const portate = m.recipeIds
      .map(id => state.recipes.find(r => r.id === id))
      .filter(Boolean);
    const costoTotale = portate.reduce((s, r) => s + dishTotalCost(r), 0);
    const prezzoTotale = portate.reduce((s, r) => s + (parseFloat(r.priceActual) || 0), 0);
    const medio = prezzoTotale ? (costoTotale / prezzoTotale * 100) : null;
    return {
      id: m.id,
      nome: m.name,
      numero: '#' + String(i + 1).padStart(3, '0'),
      portate: portate.map(r => ({ id: r.id, nome: r.name, prezzo: parseFloat(r.priceActual) || 0 })),
      costoTotale,
      prezzoTotale,
      foodCostMedio: medio,
      fuoriLinea: medio !== null && medio > SOGLIA_FOOD_COST,
    };
  });
}

let elenco = null;

export function renderMenuList(){
  const el = document.getElementById('menu-list');
  if(!el) return;
  if(!elenco || !elenco.isConnected){
    elenco = document.createElement('cmd-menu');
    elenco.addEventListener('menu-nuovo', apriScheda);
    elenco.addEventListener('menu-elimina', e => {
      state.menus = state.menus.filter(m => m.id !== e.detail.id);
      save('menus'); renderMenuList(); toast('Menu eliminato');
    });
    el.replaceChildren(elenco);
  }
  elenco.menu = daDisegnare();
  elenco.soloLettura = soloLettura();
}

let scheda = null;

function chiudiScheda(){
  const holder = document.getElementById('menu-form-holder');
  if(holder) holder.replaceChildren();
  scheda = null;
}

function apriScheda(){
  const holder = document.getElementById('menu-form-holder');
  if(!holder) return;
  // Senza piatti non c'e' niente da comporre, e un modulo con zero scelte
  // sarebbe una domanda a cui non si puo' rispondere.
  if(!state.recipes.length){ toast('Crea prima qualche piatto'); return; }

  scheda = document.createElement('cmd-scheda-menu');
  scheda.piatti = state.recipes.map(r => ({
    id: r.id, nome: r.name, prezzo: parseFloat(r.priceActual) || 0,
  }));
  scheda.addEventListener('menu-annulla', chiudiScheda);
  scheda.addEventListener('menu-salva', e => {
    state.menus.push({ id: uid(), name: e.detail.nome, recipeIds: e.detail.portate });
    save('menus'); chiudiScheda(); renderMenuList(); toast('Menu creato');
  });

  holder.replaceChildren(scheda);
  scheda.updateComplete.then(()=> scheda.renderRoot.querySelector('#m-nome')?.focus());
}

document.getElementById('btn-new-menu').addEventListener('click', apriScheda);
