import { LINGUE, caricaLingua, dataNumerica, lingua, t } from '../core/lingua.ts';
import { TEMI, scegliTema, tema } from '../core/tema.ts';
import { conferma, esc, toast } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { startApp } from '../main.js';
import './accesso-vista.ts';
import './squadra-vista.ts';
/* ============================= ACCESSO, CUCINA, RUOLI ============================= */
export const gateEl  = document.getElementById('gate');
const gateErr = document.getElementById('gate-error');

export function gateRender(lead, html){
  document.getElementById('gate-lead').textContent = lead;
  document.getElementById('gate-body').innerHTML = html;
  gateErr.classList.add('hidden');
  gateEl.classList.add('show');
}
// Gli errori tecnici di Supabase sono in inglese: in cucina non servono a nessuno.
export function humanError(e){
  const m = (e && e.message) || '';
  if(/Invalid login credentials/i.test(m)) return 'Email o password non corretti.';
  if(/Email not confirmed/i.test(m))       return 'Devi prima confermare l\'email che ti abbiamo inviato.';
  if(/User already registered/i.test(m))   return 'Esiste già un account con questa email — accedi invece di registrarti.';
  if(/Password should be/i.test(m))        return 'La password deve avere almeno 6 caratteri.';
  if(/Codice invito|permessi/i.test(m))    return m;
  if(/FORBIDDEN|row-level security|permission denied/i.test(m))
    return 'Non hai i permessi per questa modifica in questa cucina.';
  if(/Failed to fetch|NetworkError/i.test(m)) return 'Nessuna connessione. Controlla la rete e riprova.';
  return m || 'Qualcosa non ha funzionato. Riprova.';
}

/* Il corpo della schermata d'ingresso, montato una volta e riusato. Le due
   schermate — accesso e scelta della cucina — non convivono mai, quindi il
   contenitore e' lo stesso: quello che cambia e' quale componente ci sta
   dentro. */
function montaNelVaro(tag, titolo){
  document.getElementById('gate-lead').textContent = titolo;
  const corpo = document.getElementById('gate-body');
  let vista = corpo.firstElementChild;
  if(!vista || vista.tagName.toLowerCase() !== tag){
    vista = document.createElement(tag);
    corpo.replaceChildren(vista);
  }
  gateErr.classList.add('hidden');
  gateEl.classList.add('show');
  return vista;
}

export function screenSignIn(mode){
  const nuovo = mode === 'signup';
  const vista = montaNelVaro('cmd-accesso',
    nuovo ? 'Crea il tuo account' : 'Accedi alla tua cucina');
  vista.nuovo = nuovo;
  vista.errore = '';
  vista.inCorso = false;

  if(vista.dataset.collegato) return;
  vista.dataset.collegato = '1';

  vista.addEventListener('accesso-cambia', ()=>
    screenSignIn(vista.nuovo ? 'signin' : 'signup'));

  vista.addEventListener('accesso-entra', async e => {
    const { email, password } = e.detail;
    if(!email || !password){ vista.errore = 'Servono email e password.'; return; }
    vista.errore = '';
    vista.inCorso = true;
    try{
      if(vista.nuovo){
        const { needsConfirmation } = await Cloud.signUp(email, password);
        if(needsConfirmation){
          gateRender('Controlla la posta', `
            <p class="prose">Ti abbiamo inviato un'email a <b>${esc(email)}</b>.
            Aprila e conferma l'indirizzo, poi torna qui e accedi.</p>
            <button class="btn full mt-4" id="g-back">Torna all'accesso</button>`);
          document.getElementById('g-back').addEventListener('click', ()=> screenSignIn('signin'));
          return;
        }
      } else {
        await Cloud.signIn(email, password);
      }
      await afterSignIn();
    }catch(err){
      vista.errore = humanError(err);
    }finally{
      vista.inCorso = false;
    }
  });

  vista.addEventListener('accesso-password-persa', async e => {
    const email = e.detail.email;
    if(!email){ vista.errore = 'Scrivi prima la tua email qui sopra.'; return; }
    try{
      await Cloud.resetPassword(email);
      vista.errore = 'Ti abbiamo inviato un link per reimpostare la password.';
    }catch(err){ vista.errore = humanError(err); }
  });
}

/* IL CODICE D'INVITO PUO' ARRIVARE DALL'INDIRIZZO.

   Chi riceve un invito su WhatsApp non deve ricopiare otto caratteri a mano da
   un messaggio: e' il punto dove si perde per strada meta' della gente, ed e'
   l'unico passaggio dell'app in cui qualcuno si iscrive.

   Sta nel FRAMMENTO (#invito=ABCD2345) e non nella query (?invito=): il
   frammento non parte con la richiesta HTTP, quindi il codice non finisce nei
   log del server ne' nell'intestazione Referer verso terzi. E' un codice che
   da' accesso a una cucina, e va trattato come tale.

   Si toglie dall'indirizzo appena letto, cosi' non resta nella cronologia del
   telefono ne' in un segnalibro fatto per sbaglio. */
function codiceDalLink(){
  try{
    const f = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const codice = (f.get('invito') || '').trim().toUpperCase();
    if(!codice) return '';
    history.replaceState(null, '', location.pathname + location.search);
    return codice;
  }catch(e){ return ''; }
}

function screenKitchens(){
  const vista = montaNelVaro('cmd-cucine',
    Cloud.memberships.length ? 'Scegli la cucina' : 'Nessuna cucina, ancora');

  const nomeRuolo = r => r === 'owner' ? 'titolare'
                       : r === 'editor' ? 'può modificare' : 'sola lettura';
  vista.cucine = Cloud.memberships.map(m => ({
    id: m.kitchen.id,
    nome: m.kitchen.name,
    ruolo: nomeRuolo(m.role),
    soloLettura: m.role === 'viewer',
  }));
  vista.codiceIniziale = codiceDalLink();
  vista.errore = '';
  vista.inCorso = false;

  if(vista.dataset.collegato) return;
  vista.dataset.collegato = '1';

  vista.addEventListener('cucina-scelta', e => {
    Cloud.selectKitchen(e.detail.id);
    startApp();
  });

  vista.addEventListener('cucina-crea', async e => {
    if(!e.detail.nome){ vista.errore = 'Dai un nome alla cucina.'; return; }
    vista.errore = ''; vista.inCorso = true;
    try{ await Cloud.createKitchen(e.detail.nome, e.detail.io); startApp(); }
    catch(err){ vista.errore = humanError(err); }
    finally{ vista.inCorso = false; }
  });

  vista.addEventListener('cucina-entra', async e => {
    if(!e.detail.codice){ vista.errore = 'Inserisci il codice.'; return; }
    vista.errore = ''; vista.inCorso = true;
    try{ await Cloud.joinKitchen(e.detail.codice, e.detail.io); startApp(); }
    catch(err){ vista.errore = humanError(err); }
    finally{ vista.inCorso = false; }
  });

  vista.addEventListener('account-esci', async ()=>{
    await Cloud.signOut();
    screenSignIn('signin');
  });
}

export function screenBlocked(reason){
  const testo = reason === 'suspended'
    ? 'Questa cucina è sospesa. I dati sono al sicuro e tornano disponibili appena viene riattivata.'
    : 'Il periodo di prova di questa cucina è terminato. I dati sono al sicuro e tornano disponibili appena viene attivata.';
  gateRender('Accesso sospeso', `
    <p class="prose">${testo}</p>
    <button class="btn ghost full mt-4" id="g-other">Scegli un'altra cucina</button>
    <div class="center"><button class="gate-switch" id="g-out2">Esci dall'account</button></div>
  `);
  document.getElementById('g-other').addEventListener('click', ()=>{ Cloud.kitchen=null; screenKitchens(); });
  document.getElementById('g-out2').addEventListener('click', async ()=>{ await Cloud.signOut(); screenSignIn('signin'); });
}

export async function afterSignIn(){
  gateRender('Carico le tue cucine…', '');
  await Cloud.loadMemberships();
  const last = Cloud.lastKitchenId();
  const auto = Cloud.memberships.find(m=>m.kitchen.id===last) ||
               (Cloud.memberships.length===1 ? Cloud.memberships[0] : null);
  if(auto){ Cloud.selectKitchen(auto.kitchen.id); return startApp(); }
  screenKitchens();
}

/* ---- Barra account e profilo ---- */

let vistaProfilo = null;

function apriProfilo(){
  if(!vistaProfilo || !vistaProfilo.isConnected){
    vistaProfilo = document.createElement('cmd-profilo');
    collegaProfilo(vistaProfilo);
    document.body.appendChild(vistaProfilo);
  }
  vistaProfilo.nome = Cloud.myDisplayName || '';
  vistaProfilo.email = Cloud.user.email;
  vistaProfilo.ruolo = nomeDelRuolo(Cloud.role);
  vistaProfilo.cucina = Cloud.memberships.length > 1 ? Cloud.kitchen.id : Cloud.kitchen.name;
  vistaProfilo.cucine = Cloud.memberships.map(m => ({ valore: m.kitchen.id, etichetta: m.kitchen.name }));
  vistaProfilo.titolare = Cloud.isOwner();
  vistaProfilo.temi = TEMI.map(x => ({ valore: x.valore, etichetta: t(x.etichetta), simbolo: x.simbolo }));
  vistaProfilo.tema = tema();
  vistaProfilo.lingue = LINGUE.map(l => ({ valore: l.codice, etichetta: l.nome }));
  vistaProfilo.lingua = lingua();
  vistaProfilo.aperto = true;
}

function collegaProfilo(v){
  v.addEventListener('profilo-chiudi', ()=>{ v.aperto = false; });

  v.addEventListener('profilo-nome', async e => {
    try{
      // La RPC, non la scrittura diretta: `setMemberName` tocca
      // `kitchen_members` ed e' riservata al titolare che corregge gli altri.
      // Qui ognuno cambia il PROPRIO nome, anche chi e' in sola lettura.
      await Cloud.setMyDisplayName(e.detail.nome);
      renderAccountBar();
      toast(t('Nome aggiornato'));
    }catch(err){ toast(humanError(err)); }
  });

  // Cambiare cucina cambia TUTTO (brigata, servizi, turni, richieste): si
  // ricarica invece di ridisegnare, cosi' non restano residui della precedente.
  v.addEventListener('profilo-cucina', e => {
    Cloud.selectKitchen(e.detail.id);
    location.reload();
  });

  v.addEventListener('profilo-accessi', ()=>{ v.aperto = false; openTeam(); });
  v.addEventListener('profilo-tema', e => { scegliTema(e.detail.valore); apriProfilo(); });

  v.addEventListener('profilo-lingua', async e => {
    if(e.detail.valore === lingua()) return;
    await caricaLingua(e.detail.valore);
    // Meta' app e' disegnata da JavaScript: ritradurla a caldo lascerebbe
    // testi misti, e ricaricare e' l'unica cosa onesta.
    location.reload();
  });

  v.addEventListener('profilo-esci', async ()=>{
    v.aperto = false;
    await Cloud.signOut();
    screenSignIn('signin');
  });
}

function nomeDelRuolo(r){
  return r === 'owner' ? t('titolare')
       : r === 'editor' ? t('può modificare') : t('sola lettura');
}

export function renderAccountBar(){
  if(!Cloud.enabled) return;
  const bar = document.getElementById('account-bar');
  bar.style.display = 'flex';
  document.getElementById('ab-kitchen').textContent = Cloud.kitchen.name;
  const badge = document.getElementById('ab-role');
  badge.textContent = nomeDelRuolo(Cloud.role);
  badge.className = 'role-badge' + (Cloud.role === 'viewer' ? ' viewer' : '');
  // Il nome scelto, se c'e': l'email e' lunga e non dice niente a colpo d'occhio.
  document.getElementById('ab-email').textContent = Cloud.myDisplayName || Cloud.user.email;
}

/* DOVE ANCHE CHI HA SOLA LETTURA PUÒ PREMERE.
   La guardia qui sotto ferma tutto ciò che assomiglia a una modifica; questi
   sono i posti dove non lo è. Navigare, cambiare periodo, cercare, chiedere
   all'assistente, scaricarsi un backup: nessuna di queste cose tocca i dati
   della cucina.

   QUESTA COSTANTE ERA SPARITA, e con lei la guardia. Il riferimento è rimasto,
   quindi da allora `readonlyGuard` moriva sulla prima riga utile con un
   ReferenceError e non fermava più niente. Non era un buco di sicurezza — a
   difendere ci sono le policy, ed è provato — ma chi ha sola lettura poteva
   premere, vedere la schermata cambiare, e scoprire solo dopo che il
   salvataggio non era andato. L'ha trovata `eslint` alla prima passata. */
const READONLY_ALLOWED = [
  '#tabs', 'nav.subtabs',            // le schede e le sotto-schede
  '.period-bar',                     // settimana/mese, avanti, indietro, oggi
  '#account-bar', '.overlay',        // profilo, cucine, finestre
  '#btn-export',                     // il backup si scarica, non si scrive
  'cmd-ricerca',                     // cercare non è modificare
  'cmd-chat', 'cmd-conoscenza',      // l'assistente: domande, non scritture
].join(', ');

function readonlyGuard(e){
  if(!Cloud.enabled || Cloud.canWrite()) return;
  const t = e.target;
  if(!t.closest || t.closest(READONLY_ALLOWED)) return;
  if(!t.matches('button, input, select, textarea, label[for], .chip-toggle button, .rm')) return;
  e.preventDefault(); e.stopPropagation();
  if(e.type === 'click') toast('Sei in sola lettura: non puoi modificare i dati di questa cucina.');
}
['click','change','input','keydown'].forEach(ev=>document.addEventListener(ev, readonlyGuard, true));

/* ---- Chi ha accesso all'app (titolare) ---- */
const teamEl = document.getElementById('team');
document.getElementById('team-close').addEventListener('click', ()=>teamEl.classList.remove('show'));

// Durate proposte per i codici d'invito. 'mai' = nessuna scadenza.
const DURATE_INVITO = [
  {v:'1', l:'1 giorno'}, {v:'3', l:'3 giorni'}, {v:'7', l:'7 giorni'},
  {v:'14', l:'14 giorni'}, {v:'30', l:'30 giorni'}, {v:'90', l:'90 giorni'},
  {v:'mai', l:'senza scadenza'},
];
// Quanto resta, detto come lo direbbe una persona.
function scadenzaTesto(iso){
  if(!iso) return 'senza scadenza';
  const ms = new Date(iso) - new Date();
  if(ms <= 0) return 'scaduto';
  const giorni = Math.floor(ms/86400000);
  if(giorni >= 1) return 'scade tra ' + giorni + (giorni===1 ? ' giorno' : ' giorni');
  const ore = Math.floor(ms/3600000);
  if(ore >= 1) return 'scade tra ' + ore + (ore===1 ? ' ora' : ' ore');
  return 'scade tra meno di un\'ora';
}

let vistaSquadra = null;

async function openTeam(){
  teamEl.classList.add('show');
  document.getElementById('team-kitchen').textContent = Cloud.kitchen.name;
  document.getElementById('team-error').classList.add('hidden');

  const corpo = document.getElementById('team-body');
  if(!vistaSquadra || !vistaSquadra.isConnected){
    vistaSquadra = document.createElement('cmd-squadra');
    vistaSquadra.durate = DURATE_INVITO.map(d => ({ valore: d.v, etichetta: d.l }));
    collegaSquadra(vistaSquadra);
    corpo.replaceChildren(vistaSquadra);
  }
  vistaSquadra.errore = '';
  vistaSquadra.codiceNuovo = '';

  try{
    const [membri, inviti] = await Promise.all([Cloud.listMembers(), Cloud.listInvites()]);
    const nomeRuolo = r => r === 'owner' ? 'titolare'
                         : r === 'editor' ? 'può modificare' : 'sola lettura';
    vistaSquadra.membri = membri.map(m => ({
      id: m.user_id,
      nome: m.display_name || m.email || 'Senza nome',
      email: m.email || '',
      // «sei tu» al posto della data: chi guarda l'elenco cerca prima di tutto
      // se stesso, per capire cosa può e cosa non può.
      quando: m.user_id === Cloud.user.id
        ? 'sei tu'
        : t('dal {quando}', { quando: dataNumerica(new Date(m.created_at)) }),
      io: m.user_id === Cloud.user.id,
      ruolo: m.user_id === Cloud.user.id ? nomeRuolo(m.role) : m.role,
      // `=== true` e non `||`: finche' la migrazione non e' applicata la
      // colonna non c'e' e il campo arriva `undefined`. Cosi' vale «no».
      gestisceRichieste: m.gestisce_richieste === true,
    }));
    vistaSquadra.inviti = inviti.filter(Cloud.inviteIsPending).map(i => ({
      codice: i.code,
      ruolo: i.role,
      scadenza: scadenzaTesto(i.expires_at),
    }));
    vistaSquadra.vedeCosti = Boolean(Cloud.kitchen.editor_vede_costi);
    vistaSquadra.vedePersonali = Boolean(Cloud.kitchen.editor_vede_personali);
  }catch(e){ teamError(e); }
}

function collegaSquadra(v){
  const dopo = async (fn, msg) => {
    try{ await fn(); if(msg) toast(msg); }
    catch(e){ teamError(e); }
  };

  v.addEventListener('membro-ruolo', e =>
    dopo(()=> Cloud.setMemberRole(e.detail.id, e.detail.ruolo), 'Ruolo aggiornato'));

  v.addEventListener('membro-richieste', e => dopo(async ()=>{
    await Cloud.setMemberGestisceRichieste(e.detail.id, e.detail.acceso);
    await openTeam();
  }, e.detail.acceso ? t('Ora può gestire le richieste') : t('Non gestisce più le richieste')));

  v.addEventListener('membro-nome', e => dopo(async ()=>{
    await Cloud.setMemberName(e.detail.id, e.detail.nome);
    if(e.detail.id === Cloud.user.id){
      Cloud.myDisplayName = e.detail.nome.trim() || null;
      renderAccountBar();
    }
  }, 'Nome aggiornato'));

  v.addEventListener('membro-rimuovi', async e => {
    // Rimuovere qualcuno gli toglie l'accesso subito: meglio una conferma con
    // il nome davanti agli occhi, viste le righe una sotto l'altra.
    const ok = await conferma(`Togliere a ${e.detail.nome} l'accesso a ${Cloud.kitchen.name}?`,
      "Perde solo l'accesso all'app. Se è anche in brigata ci resta, con i suoi turni già assegnati: quella è un'altra cosa e si toglie da Brigata. Potrai riammetterla con un nuovo codice d'invito.",
      {conferma:'Rimuovi', pericolo:true});
    if(!ok) return;
    await dopo(()=> Cloud.removeMember(e.detail.id), 'Persona rimossa');
    openTeam();
  });

  /* La riservatezza NON e' un riquadro nascosto: spegnendo «prezzi e food cost»
     il database smette di mandarli (leggi_sezione). Se il salvataggio fallisce
     l'interruttore va rimesso com'era, altrimenti direbbe una cosa falsa. */
  v.addEventListener('riservatezza', async e => {
    try{
      await Cloud.setRiservatezza({[e.detail.campo]: e.detail.valore});
      toast(t('Impostazione salvata'));
    }catch(err){
      if(e.detail.campo === 'costi') v.vedeCosti = !e.detail.valore;
      else v.vedePersonali = !e.detail.valore;
      teamError(err);
    }
  });

  v.addEventListener('invito-crea', async e => {
    try{
      const codice = await Cloud.createInvite(
        e.detail.ruolo,
        e.detail.giorni === 'mai' ? null : e.detail.giorni);
      await openTeam();
      v.codiceNuovo = codice;
    }catch(err){ teamError(err); }
  });

  v.addEventListener('invito-ruolo', e =>
    dopo(()=> Cloud.updateInvite(e.detail.codice, {role: e.detail.ruolo}), 'Permesso del codice aggiornato'));

  v.addEventListener('invito-giorni', async e => {
    if(!e.detail.giorni) return;
    await dopo(()=> Cloud.updateInvite(e.detail.codice,
      {giorni: e.detail.giorni === 'mai' ? null : e.detail.giorni}), 'Validità aggiornata');
    openTeam();
  });

  v.addEventListener('invito-revoca', async e => {
    await dopo(()=> Cloud.revokeInvite(e.detail.codice), 'Codice annullato');
    openTeam();
  });

  /* Copiare il link. `navigator.clipboard` non c'e' sempre — vuole una pagina
     sicura, e alcuni browser lo negano se la richiesta non parte da un gesto —
     quindi il ripiego: si seleziona il campo e si dice di copiare a mano.
     Un bottone che non fa niente e non lo dice e' peggio di un bottone che non
     c'e'. */
  v.addEventListener('invito-copia', async e => {
    try{
      await navigator.clipboard.writeText(e.detail.link);
      toast(t('Link copiato'));
    }catch(err){
      const campo = v.renderRoot.querySelector('input.link');
      if(campo){ campo.focus(); campo.select(); }
      toast(t('Copialo a mano: è selezionato'));
    }
  });
}

function teamError(e){
  const el = document.getElementById('team-error');
  el.textContent = humanError(e); el.classList.remove('hidden');
}

document.getElementById('ab-profilo').addEventListener('click', apriProfilo);
