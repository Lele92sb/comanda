import { afterSignIn, gateEl, gateRender, humanError, renderAccountBar, screenBlocked, screenSignIn } from './account/accesso.js';
import { esc, loadAll, state, toast } from './core/state.js';
import { Cloud } from './lib/cloud.js';
import { initTabs } from './ui/tabs.js';
// Punto di ingresso. Molti moduli registrano i propri ascoltatori quando
// vengono caricati: qui vengono importati tutti, nello stesso ordine in cui
// stavano nel file unico, perché nessun pulsante resti muto.
import './lib/fatture-firmate.js';
import './ricettario/costi.js';
import './ricettario/righe.js';
import './viste/dashboard.js';
import './ricettario/ingredienti.js';
import './ricettario/fornitori.js';
import './ricettario/fatture.js';
import './ricettario/subricette.js';
import './ricettario/piatti.js';
import './ricettario/foto-ricetta.js';
import './viste/menu.js';
import './viste/brigata.js';
import './turni/griglia.js';
import './turni/servizi.js';
import './turni/stazioni.js';
import './turni/fabbisogno.js';
import './turni/quote.js';
import './turni/richieste.js';
import './turni/generatore.js';
import './viste/benessere.js';
import './assistente/conoscenza.js';
import './assistente/chat.js';
import './core/backup.js';
import * as stato from './core/state.js';
import { caricaLingua, lingua, t, traduciMarkup } from './core/lingua.ts';
import { raccogliErrori } from './core/errori.ts';
import { applica as applicaTema, seguiIlSistema } from './core/tema.ts';

/* ============================= DIAGNOSTICA =============================
   I moduli non lasciano più niente su window, ed è giusto così. Ma senza un
   punto d'ingresso resta impossibile capire cosa stia succedendo dentro
   l'app di un cliente al telefono, o verificarla da un test automatico.
   Questo è quel punto, dichiarato apposta: espone solo dati che chi usa
   l'app ha già nel proprio browser, nient'altro.
   ============================================================================ */
window.__comanda = {
  get stato(){ return stato.state; },
  get cucina(){ return Cloud.kitchen; },
  get utente(){ return Cloud.user; },
  get ruolo(){ return Cloud.role; },
  // Il client del database. Esporlo non concede niente: la chiave pubblica sta
  // nel codice della pagina e chiunque può costruirsene uno. Serve invece a
  // verificare che le protezioni tengano davvero, provando a scavalcare
  // l'interfaccia come farebbe qualcuno in malafede.
  get db(){ return Cloud.client; },
  versione: __VERSIONE__,
};

/* ============================= LINGUA ============================= */
// La SCELTA della lingua sta nel profilo (<cmd-profilo>), insieme al tema e a
// tutto il resto: prima erano due sigle appese alla barra in alto, che a ogni
// lingua in piu' sarebbero diventate tre, quattro, cinque. Qui resta solo il
// caricamento all'avvio.
async function preparaLingua(){
  await caricaLingua(lingua());
  traduciMarkup();
  document.documentElement.lang = lingua();
}

/* ============================= INIT ============================= */
export async function startApp(){
  const blocco = Cloud.accessBlock();
  if(blocco) return screenBlocked(blocco);

  gateRender('Carico i dati della cucina…', '');
  try{
    await loadAll();
  }catch(e){
    gateRender('Dati non raggiungibili', `
      <p class="prose">${esc(humanError(e))}</p>
      <button class="btn full mt-4" id="g-retry">Riprova</button>`);
    document.getElementById('g-retry').addEventListener('click', ()=>location.reload());
    return;
  }

  gateEl.classList.remove('show');
  traduciMarkup();          // le viste sono nel markup: si traducono qui
  document.body.classList.toggle('readonly', Cloud.enabled && !Cloud.canWrite());
  renderAccountBar();
  document.getElementById('backup-note').textContent = Cloud.enabled
    ? t('I dati di questa cucina sono salvati sul tuo account e visibili a chi ne fa parte. Il backup serve a portarteli via quando vuoi, o a passare da una cucina all\'altra.')
    : t('I dati restano salvati nel browser che stai usando ora. Se cambi browser, dispositivo, o svuoti la cache, li perdi — esporta un backup ogni tanto per stare tranquillo.');

  initTabs();
}

Cloud.onConflict = function(key){
  toast('Qualcuno ha modificato questa sezione mentre lavoravi — ricarica per vedere la versione aggiornata.');
};

(async function init(){
  // Per primo: un errore durante l'avvio è quello che conta di più, ed è
  // proprio quello che si perderebbe attivando la raccolta più tardi.
  raccogliErrori(() => ({
    cucinaId: Cloud.kitchen?.id,
    utenteId: Cloud.user?.id,
  }));

  // Il tema e' gia' applicato dallo script nella testa: qui si aggiunge solo
  // l'ascolto del sistema, per chi sta su «automatico» e ha il telefono che
  // passa a scuro da solo al tramonto.
  applicaTema();
  seguiIlSistema();

  // La lingua si sceglie prima di disegnare qualsiasi cosa: altrimenti la
  // schermata d'accesso comparirebbe in italiano e cambierebbe sotto gli occhi.
  await preparaLingua();
  // Due avvisi, non uno: la schermata d'accesso copre l'intestazione, e senza
  // il secondo l'avviso mancherebbe proprio mentre si crea l'account.
  // Si usa classList, non style.display: .hidden e' !important e vincerebbe.
  if(Cloud.isStaging){
    for(const id of ['staging-badge','gate-badge']){
      document.getElementById(id).classList.remove('hidden');
    }
  }
  try{
    const { mode, signedIn } = await Cloud.init();
    if(mode === 'local') return startApp();
    if(signedIn) return afterSignIn();
    screenSignIn('signin');
  }catch(e){
    gateRender('Avvio non riuscito', `<p class="prose">${esc(humanError(e))}</p>`);
  }
})();
