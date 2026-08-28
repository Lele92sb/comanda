// ============================================================================
// Console di amministrazione — avvio e porta d'ingresso.
//
// Pagina separata (/admin.html), non una scheda in mezzo alle altre: chi apre
// l'app per fare i turni non deve avere sotto il pollice il pulsante che
// sospende una cucina.
//
// LA PORTA SI CHIUDE IN CASO DI DUBBIO. is_platform_admin() può fallire per
// tre motivi — supabase/admin.sql non è installato, la sessione è scaduta, la
// rete è caduta — e nessuno dei tre è "sì". Solo un true secco apre, e finché
// non arriva non parte nessuna delle altre chiamate.
//
// Che questa pagina si apra o no, comunque, non protegge niente: le funzioni
// del database controllano i permessi per conto loro. Se qualcuno arrivasse a
// vedere la pagina senza essere amministratore, la troverebbe vuota — ogni
// chiamata gli risponderebbe con un errore di permessi.
// ============================================================================
import { esc } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { raccogliErrori } from '../core/errori.ts';
import { sonoAmministratore } from './api.js';
import { initConsole } from './vista.js';

const gateEl = document.getElementById('gate');

function gateRender(lead, html){
  document.getElementById('gate-lead').textContent = lead;
  document.getElementById('gate-body').innerHTML = html;
  document.getElementById('gate-error').classList.add('hidden');
  gateEl.classList.add('show');
}
function gateError(msg){
  const el = document.getElementById('gate-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function messaggio(e){
  const m = (e && e.message) || '';
  if(/Invalid login credentials/i.test(m)) return 'Email o password non corretti.';
  if(/Failed to fetch|NetworkError/i.test(m)) return 'Nessuna connessione. Controlla la rete e riprova.';
  return m || 'Qualcosa non ha funzionato. Riprova.';
}

/* ---- Diagnostica, come nell'app: si verifica, non si suppone ----
   Espone il client del database e l'esito del controllo, per poter provare
   dalla console del browser cosa succede a chi amministratore non è. Non
   concede niente: la chiave pubblica sta già nella pagina, e le protezioni
   stanno nel database. */
window.__comanda_console = {
  get utente(){ return Cloud.user; },
  get db(){ return Cloud.client; },
  amministratore: false,
  versione: __VERSIONE__,
  ambiente: __AMBIENTE__,
};

function schermataAccesso(){
  gateRender('Console di amministrazione', `
    <label>Email</label>
    <input type="email" id="g-email" autocomplete="email" placeholder="nome@ristorante.it">
    <label>Password</label>
    <input type="password" id="g-pass" autocomplete="current-password">
    <button class="btn full mt-4" id="g-submit">Entra</button>
    <div class="center mt-3"><button class="gate-switch" id="g-app">Vai all'app</button></div>
  `);

  const entra = async () => {
    const email = document.getElementById('g-email').value.trim();
    const pass  = document.getElementById('g-pass').value;
    if(!email || !pass){ gateError('Servono email e password.'); return; }
    const btn = document.getElementById('g-submit');
    btn.disabled = true; btn.textContent = 'Un attimo…';
    try{
      await Cloud.signIn(email, pass);
      await dopoAccesso();
    }catch(e){
      gateError(messaggio(e));
      btn.disabled = false; btn.textContent = 'Entra';
    }
  };
  document.getElementById('g-submit').addEventListener('click', entra);
  document.getElementById('g-pass').addEventListener('keydown', e => { if(e.key === 'Enter') entra(); });
  document.getElementById('g-app').addEventListener('click', () => { location.href = '/'; });
}

// Chi non è amministratore vede questo e nient'altro: nessun numero, nessun
// nome di cucina, nessuna chiamata partita. Non è "il pannello nascosto", è il
// pannello mai chiesto.
function schermataNegata(){
  gateRender('Questa pagina non è per te', `
    <p class="prose">Il tuo account non amministra la piattaforma. Se stai cercando la tua
    cucina, è dall'altra parte.</p>
    <button class="btn full mt-4" id="g-app2">Vai all'app</button>
    <div class="center"><button class="gate-switch" id="g-out">Esci dall'account</button></div>
  `);
  document.getElementById('g-app2').addEventListener('click', () => { location.href = '/'; });
  document.getElementById('g-out').addEventListener('click', async () => {
    await Cloud.signOut(); schermataAccesso();
  });
}

async function dopoAccesso(){
  gateRender('Controllo i permessi…', '');
  const ammesso = await sonoAmministratore();
  window.__comanda_console.amministratore = ammesso;
  if(!ammesso) return schermataNegata();

  document.getElementById('ab-email').textContent = Cloud.user.email;
  document.getElementById('account-bar').style.display = 'flex';
  gateEl.classList.remove('show');
  initConsole();
}

document.getElementById('ab-app').addEventListener('click', () => { location.href = '/'; });
document.getElementById('ab-logout').addEventListener('click', async () => {
  await Cloud.signOut(); location.reload();
});

(async function avvio(){
  raccogliErrori(() => ({ utenteId: Cloud.user ? Cloud.user.id : undefined }));

  if(Cloud.isStaging){
    for(const id of ['staging-badge', 'gate-badge']){
      document.getElementById(id).classList.remove('hidden');
    }
  }

  try{
    const { mode, signedIn } = await Cloud.init();
    // Senza database non esistono account, quindi non esiste nessun
    // amministratore: la console non ha proprio niente da amministrare.
    if(mode === 'local'){
      gateRender('Console non disponibile', `
        <p class="prose">Questa copia dell'app lavora solo nel browser, senza account e senza
        database. La console di amministrazione serve a gestire i clienti: senza clienti,
        non ha niente da mostrare.</p>`);
      return;
    }
    if(signedIn) return dopoAccesso();
    schermataAccesso();
  }catch(e){
    gateRender('Avvio non riuscito', `<p class="prose">${esc(messaggio(e))}</p>`);
  }
})();
