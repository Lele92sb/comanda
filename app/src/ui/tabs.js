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
/* LA NAVIGAZIONE SI DICHIARA QUI, TUTTA, E IN UN POSTO SOLO.
 *
 * Prima le schede principali stavano in questo elenco e le sotto-schede nel
 * markup, con le funzioni da chiamare sparse in due `switch` piu' sotto:
 * aggiungere una sezione voleva dire tre modifiche in tre punti diversi, e
 * dimenticarne una non dava nessun errore — la scheda compariva e restava
 * vuota. Adesso una sezione nuova e' UNA RIGA qui dentro.
 *
 * `sezioni` descrive il secondo livello. `render` dice cosa disegnare, e viene
 * chiamato sia entrando nella scheda sia cambiando sotto-scheda: e' l'unico
 * posto dove quel legame e' scritto.
 *
 * `soloChiModifica` resta l'unica decisione su chi vede cosa, e vale anche per
 * le sezioni. Non si duplica nel markup: la riservatezza di questo progetto sta
 * nel database (vedi CLAUDE.md), e una seconda verita' nell'interfaccia prima o
 * poi diverge da quella vera.
 */
const NAV = [
  {id:'dashboard',  label:'Dashboard',     soloChiModifica:true, render:()=>renderDashboard()},
  {id:'ricette',    label:'Ricettario', sezioni:[
    {id:'ingredienti', label:'Ingredienti', render:()=>renderIngredients()},
    {id:'subricette',  label:'Sub-ricette', render:()=>renderSubrecipes()},
    {id:'piatti',      label:'Piatti',      render:()=>renderDishes()},
    {id:'fornitori',   label:'Fornitori',   render:()=>renderSuppliers(),          soloSeVedeCosti:true},
    {id:'fatture',     label:'Fatture',     render:()=>renderStoricoImportazioni(), soloSeVedeCosti:true},
  ]},
  {id:'menu',       label:'Menu',          soloChiModifica:true, render:()=>renderMenuList()},
  {id:'turni',      label:'Turni',         render:()=>{ renderTurni(); renderOreExtra(); renderPubblicazione(); }},
  {id:'richieste',  label:'Richieste',     render:()=>renderRichieste()},
  {id:'assistente', label:'Assistente AI', soloChiModifica:true, render:()=>{ renderKB(); renderChat(); }},
  {id:'benessere',  label:'Benessere',     soloChiModifica:true,
   render:()=>{ renderWbStaffOptions(); renderWbSummary(); renderWbTips(); }},
  // Ultima voce, ed e' voluto: sono le cose che si impostano una volta. Chi
  // apre l'app ogni giorno cerca i turni, non il fabbisogno.
  {id:'impostazioni', label:'Impostazioni cucina', soloChiModifica:true, sezioni:[
    {id:'brigata',    label:'Brigata',           render:()=>renderStaffList()},
    {id:'servizi',    label:'Servizi e turni',   render:()=>{ renderServices(); renderShiftTypes(); renderCopiaConfig(); }},
    {id:'stazioni',   label:'Stazioni',          render:()=>renderStations()},
    {id:'fabbisogno', label:'Fabbisogno',        render:()=>renderNeeds()},
    {id:'quote',      label:'Quote per persona', render:()=>renderQuotas()},
  ]},
];
const TABS = NAV;

function puoVedere(voce){
  if(!Cloud.enabled) return true;
  return !voce.soloChiModifica || Cloud.canWrite();
}

/* Chi vede i costi. Il database non manderebbe comunque niente a chi non li
   vede (`leggi_sezione`): qui si nasconde una porta che dietro non ha niente,
   non si crea una protezione. */
function vedeCosti(){
  return !Cloud.enabled || Cloud.isOwner() ||
         (Cloud.canWrite() && Cloud.kitchen?.editor_vede_costi !== false);
}
const sezioniVisibili = voce =>
  (voce.sezioni || []).filter(sz=> puoVedere(sz) && (!sz.soloSeVedeCosti || vedeCosti()));

/* Disegna le sotto-schede di una voce e le collega. Una volta sola per tutte:
   prima ogni gruppo aveva il suo ciclo copiato, e i due si erano gia' allontanati
   fra loro. */
function montaSezioni(voce){
  const nav = document.getElementById(voce.id + '-subtabs');
  if(!nav) return;
  const sezioni = sezioniVisibili(voce);
  nav.innerHTML = sezioni.map((sz,i)=>
    `<button data-sub="${esc(sz.id)}"${i===0?' class="active"':''}>${esc(t(sz.label))}</button>`).join('');
  nav.querySelectorAll('button').forEach(b=> b.addEventListener('click', ()=>{
    nav.querySelectorAll('button').forEach(x=> x.classList.toggle('active', x===b));
    document.querySelectorAll(`#view-${voce.id} .subview`).forEach(v=>
      v.classList.toggle('active', v.id === voce.prefisso + b.dataset.sub));
    const sz = sezioni.find(x=> x.id === b.dataset.sub);
    if(sz && sz.render) sz.render();
  }));
}

// Il prefisso degli id delle sotto-viste nel markup. Sta qui e non nel markup
// perche' `montaSezioni` deve poterlo comporre senza sapere di chi si tratta.
NAV.forEach(v=>{ v.prefisso = v.id === 'ricette' ? 'sub-' : (v.id === 'impostazioni' ? 'impsub-' : v.id + 'sub-'); });

export function initTabs(){
  const nav = document.getElementById('tabs');
  const visibili = NAV.filter(puoVedere);
  nav.innerHTML = visibili.map(x=>`<button data-tab="${x.id}">${esc(t(x.label))}</button>`).join('');
  nav.querySelectorAll('button').forEach(b=> b.addEventListener('click', ()=>switchTab(b.dataset.tab)));
  visibili.forEach(montaSezioni);
  // Chi ha solo lettura entra dai turni: e' quello che viene a guardare.
  switchTab(visibili.some(v=>v.id==='dashboard') ? 'dashboard' : 'turni');
}

export function switchTab(id){
  const voce = NAV.find(v=> v.id === id);
  if(!voce || !puoVedere(voce)) return;
  document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.toggle('active', b.dataset.tab===id));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active', v.id==='view-'+id));
  if(voce.render) voce.render();
  // Entrando in una scheda con sezioni si disegna quella attiva, non tutte: le
  // altre si disegnano quando le apri. Con una brigata da mille persone
  // disegnarle tutte a ogni cambio di scheda si sentirebbe.
  const sezioni = sezioniVisibili(voce);
  if(sezioni.length){
    const attiva = document.querySelector(`#${voce.id}-subtabs button.active`);
    const sz = sezioni.find(x=> x.id === (attiva && attiva.dataset.sub)) || sezioni[0];
    if(sz.render) sz.render();
  }
}
