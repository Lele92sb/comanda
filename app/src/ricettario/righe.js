import { esc, state, toast } from '../core/state.js';
import { ingredientById, itemCost, itemLabel, subUnitOptions, subrecipeById } from './costi.js';
/* ============================= ITEM ROW PICKER (riusato in sub-ricette e piatti) — con ricerca ============================= */
let datalistCounter = 0;
function buildSearchDatalist(excludeSubId){
  datalistCounter++;
  const idIng = 'dl-ing-'+datalistCounter, idSub = 'dl-sub-'+datalistCounter;
  const subs = state.subrecipes.filter(s=>s.id!==excludeSubId);
  const html = `
    <datalist id="${idIng}">${state.ingredients.map(i=>`<option value="${esc(i.name)}">`).join('')}</datalist>
    <datalist id="${idSub}">${subs.map(s=>`<option value="${esc(s.name)}">`).join('')}</datalist>
  `;
  return {html, idIng, idSub};
}
export function renderItemRows(container, items, excludeSubId){
  const {html: datalistHtml, idIng, idSub} = buildSearchDatalist(excludeSubId);
  const rowsHtml = items.map((it,i)=>{
    let unitOptions;
    if(it.kind==='custom'){ unitOptions = ['g','kg','ml','l','pz','cucchiaio']; }
    else{
      const base = it.kind==='ingredient' ? (ingredientById(it.refId)||{}).unit : (subrecipeById(it.refId)||{}).yieldUnit;
      unitOptions = subUnitOptions(base||'pz');
    }
    const cost = itemCost(it);
    const currentName = it.kind==='custom' ? '' : itemLabel(it).replace(' (sub)','');
    return `
    <div class="item-row" data-i="${i}">
      <select class="it-kind">
        <option value="custom" ${it.kind==='custom'?'selected':''}>Voce libera</option>
        <option value="ingredient" ${it.kind==='ingredient'?'selected':''}>Ingrediente</option>
        <option value="sub" ${it.kind==='sub'?'selected':''}>Sub-ricetta</option>
      </select>
      ${it.kind==='custom'
        ? `<input type="text" class="it-name" placeholder="nome voce" value="${esc(it.name||'')}">`
        : `<input type="text" class="it-search" list="${it.kind==='ingredient'?idIng:idSub}" placeholder="cerca..." value="${esc(currentName)}">`
      }
      <input type="number" step="0.001" class="it-qty" placeholder="qta" value="${it.qty||''}">
      <select class="it-unit">${unitOptions.map(u=>`<option ${it.unit===u?'selected':''}>${u}</option>`).join('')}</select>
      <button type="button" class="rm" data-rm="${i}">✕</button>
      ${it.kind==='custom' ? `<input type="number" step="0.01" class="it-cost item-row-cost" placeholder="€/unità" value="${it.cost||''}" style="grid-column:1/-1;">` : `<div class="item-row-cost">costo riga: € ${cost.toFixed(3)}</div>`}
    </div>`;
  }).join('');
  container.innerHTML = datalistHtml + rowsHtml;

  container.querySelectorAll('.rm').forEach(btn=>{
    btn.addEventListener('click', ()=>{ items.splice(parseInt(btn.dataset.rm),1); renderItemRows(container, items, excludeSubId); });
  });
  container.querySelectorAll('.it-kind').forEach((sel,i)=>{
    sel.addEventListener('change', ()=>{
      const kind = sel.value;
      if(kind==='custom'){ items[i] = {kind:'custom', name:'', qty:items[i].qty||'', unit:items[i].unit||'g', cost:''}; }
      else{ items[i] = {kind, refId:null, qty:items[i].qty||'', unit:'pz'}; }
      renderItemRows(container, items, excludeSubId);
    });
  });
  container.querySelectorAll('.it-search').forEach((inp,i)=>{
    inp.addEventListener('change', ()=>{
      const it = items[i];
      const list = it.kind==='ingredient' ? state.ingredients : state.subrecipes.filter(s=>s.id!==excludeSubId);
      const match = list.find(x=>x.name.toLowerCase()===inp.value.trim().toLowerCase());
      if(match){
        const base = it.kind==='ingredient' ? match.unit : match.yieldUnit;
        items[i] = {kind:it.kind, refId:match.id, qty:it.qty||'', unit: subUnitOptions(base||'pz')[0]};
      } else {
        items[i].refId = null;
        toast('Nessuna corrispondenza esatta — seleziona dalla lista');
      }
      renderItemRows(container, items, excludeSubId);
    });
  });
}
export function readItemRows(container, items){
  container.querySelectorAll('.item-row').forEach((row,i)=>{
    items[i].qty = row.querySelector('.it-qty').value;
    items[i].unit = row.querySelector('.it-unit').value;
    if(items[i].kind==='custom'){
      items[i].name = row.querySelector('.it-name').value.trim();
      items[i].cost = row.querySelector('.it-cost').value;
    }
  });
}
