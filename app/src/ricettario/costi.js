import { state } from '../core/state.js';
/* ============================= UNIT / COST ENGINE ============================= */
// unità "base" possibili per ingredienti e sub-ricette: kg, l, pz
export function subUnitOptions(base){
  if(base==='kg') return ['g','kg'];
  if(base==='l') return ['ml','l'];
  return ['pz'];
}
function toBaseQty(qty, unit, base){
  qty = parseFloat(qty)||0;
  if(base==='kg') return unit==='g' ? qty/1000 : qty;
  if(base==='l') return unit==='ml' ? qty/1000 : qty;
  return qty;
}
export function ingredientById(id){ return state.ingredients.find(i=>i.id===id); }
export function subrecipeById(id){ return state.subrecipes.find(s=>s.id===id); }

export function ingredientEffectiveCost(ing){
  const yieldFrac = (parseFloat(ing.yieldPct)||100)/100;
  return yieldFrac>0 ? (parseFloat(ing.price)||0)/yieldFrac : 0;
}
export function subrecipeCost(sub, depth){
  depth = depth||0;
  if(depth>6) return {totalCost:0, costPerUnit:0}; // guardia anti-loop
  let totalCost = 0;
  (sub.items||[]).forEach(it=>{ totalCost += itemCost(it, depth+1); });
  const yieldQty = parseFloat(sub.yieldQty)||0;
  const costPerUnit = yieldQty>0 ? totalCost/yieldQty : 0;
  return {totalCost, costPerUnit};
}
export function subrecipeRawWeightKg(sub){
  if(sub.yieldUnit!=='kg') return null;
  let kg = 0; let any=false;
  (sub.items||[]).forEach(it=>{
    if(it.kind==='ingredient'){ const ing = ingredientById(it.refId); if(ing && ing.unit==='kg'){ kg += toBaseQty(it.qty, it.unit, 'kg'); any=true; } }
    if(it.kind==='sub'){ const s2 = subrecipeById(it.refId); if(s2 && s2.yieldUnit==='kg'){ kg += toBaseQty(it.qty, it.unit, 'kg'); any=true; } }
  });
  return any ? kg : null;
}
export function itemCost(item, depth){
  depth = depth||0;
  if(item.kind==='custom'){ return (parseFloat(item.qty)||0) * (parseFloat(item.cost)||0); }
  if(item.kind==='ingredient'){
    const ing = ingredientById(item.refId); if(!ing) return 0;
    const qtyBase = toBaseQty(item.qty, item.unit, ing.unit);
    return qtyBase * ingredientEffectiveCost(ing);
  }
  if(item.kind==='sub'){
    const sub = subrecipeById(item.refId); if(!sub) return 0;
    const qtyBase = toBaseQty(item.qty, item.unit, sub.yieldUnit);
    return qtyBase * subrecipeCost(sub, depth).costPerUnit;
  }
  return 0;
}
export function itemLabel(item){
  if(item.kind==='custom') return item.name;
  if(item.kind==='ingredient'){ const i=ingredientById(item.refId); return i? i.name : '(ingrediente rimosso)'; }
  if(item.kind==='sub'){ const s=subrecipeById(item.refId); return s? s.name+' (sub)' : '(sub-ricetta rimossa)'; }
  return '';
}
export function dishTotalCost(dish){ return (dish.items||[]).reduce((sum,it)=>sum+itemCost(it),0); }
