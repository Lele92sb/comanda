import { ALLERGENS, save, state, toast, uid } from '../core/state.js';
import { soldi } from '../core/valuta.ts';
import { Cloud } from '../lib/cloud.js';
import { dishTotalCost, itemCost, itemLabel } from './costi.js';
import { resizeImageToDataUrl } from './foto-ricetta.js';
import { montaRighe } from './righe.js';
import './ricette-vista.ts';
import './schede-ricetta-vista.ts';
/* ============================= PIATTI (dishes) ============================= */
// Sopra questa soglia il food cost e' fuori linea. E' la stessa della dashboard
// e del menu: una regola sola, in tre posti che la leggono, non tre soglie che
// col tempo si allontanano.
const SOGLIA_FOOD_COST = 35;

let elenco = null;

function daDisegnare(){
  return state.recipes.map((d, i) => {
    const costo = dishTotalCost(d);
    const target = parseFloat(d.foodCostTargetPct) || 30;
    const suggerito = target > 0 ? costo / (target / 100) : 0;
    const prezzo = parseFloat(d.priceActual) || 0;
    const foodCost = prezzo > 0 ? (costo / prezzo * 100) : null;
    const margine = prezzo - costo;
    return {
      id: d.id,
      nome: d.name,
      numero: 'P' + String(i + 1).padStart(3, '0'),
      categoria: [d.category || '—',
                  d.portionG ? d.portionG + 'g/ml porzione' : '',
                  d.prepMin ? d.prepMin + ' min' : ''].filter(Boolean).join(' · '),
      foto: d.photo || '',
      metriche: [
        { etichetta: 'Costo materia prima', valore: soldi(costo) },
        { etichetta: 'Prezzo suggerito (target ' + target + '%)', valore: soldi(suggerito) },
        { etichetta: 'Prezzo effettivo', valore: soldi(prezzo) },
        { etichetta: 'Food cost reale',
          valore: foodCost !== null ? foodCost.toFixed(1) + '%' : '—',
          tono: foodCost !== null && foodCost > SOGLIA_FOOD_COST ? 'storto' : 'buono' },
        { etichetta: 'Margine effettivo', valore: soldi(margine),
          tono: margine < 0 ? 'storto' : 'buono' },
      ],
      allergeni: (d.allergens || []).slice(),
      voci: (d.items || []).map(it => ({
        nome: itemLabel(it),
        quantita: it.qty + it.unit + ' · ' + soldi(itemCost(it)),
      })),
      procedimento: d.steps || '',
      note: d.notes || '',
    };
  });
}

export function renderDishes(){
  const el = document.getElementById('dish-list');
  if(!el) return;
  if(!elenco || !elenco.isConnected){
    elenco = document.createElement('cmd-piatti');
    elenco.addEventListener('piatto-nuovo', ()=> openDishForm(null));
    elenco.addEventListener('piatto-modifica', e =>
      openDishForm(state.recipes.find(r => r.id === e.detail.id)));
    elenco.addEventListener('piatto-elimina', e => {
      state.recipes = state.recipes.filter(r => r.id !== e.detail.id);
      save('recipes'); renderDishes(); toast('Piatto eliminato');
    });
    elenco.addEventListener('piatto-duplica', e => {
      const originale = state.recipes.find(r => r.id === e.detail.id);
      if(!originale) return;
      const copia = JSON.parse(JSON.stringify(originale));
      copia.id = uid();
      copia.name = originale.name + ' (copia)';
      state.recipes.push(copia); save('recipes'); renderDishes(); toast('Piatto duplicato');
    });
    el.replaceChildren(elenco);
  }
  elenco.piatti = daDisegnare();
  elenco.soloLettura = Cloud.enabled && !Cloud.canWrite();
}

let scheda = null;

function chiudiScheda(){
  const holder = document.getElementById('dish-form-holder');
  if(holder) holder.replaceChildren();
  scheda = null;
}

export function openDishForm(existing, prefill){
  const holder = document.getElementById('dish-form-holder');
  if(!holder) return;
  const base = {id:uid(), name:'', category:'', items:[], portionG:'', foodCostTargetPct:30,
                priceActual:'', allergens:[], steps:'', prepMin:'', notes:'', photo:''};
  const d = existing || Object.assign(base, prefill || {});
  // Copia dei componenti: chi annulla non cambia niente.
  const items = JSON.parse(JSON.stringify(d.items || []));
  let foto = d.photo || '';

  scheda = document.createElement('cmd-scheda-piatto');
  scheda.nuovo = !existing;
  scheda.daFoto = Boolean(prefill && !existing);
  scheda.allergeniPossibili = ALLERGENS;
  scheda.allergeni = (d.allergens || []).slice();
  scheda.foto = foto;
  scheda.campi = {
    nome: d.name || '',
    categoria: d.category || '',
    porzione: d.portionG == null ? '' : String(d.portionG),
    minuti: d.prepMin == null ? '' : String(d.prepMin),
    target: d.foodCostTargetPct == null ? '30' : String(d.foodCostTargetPct),
    prezzo: d.priceActual == null ? '' : String(d.priceActual),
    procedimento: d.steps || '',
    note: d.notes || '',
  };

  const righe = document.createElement('div');
  righe.slot = 'righe';
  scheda.appendChild(righe);

  const rifaiConto = ()=>{
    const costo = items.reduce((n, it) => n + itemCost(it), 0);
    const target = parseFloat(scheda.campi.target) || 30;
    const suggerito = target > 0 ? costo / (target / 100) : 0;
    const prezzo = parseFloat(scheda.campi.prezzo) || 0;
    const foodCost = prezzo > 0 ? (costo / prezzo * 100) : null;
    const margine = prezzo - costo;
    scheda.conto = {
      costo: soldi(costo),
      suggerito: soldi(suggerito),
      foodCost: foodCost !== null ? foodCost.toFixed(1) + '%' : '—',
      margine: soldi(margine),
      fuoriLinea: foodCost !== null && foodCost > SOGLIA_FOOD_COST,
      margineNegativo: margine < 0,
    };
  };

  montaRighe(righe, items, { alCambio: rifaiConto });
  rifaiConto();

  scheda.addEventListener('piatto-conto', rifaiConto);
  scheda.addEventListener('piatto-annulla', chiudiScheda);

  scheda.addEventListener('piatto-foto', async e => {
    // Rimpicciolita PRIMA di salvarla: una foto da telefono pesa quanto tutto
    // il resto della cucina messo insieme, e finisce dentro lo stesso blob JSON
    // che si riscrive a ogni salvataggio.
    foto = await resizeImageToDataUrl(e.detail.file, 500, 0.7);
    scheda.foto = foto;
  });

  scheda.addEventListener('piatto-salva', e => {
    const c = e.detail.campi;
    const idx = state.recipes.findIndex(x => x.id === d.id);
    const aggiornato = Object.assign({}, idx >= 0 ? state.recipes[idx] : {}, {
      id: d.id,
      name: c.nome,
      category: c.categoria.trim(),
      items: items.filter(it => it.kind !== 'custom' || it.name),
      portionG: c.porzione,
      prepMin: c.minuti,
      foodCostTargetPct: c.target,
      priceActual: c.prezzo,
      allergens: e.detail.allergeni,
      steps: c.procedimento.trim(),
      notes: c.note.trim(),
      photo: foto,
    });
    if(idx >= 0) state.recipes[idx] = aggiornato; else state.recipes.push(aggiornato);
    save('recipes'); chiudiScheda(); renderDishes(); toast('Piatto salvato');
  });

  holder.replaceChildren(scheda);
  scheda.updateComplete.then(()=> scheda.renderRoot.querySelector('#p-nome')?.focus());
}

document.getElementById('btn-new-dish').addEventListener('click', ()=> openDishForm(null));
