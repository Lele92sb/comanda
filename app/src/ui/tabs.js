import { Cloud } from '../lib/cloud.js';
import { renderPubblicazione } from '../turni/generatore.js';
import { frase, t } from '../core/lingua.ts';
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
import { renderBenessere } from '../viste/benessere.js';
import { renderStaffList } from '../viste/brigata.js';
import { renderDashboard } from '../viste/dashboard.js';
import { renderImpostazioni } from '../viste/impostazioni.js';
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
  {id:'dashboard',  label:frase('Dashboard'), icona:'📋',     soloChiModifica:true, render:()=>renderDashboard()},
  {id:'ricette',    label:frase('Ricettario'), icona:'📖', sezioni:[
    {id:'ingredienti', label:frase('Ingredienti'), render:()=>renderIngredients()},
    {id:'subricette',  label:frase('Sub-ricette'), render:()=>renderSubrecipes()},
    {id:'piatti',      label:frase('Piatti'),      render:()=>renderDishes()},
    {id:'fornitori',   label:frase('Fornitori'),   render:()=>renderSuppliers(),          soloSeVedeCosti:true},
    {id:'fatture',     label:frase('Fatture'),     render:()=>renderStoricoImportazioni(), soloSeVedeCosti:true},
  ]},
  {id:'menu',       label:frase('Menu'), icona:'🍽',          soloChiModifica:true, render:()=>renderMenuList()},
  {id:'turni',      label:frase('Turni'), icona:'📅',         render:()=>{ renderTurni(); renderOreExtra(); renderPubblicazione(); }},
  {id:'richieste',  label:frase('Richieste'), icona:'✋',     render:()=>renderRichieste()},
  {id:'assistente', label:frase('Assistente AI'), icona:'💬', soloChiModifica:true, render:()=>{ renderKB(); renderChat(); }},
  {id:'benessere',  label:frase('Benessere'), icona:'🌱',     soloChiModifica:true, render:()=>renderBenessere()},
  // Ultima voce, ed e' voluto: sono le cose che si impostano una volta. Chi
  // apre l'app ogni giorno cerca i turni, non il fabbisogno.
  // `breve` e' l'etichetta per la barra in basso, dove ogni voce ha meno di
  // cento pixel: «Impostazioni cucina» ne chiede 105 e finiva tagliata, e
  // un'etichetta tagliata si legge come un guasto, non come un'abbreviazione.
  {id:'impostazioni', label:frase('Impostazioni cucina'), breve:frase('Impostazioni'), icona:'⚙', soloChiModifica:true, sezioni:[
    {id:'brigata',    label:frase('Brigata'),           render:()=>renderStaffList()},
    {id:'generale',   label:frase('Generale'),          render:()=>renderImpostazioni()},
    {id:'servizi',    label:frase('Servizi e turni'),   render:()=>{ renderServices(); renderShiftTypes(); renderCopiaConfig(); }},
    {id:'stazioni',   label:frase('Stazioni'),          render:()=>renderStations()},
    {id:'fabbisogno', label:frase('Fabbisogno'),        render:()=>renderNeeds()},
    {id:'quote',      label:frase('Quote per persona'), render:()=>renderQuotas()},
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

/* IL MENU SI VEDE SEMPRE, a qualunque larghezza. Sotto i 900px sta incollato
   in fondo, sopra e' la colonna a sinistra: non esiste una larghezza in cui
   scorra via insieme alla pagina. Prima fra 768 e 1023 era una fila di voci in
   cima che se ne andava appena si scorreva — proprio sul tablet in verticale,
   che e' lo schermo su cui si compilano i turni appoggiati al passe.

   QUANTE VOCI CI STANNO IN BASSO NON SI CALCOLA: SI MISURA.
   Il primo tentativo divideva la larghezza per 72px a voce. Sembra ragionevole
   e sbaglia comunque, perche' 72px non e' una proprieta' dello schermo — e'
   una proprieta' delle PAROLE, e le parole cambiano. A 599px entravano tutte e
   otto le voci, e «Assistente AI» restava tagliata a meta'. Con lo spagnolo e
   l'inglese in arrivo, ogni costante scelta oggi sarebbe sbagliata in due
   lingue su tre.
   Quindi si disegna la barra, si guarda se qualche parola e' tagliata
   (`scrollWidth > clientWidth`, che e' il browser stesso a dirlo) e in tal caso
   si toglie una voce e si riprova. Due o tre giri, e la barra e' larga esatta.
   Tre voci sono il minimo: sotto, «Altro» conterrebbe piu' dell'app. */
const MINIMO_IN_BASSO = 3;
const menuInBasso = () => window.matchMedia('(max-width:899px)').matches;

/** Vero se il browser dice che almeno un'etichetta non ci sta. */
function qualcosaTagliato(nav){
  const voci = [...nav.querySelectorAll('button')];
  // Una barra non ancora a schermo misura zero, e zero sembrerebbe «tagliato»
  // sempre: si ridurrebbe al minimo ogni volta che questa funzione gira mentre
  // la schermata d'accesso e' ancora davanti. Meglio non decidere che decidere
  // sul niente.
  if(!voci.length || voci.every(b => b.clientWidth === 0)) return false;
  return voci.some(b => b.scrollWidth > b.clientWidth + 1);
}

function chiudiAltro(){ document.querySelector('.tab-altro-sheet')?.remove(); }

function apriAltro(nascoste){
  chiudiAltro();
  const d = document.createElement('div');
  d.className = 'tab-altro-sheet';
  d.innerHTML = nascoste.map(v=>
    `<button data-tab="${v.id}"><span>${v.icona||''}</span>${esc(t(v.label))}</button>`).join('');
  d.querySelectorAll('button').forEach(b=> b.addEventListener('click', ()=>{
    chiudiAltro(); switchTab(b.dataset.tab);
  }));
  document.body.appendChild(d);
  // Un tocco fuori chiude: su un telefono non c'e' il tasto Esc.
  setTimeout(()=> document.addEventListener('click', function fuori(e){
    if(!d.contains(e.target)){ chiudiAltro(); document.removeEventListener('click', fuori); }
  }), 0);
}

export function initTabs(){
  const nav = document.getElementById('tabs');
  const visibili = NAV.filter(puoVedere);
  // Nella colonna a sinistra ci stanno tutte: una lista verticale non finisce
  // lo spazio. In basso ci sta quel che ci sta, e se qualcosa avanza si tiene
  // un posto per «Altro» — che e' una voce anche lui, e va contato.
  const inBasso = menuInBasso();
  // Il nome per esteso resta nel titolo: chi va col mouse, o chi usa un lettore
  // di schermo, sente «Impostazioni cucina» anche dove ci sta «Impostazioni».
  const nome = x => (inBasso && x.breve) ? t(x.breve) : t(x.label);
  const disegnaBarra = inBarra => {
    const nascoste = visibili.filter(v=> !inBarra.includes(v));
    nav.innerHTML = inBarra.map(x=>
        `<button data-tab="${x.id}" data-icona="${esc(x.icona||'')}" title="${esc(t(x.label))}">${esc(nome(x))}</button>`).join('')
      + (nascoste.length ? `<button data-altro data-icona="⋯">${esc(t('Altro'))}</button>` : '');
    return nascoste;
  };

  // Nella colonna a sinistra ci stanno tutte: una lista verticale non finisce
  // lo spazio. In basso si prova, si guarda, e semmai si toglie.
  let inBarra = visibili;
  let nascoste = disegnaBarra(inBarra);
  if(inBasso){
    while(inBarra.length > MINIMO_IN_BASSO && qualcosaTagliato(nav)){
      inBarra = inBarra.slice(0, inBarra.length - 1);
      nascoste = disegnaBarra(inBarra);
    }
  }

  nav.querySelectorAll('button[data-tab]').forEach(b=> b.addEventListener('click', ()=>{
    chiudiAltro(); switchTab(b.dataset.tab);
  }));
  nav.querySelector('[data-altro]')?.addEventListener('click', e=>{
    e.stopPropagation(); apriAltro(nascoste);
  });
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


/* Girando il telefono, o passando da finestra stretta a larga, cambia quante
   voci ci stanno: la barra si rifa'. Senza, restava quella del primo caricamento
   — otto voci schiacciate su un telefono, o «Altro» inutile su un desktop.

   Si aspetta che il trascinamento si fermi: rifarla a ogni evento la farebbe
   lampeggiare. E si ignorano le variazioni sotto gli 8px — su iOS la barra
   dell'indirizzo che si nasconde scorrendo conta come un ridimensionamento, e
   senza questa soglia il menu si rifarebbe a ogni scorrimento di pagina. */
let rifaiBarra;
let ultimaLarghezza = window.innerWidth;
let ultimoInBasso = menuInBasso();
window.addEventListener('resize', ()=>{
  // Trascinando il bordo di una finestra arrivano decine di eventi al secondo.
  // Rifare la barra a ognuno la farebbe lampeggiare, quindi si aspetta che il
  // trascinamento si fermi. Le voci le decide la misura, e la misura si puo'
  // prendere solo dopo aver disegnato: non c'e' un numero da confrontare prima.
  const cambiataDavvero = menuInBasso() !== ultimoInBasso ||
                          Math.abs(window.innerWidth - ultimaLarghezza) > 8;
  if(!cambiataDavvero) return;
  ultimaLarghezza = window.innerWidth;
  ultimoInBasso = menuInBasso();
  clearTimeout(rifaiBarra);
  rifaiBarra = setTimeout(()=>{
    const attiva = document.querySelector('nav.tabs button.active')?.dataset.tab;
    initTabs();
    if(attiva) switchTab(attiva);
  }, 120);
});
