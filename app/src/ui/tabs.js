import { Cloud } from '../lib/cloud.js';
import { renderPubblicazione } from '../turni/generatore.js';
import { t } from '../core/lingua.ts';
import { esc } from '../core/state.js';
import { renderStoricoImportazioni } from '../ricettario/fatture.js';
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
// Le etichette si traducono al momento di disegnarle, non qui: la lingua può
// cambiare, l'elenco delle schede no.
// `soloChiModifica` non e' una misura di sicurezza — quella sta nel database,
// che a chi ha solo lettura non manda proprio i dati. Serve a non mostrargli
// schede che si aprirebbero vuote, il che sembrerebbe un guasto.
const TABS = [
  {id:'dashboard',  label:'Dashboard',     soloChiModifica:true},
  {id:'ricette',    label:'Ricettario'},
  {id:'menu',       label:'Menu',          soloChiModifica:true},
  {id:'brigata',    label:'Brigata',       soloChiModifica:true},
  {id:'turni',      label:'Turni'},
  {id:'richieste',  label:'Richieste'},
  {id:'assistente', label:'Assistente AI', soloChiModifica:true},
  {id:'benessere',  label:'Benessere',     soloChiModifica:true},
];

// Le sotto-schede del ricettario che parlano di soldi.
const SOTTOSCHEDE_RISERVATE = ['fornitori', 'fatture'];

function puoVedere(voce){
  if(!Cloud.enabled) return true;
  return !voce.soloChiModifica || Cloud.canWrite();
}
export function initTabs(){
  const nav = document.getElementById('tabs');
  const visibili = TABS.filter(puoVedere);
  nav.innerHTML = visibili.map(x=>`<button data-tab="${x.id}">${esc(t(x.label))}</button>`).join('');
  nav.querySelectorAll('button').forEach(b=> b.addEventListener('click', ()=>switchTab(b.dataset.tab)));

  // Le sotto-schede di fornitori e fatture spariscono a chi non vede i costi:
  // il database non gliene manderebbe comunque niente.
  const vedeCosti = !Cloud.enabled || Cloud.isOwner() ||
                    (Cloud.canWrite() && Cloud.kitchen?.editor_vede_costi !== false);
  SOTTOSCHEDE_RISERVATE.forEach(nome=>{
    const b = document.querySelector(`#ricette-subtabs [data-sub="${nome}"]`);
    if(b) b.classList.toggle('hidden', !vedeCosti);
  });

  // Chi ha solo lettura entra dai turni: e' quello che viene a guardare.
  switchTab(visibili[0].id === 'dashboard' ? 'dashboard' : 'turni');

  document.getElementById('ricette-subtabs').querySelectorAll('button').forEach(b=>{
    b.addEventListener('click', ()=>{
      document.querySelectorAll('#ricette-subtabs button').forEach(x=>x.classList.toggle('active', x===b));
      document.querySelectorAll('#view-ricette .subview').forEach(v=>v.classList.toggle('active', v.id==='sub-'+b.dataset.sub));
      if(b.dataset.sub==='ingredienti') renderIngredients();
      if(b.dataset.sub==='subricette') renderSubrecipes();
      if(b.dataset.sub==='piatti') renderDishes();
      if(b.dataset.sub==='fornitori') renderSuppliers();
      if(b.dataset.sub==='fatture') renderStoricoImportazioni();
    });
  });
  document.getElementById('turni-subtabs').querySelectorAll('button').forEach(b=>{
    b.addEventListener('click', ()=>{
      document.querySelectorAll('#turni-subtabs button').forEach(x=>x.classList.toggle('active', x===b));
      document.querySelectorAll('#view-turni .subview').forEach(v=>v.classList.toggle('active', v.id==='turnisub-'+b.dataset.sub));
      if(b.dataset.sub==='piano'){ renderTurni(); renderOreExtra(); renderPubblicazione(); }
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
  if(id==='turni'){ renderTurni(); renderOreExtra(); renderPubblicazione(); }
  if(id==='richieste') renderRichieste();
  if(id==='assistente') { renderKB(); renderChat(); }
  if(id==='benessere') { renderWbStaffOptions(); renderWbSummary(); renderWbTips(); }
}
