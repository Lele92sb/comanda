import { lingua, t } from '../core/lingua.ts';
import { CODE_LABEL, SERVICE_LABEL, SHIFT_CONFIG, esc, state } from '../core/state.js';
import { isoDate, parseISO, serviziDelCodice, stazioneDi, stazioniDi } from '../lib/logic.js';
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
  // La partita si legge per SERVIZIO: chi a pranzo sta ai primi e a cena al pass
  // fa due partite in una giornata, e "Turni di oggi" deve dirlo. Quando sono la
  // stessa - cioe' quasi sempre - la riga resta identica a prima.
  const nomeStazione = id => (state.stations.find(x=> x.id === id)||{}).name || '';
  const dettaglio = cell => {
    const partite = stazioniDi(cell, SHIFT_CONFIG());
    if(partite.length <= 1) return partite.length ? ' · ' + nomeStazione(partite[0]) : '';
    return ' · ' + (serviziDelCodice(cell.code, SHIFT_CONFIG())||[]).map(sv=>{
      const n = nomeStazione(stazioneDi(cell, sv));
      return n ? n + ' (' + SERVICE_LABEL(sv).toLowerCase() + ')' : null;
    }).filter(Boolean).join(' / ');
  };
  const todayShifts = state.staff.map(s=>{
    const cell = (state.shifts[s.id]||{})[todayKey];
    return {name:s.name, code: cell? cell.code : '', dettaglio: cell? dettaglio(cell) : ''};
  }).filter(x=>x.code);
  shiftsEl.innerHTML = todayShifts.length
    ? todayShifts.map(t=>
        `<div class="list-row"><span>${esc(t.name)}</span><span class="mono text-accent">${esc(CODE_LABEL(t.code))}${esc(t.dettaglio)}</span></div>`
      ).join('')
    : `<div class="empty">${esc(t('Nessun turno assegnato per oggi ({giorno})',
        {giorno: parseISO(todayKey).toLocaleDateString(lingua(), {weekday:'long', day:'numeric', month:'long'})}))}</div>`;
}
