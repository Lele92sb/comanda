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
  versione: __VERSIONE__,
};

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
  document.body.classList.toggle('readonly', Cloud.enabled && !Cloud.canWrite());
  renderAccountBar();
  document.getElementById('backup-note').textContent = Cloud.enabled
    ? 'I dati di questa cucina sono salvati sul tuo account e visibili a chi ne fa parte. Il backup serve a portarteli via quando vuoi, o a passare da una cucina all\'altra.'
    : 'I dati restano salvati nel browser che stai usando ora. Se cambi browser, dispositivo, o svuoti la cache, li perdi — esporta un backup ogni tanto per stare tranquillo.';

  initTabs();
}

Cloud.onConflict = function(key){
  toast('Qualcuno ha modificato questa sezione mentre lavoravi — ricarica per vedere la versione aggiornata.');
};

(async function init(){
  if(Cloud.isStaging) document.getElementById('staging-badge').style.display = 'inline-block';
  try{
    const { mode, signedIn } = await Cloud.init();
    if(mode === 'local') return startApp();
    if(signedIn) return afterSignIn();
    screenSignIn('signin');
  }catch(e){
    gateRender('Avvio non riuscito', `<p class="prose">${esc(humanError(e))}</p>`);
  }
})();
