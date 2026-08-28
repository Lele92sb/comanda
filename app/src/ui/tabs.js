import { renderChat } from '../assistente/chat.js';
import { renderKB } from '../assistente/conoscenza.js';
import { renderSuppliers } from '../ricettario/fornitori.js';
import { renderIngredients } from '../ricettario/ingredienti.js';
import { renderDishes } from '../ricettario/piatti.js';
import { renderSubrecipes } from '../ricettario/subricette.js';
import { renderNeeds } from '../turni/fabbisogno.js';
import { renderOreExtra, renderTurni } from '../turni/griglia.js';
import { renderQuotas } from '../turni/quote.js';
import { renderRichieste } from '../turni/richieste.js';
import { renderCopiaConfig, renderServices, renderShiftTypes } from '../turni/servizi.js';
import { renderStations } from '../turni/stazioni.js';
import { renderWbStaffOptions, renderWbSummary, renderWbTips } from '../viste/benessere.js';
import { renderStaffList } from '../viste/brigata.js';
import { renderDashboard } from '../viste/dashboard.js';
import { renderMenuList } from '../viste/menu.js';
/* ============================= TABS ============================= */
const TABS = [
  {id:'dashboard', label:'Dashboard'},
  {id:'ricette', label:'Ricettario'},
  {id:'menu', label:'Menu'},
  {id:'brigata', label:'Brigata'},
  {id:'turni', label:'Turni'},
  {id:'richieste', label:'Richieste'},
  {id:'assistente', label:'Assistente AI'},
  {id:'benessere', label:'Benessere'},
];
export function initTabs(){
  const nav = document.getElementById('tabs');
  nav.innerHTML = TABS.map(t=>`<button data-tab="${t.id}">${t.label}</button>`).join('');
  nav.querySelectorAll('button').forEach(b=> b.addEventListener('click', ()=>switchTab(b.dataset.tab)));
  switchTab('dashboard');

  document.getElementById('ricette-subtabs').querySelectorAll('button').forEach(b=>{
    b.addEventListener('click', ()=>{
      document.querySelectorAll('#ricette-subtabs button').forEach(x=>x.classList.toggle('active', x===b));
      document.querySelectorAll('#view-ricette .subview').forEach(v=>v.classList.toggle('active', v.id==='sub-'+b.dataset.sub));
      if(b.dataset.sub==='ingredienti') renderIngredients();
      if(b.dataset.sub==='subricette') renderSubrecipes();
      if(b.dataset.sub==='piatti') renderDishes();
      if(b.dataset.sub==='fornitori') renderSuppliers();
    });
  });
  document.getElementById('turni-subtabs').querySelectorAll('button').forEach(b=>{
    b.addEventListener('click', ()=>{
      document.querySelectorAll('#turni-subtabs button').forEach(x=>x.classList.toggle('active', x===b));
      document.querySelectorAll('#view-turni .subview').forEach(v=>v.classList.toggle('active', v.id==='turnisub-'+b.dataset.sub));
      if(b.dataset.sub==='piano'){ renderTurni(); renderOreExtra(); }
      if(b.dataset.sub==='servizi'){ renderServices(); renderShiftTypes(); renderCopiaConfig(); }
      if(b.dataset.sub==='stazioni') renderStations();
      if(b.dataset.sub==='fabbisogno') renderNeeds();
      if(b.dataset.sub==='quote') renderQuotas();
    });
  });
}
export function switchTab(id){
  document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.toggle('active', b.dataset.tab===id));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active', v.id==='view-'+id));
  if(id==='dashboard') renderDashboard();
  if(id==='ricette'){ renderIngredients(); renderSubrecipes(); renderDishes(); renderSuppliers(); }
  if(id==='menu') renderMenuList();
  if(id==='brigata') renderStaffList();
  if(id==='turni'){ renderTurni(); renderOreExtra(); }
  if(id==='richieste') renderRichieste();
  if(id==='assistente') { renderKB(); renderChat(); }
  if(id==='benessere') { renderWbStaffOptions(); renderWbSummary(); renderWbTips(); }
}
