import { lingua, t } from '../core/lingua.ts';
import { CODE_LABEL, esc, state } from '../core/state.js';
import { isoDate, parseISO } from '../lib/logic.js';
import { dishTotalCost } from '../ricettario/costi.js';
import { weeklyExtraFromTurni } from '../turni/griglia.js';
/* ============================= DASHBOARD ============================= */
export function renderDashboard(){
  const alertsEl = document.getElementById('dash-alerts');
  const statsEl = document.getElementById('dash-stats');
  const shiftsEl = document.getElementById('dash-shifts');

  const highFc = state.recipes.filter(d=>{
    const cost = dishTotalCost(d); const price = parseFloat(d.priceActual)||0;
    if(!price) return false;
    return (cost/price*100) > 35;
  });
  let alerts = '';
  if(highFc.length) alerts += `<div class="alert-box">⚠ ${esc(t('{n} piatti hanno un food cost reale sopra il 35%: {elenco}.',
    {n: highFc.length, elenco: highFc.map(r=>r.name).join(', ')}))}</div>`;
  const overworked = weeklyExtraFromTurni().filter(o=>o.extra>0);
  if(overworked.length) alerts += `<div class="alert-box">⚠ ${esc(t('Secondo il planning, {chi} fa ore extra rispetto al contratto.',
    {chi: overworked.map(o=>o.name).join(', ')}))}</div>`;
  if(!alerts) alerts = `<div class="ok-box">✓ ${esc(t('Nessun alert. Cucina in equilibrio.'))}</div>`;
  alertsEl.innerHTML = alerts;

  statsEl.innerHTML = `
    <div class="stat"><div class="n">${state.recipes.length}</div><div class="l">${esc(t('Piatti in ricettario'))}</div></div>
    <div class="stat"><div class="n">${state.subrecipes.length}</div><div class="l">${esc(t('Sub-ricette'))}</div></div>
    <div class="stat"><div class="n">${state.staff.length}</div><div class="l">${esc(t('Persone in brigata'))}</div></div>
    <div class="stat"><div class="n">${state.menus.length}</div><div class="l">${esc(t('Menu attivi'))}</div></div>
  `;

  const todayKey = isoDate(new Date());
  const todayShifts = state.staff.map(s=>{
    const cell = (state.shifts[s.id]||{})[todayKey];
    return {name:s.name, code: cell? cell.code : '', stationId: cell? cell.stationId : null};
  }).filter(x=>x.code);
  shiftsEl.innerHTML = todayShifts.length
    ? todayShifts.map(t=>{
        const st = state.stations.find(s=>s.id===t.stationId);
        return `<div class="list-row"><span>${esc(t.name)}</span><span class="mono text-accent">${esc(CODE_LABEL(t.code))}${st?' · '+esc(st.name):''}</span></div>`;
      }).join('')
    : `<div class="empty">${esc(t('Nessun turno assegnato per oggi ({giorno})',
        {giorno: parseISO(todayKey).toLocaleDateString(lingua(), {weekday:'long', day:'numeric', month:'long'})}))}</div>`;
}
