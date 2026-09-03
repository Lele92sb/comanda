import { ALLERGENS, esc, save, state, toast, uid } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { dishTotalCost, itemCost, itemLabel } from './costi.js';
import { resizeImageToDataUrl } from './foto-ricetta.js';
import { montaRighe } from './righe.js';
import './ricette-vista.ts';
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
        { etichetta: 'Costo materia prima', valore: '€ ' + costo.toFixed(2) },
        { etichetta: 'Prezzo suggerito (target ' + target + '%)', valore: '€ ' + suggerito.toFixed(2) },
        { etichetta: 'Prezzo effettivo', valore: '€ ' + prezzo.toFixed(2) },
        { etichetta: 'Food cost reale',
          valore: foodCost !== null ? foodCost.toFixed(1) + '%' : '—',
          tono: foodCost !== null && foodCost > SOGLIA_FOOD_COST ? 'storto' : 'buono' },
        { etichetta: 'Margine effettivo', valore: '€ ' + margine.toFixed(2),
          tono: margine < 0 ? 'storto' : 'buono' },
      ],
      allergeni: (d.allergens || []).slice(),
      voci: (d.items || []).map(it => ({
        nome: itemLabel(it),
        quantita: it.qty + it.unit + ' · €' + itemCost(it).toFixed(2),
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

export function openDishForm(existing, prefill){
  const holder = document.getElementById('dish-form-holder');
  const base = {id:uid(), name:'', category:'', items:[], portionG:'', foodCostTargetPct:30, priceActual:'', allergens:[], steps:'', prepMin:'', notes:'', photo:''};
  const d = existing || Object.assign(base, prefill||{});
  let items = JSON.parse(JSON.stringify(d.items));
  holder.innerHTML = `
    <div class="panel">
      <h3>${existing?'Modifica piatto':'Nuovo piatto'}</h3>
      ${prefill&&!existing? `<div class="ok-box">Campi precompilati dalla foto — controlla e correggi prima di salvare, specialmente quantità e costi.</div>`:''}
      <label>Nome piatto</label>
      <input type="text" id="d-name" value="${esc(d.name)}" placeholder="es. Tagliatelle al ragù">
      <div class="grid3">
        <div><label>Categoria</label><input type="text" id="d-cat" value="${esc(d.category)}" placeholder="Primi, antipasti..."></div>
        <div><label>Porzione finale (g/ml)</label><input type="number" id="d-portion" value="${d.portionG}"></div>
        <div><label>Tempo di preparazione (min)</label><input type="number" id="d-prep" value="${d.prepMin||''}"></div>
      </div>
      <label>Food cost target (%)</label>
      <input type="number" id="d-target" value="${d.foodCostTargetPct}">
      <label>Allergeni</label>
      <div class="chip-toggle" id="d-allergens">${ALLERGENS.map(a=>`<button type="button" data-a="${a}" class="${(d.allergens||[]).includes(a)?'on':''}">${a}</button>`).join('')}</div>
      <label>Componenti (ingredienti e/o sub-ricette — digita per cercare)</label>
      <div id="d-items"></div>
      <label>Prezzo di vendita effettivo (€)</label>
      <input type="number" step="0.01" id="d-price" value="${d.priceActual}">
      <p class="small-note" id="d-preview">—</p>
      <label>Procedimento</label>
      <textarea id="d-steps">${esc(d.steps)}</textarea>
      <label>Note (impiattamento, varianti...)</label>
      <textarea id="d-notes">${esc(d.notes||'')}</textarea>
      <label>Foto del piatto (opzionale)</label>
      <input type="file" id="d-photo-input" accept="image/*">
      <div id="d-photo-preview">${d.photo? `<img src="${d.photo}" class="thumb">`:''}</div>
      <div class="row gap-3 mt-4">
        <button class="btn" id="d-save">Salva piatto</button>
        <button class="btn ghost" id="d-cancel">Annulla</button>
      </div>
    </div>
  `;
  let photoData = d.photo || '';
  document.getElementById('d-photo-input').addEventListener('change', async (e)=>{
    const file = e.target.files[0]; if(!file) return;
    photoData = await resizeImageToDataUrl(file, 500, 0.7);
    document.getElementById('d-photo-preview').innerHTML = `<img src="${photoData}" class="thumb">`;
  });
  const itemsContainer = document.getElementById('d-items');
  // Vedi la nota nelle sub-ricette: `items` si aggiorna sul posto, e non c'e'
  // piu' nessun DOM da rileggere prima di salvare.
  montaRighe(itemsContainer, items, { alCambio: updateDPreview });
  document.querySelectorAll('#d-allergens button').forEach(b=> b.addEventListener('click', ()=> b.classList.toggle('on')));
  function updateDPreview(){
    const cost = items.reduce((s,it)=>s+itemCost(it),0);
    const target = parseFloat(document.getElementById('d-target').value)||30;
    const sugg = target>0? cost/(target/100) : 0;
    const priceActual = parseFloat(document.getElementById('d-price').value)||0;
    const realFc = priceActual>0 ? (cost/priceActual*100) : null;
    document.getElementById('d-preview').textContent = `Costo materia prima: € ${cost.toFixed(2)} · Prezzo suggerito: € ${sugg.toFixed(2)}${realFc!==null?` · Food cost reale: ${realFc.toFixed(1)}%`:''}`;
  }
  ['d-target','d-price'].forEach(id=> document.getElementById(id).addEventListener('input', updateDPreview));
  updateDPreview();
  document.getElementById('d-cancel').addEventListener('click', ()=> holder.innerHTML='');
  document.getElementById('d-save').addEventListener('click', ()=>{
    const name = document.getElementById('d-name').value.trim();
    if(!name){ toast('Serve almeno il nome del piatto'); return; }
    const newDish = {
      id:d.id, name, category:document.getElementById('d-cat').value.trim(),
      items: items.filter(it=> it.kind!=='custom' || it.name),
      portionG:document.getElementById('d-portion').value, foodCostTargetPct:document.getElementById('d-target').value,
      priceActual:document.getElementById('d-price').value,
      allergens: Array.from(document.querySelectorAll('#d-allergens button.on')).map(b=>b.dataset.a),
      steps:document.getElementById('d-steps').value.trim(),
      prepMin:document.getElementById('d-prep').value,
      notes:document.getElementById('d-notes').value.trim(),
      photo: photoData,
    };
    const idx = state.recipes.findIndex(x=>x.id===d.id);
    if(idx>=0) state.recipes[idx]=newDish; else state.recipes.push(newDish);
    save('recipes'); holder.innerHTML=''; renderDishes(); toast('Piatto salvato');
  });
}
document.getElementById('btn-new-dish').addEventListener('click', ()=> openDishForm(null));
