import { t } from '../core/lingua.ts';
import { chiediTesto, conferma, esc, toast } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { startApp } from '../main.js';
/* ============================= ACCESSO, CUCINA, RUOLI ============================= */
export const gateEl  = document.getElementById('gate');
const gateErr = document.getElementById('gate-error');

export function gateRender(lead, html){
  document.getElementById('gate-lead').textContent = lead;
  document.getElementById('gate-body').innerHTML = html;
  gateErr.classList.add('hidden');
  gateEl.classList.add('show');
}
function gateError(msg){
  gateErr.textContent = msg;
  gateErr.classList.remove('hidden');
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

export function screenSignIn(mode){
  const isNew = mode === 'signup';
  gateRender(isNew ? 'Crea il tuo account' : 'Accedi alla tua cucina', `
    <label>Email</label>
    <input type="email" id="g-email" autocomplete="email" placeholder="nome@ristorante.it">
    <label>Password</label>
    <input type="password" id="g-pass" autocomplete="${isNew?'new-password':'current-password'}" placeholder="${isNew?'almeno 6 caratteri':''}">
    <button class="btn full mt-4" id="g-submit">${isNew?'Crea account':'Entra'}</button>
    <div class="center mt-3">
      <button class="gate-switch" id="g-switch">${isNew?'Ho già un account, accedi':'Non ho un account, creane uno'}</button>
    </div>
    ${isNew?'':'<div class="center"><button class="gate-switch" id="g-forgot">Ho dimenticato la password</button></div>'}
  `);

  const submit = async ()=>{
    const email = document.getElementById('g-email').value.trim();
    const pass  = document.getElementById('g-pass').value;
    if(!email || !pass){ gateError('Servono email e password.'); return; }
    const btn = document.getElementById('g-submit');
    btn.disabled = true; btn.textContent = 'Un attimo…';
    try{
      if(isNew){
        const { needsConfirmation } = await Cloud.signUp(email, pass);
        if(needsConfirmation){
          gateRender('Controlla la posta', `
            <p class="prose">Ti abbiamo inviato un'email a <b>${esc(email)}</b>.
            Aprila e conferma l'indirizzo, poi torna qui e accedi.</p>
            <button class="btn full mt-4" id="g-back">Torna all'accesso</button>`);
          document.getElementById('g-back').addEventListener('click', ()=>screenSignIn('signin'));
          return;
        }
      } else {
        await Cloud.signIn(email, pass);
      }
      await afterSignIn();
    }catch(e){
      gateError(humanError(e));
      btn.disabled = false; btn.textContent = isNew?'Crea account':'Entra';
    }
  };

  document.getElementById('g-submit').addEventListener('click', submit);
  document.getElementById('g-pass').addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
  document.getElementById('g-switch').addEventListener('click', ()=>screenSignIn(isNew?'signin':'signup'));
  const forgot = document.getElementById('g-forgot');
  if(forgot) forgot.addEventListener('click', async ()=>{
    const email = document.getElementById('g-email').value.trim();
    if(!email){ gateError('Scrivi prima la tua email qui sopra.'); return; }
    try{ await Cloud.resetPassword(email); gateError('Ti abbiamo inviato un link per reimpostare la password.'); }
    catch(e){ gateError(humanError(e)); }
  });
}

function screenKitchens(){
  const rows = Cloud.memberships.map(m=>`
    <button class="kitchen-row" data-k="${esc(m.kitchen.id)}">
      <span>${esc(m.kitchen.name)}</span>
      <span class="role-badge ${m.role==='viewer'?'viewer':''}">${m.role==='owner'?'titolare':(m.role==='editor'?'può modificare':'sola lettura')}</span>
    </button>`).join('');

  gateRender(Cloud.memberships.length ? 'Scegli la cucina' : 'Nessuna cucina, ancora', `
    ${rows}
    <div class="panel mt-4" >
      <h3>Apri una nuova cucina</h3>
      <label>Nome della cucina</label>
      <input type="text" id="g-kname" placeholder="es. Trattoria del Porto">
      <label>Come ti chiamano</label>
      <input type="text" id="g-myname" placeholder="es. Emanuele, chef">
      <button class="btn full mt-3" id="g-create">Crea cucina</button>
    </div>
    <div class="panel">
      <h3>Entra con un codice d'invito</h3>
      <p class="small-note mt-0" >Te lo dà chi gestisce la cucina.</p>
      <label>Codice</label>
      <input type="text" id="g-code" placeholder="ABCD2345" style="text-transform:uppercase;letter-spacing:2px;">
      <label>Come ti chiamano</label>
      <input type="text" id="g-joinname" placeholder="es. Marco, secondo">
      <p class="small-note mt-1" >Serve a chi gestisce la cucina per riconoscerti nell'elenco di chi ha accesso.</p>
      <button class="btn ghost full mt-3" id="g-join">Entra nella cucina</button>
    </div>
    <div class="center"><button class="gate-switch" id="g-out">Esci dall'account</button></div>
  `);

  gateEl.querySelectorAll('.kitchen-row').forEach(b=>{
    b.addEventListener('click', ()=>{ Cloud.selectKitchen(b.dataset.k); startApp(); });
  });
  document.getElementById('g-create').addEventListener('click', async ()=>{
    const name = document.getElementById('g-kname').value.trim();
    if(!name){ gateError('Dai un nome alla cucina.'); return; }
    try{ await Cloud.createKitchen(name, document.getElementById('g-myname').value); startApp(); }
    catch(e){ gateError(humanError(e)); }
  });
  document.getElementById('g-join').addEventListener('click', async ()=>{
    const code = document.getElementById('g-code').value.trim().toUpperCase();
    if(!code){ gateError('Inserisci il codice.'); return; }
    try{ await Cloud.joinKitchen(code, document.getElementById('g-joinname').value); startApp(); }
    catch(e){ gateError(humanError(e)); }
  });
  document.getElementById('g-out').addEventListener('click', async ()=>{ await Cloud.signOut(); screenSignIn('signin'); });
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

/* ---- Barra account e sola lettura ---- */
export function renderAccountBar(){
  if(!Cloud.enabled) return;
  const bar = document.getElementById('account-bar');
  bar.style.display = 'flex';
  // Con più cucine il nome diventa un menu: chi ne gestisce quattro cambia di
  // continuo, e passare dalla schermata iniziale ogni volta è una tortura.
  const sel = document.getElementById('ab-kitchen-sel');
  const nome = document.getElementById('ab-kitchen');
  // La visibilità passa dalle classi: .hidden è marcata !important e uno
  // style.display non riuscirebbe a scavalcarla.
  const piùCucine = Cloud.memberships.length > 1;
  if(piùCucine){
    sel.innerHTML = Cloud.memberships.map(m=>
      `<option value="${esc(m.kitchen.id)}" ${m.kitchen.id===Cloud.kitchen.id?'selected':''}>${esc(m.kitchen.name)}</option>`).join('');
  } else {
    nome.textContent = Cloud.kitchen.name;
  }
  sel.classList.toggle('hidden', !piùCucine);
  nome.classList.toggle('hidden', piùCucine);

  // Il nome scelto, se c'è: l'email è lunga e non dice niente a colpo d'occhio.
  document.getElementById('ab-email').textContent = Cloud.myDisplayName || Cloud.user.email;
  const badge = document.getElementById('ab-role');
  badge.textContent = Cloud.role==='owner' ? t('titolare')
                    : (Cloud.role==='editor' ? t('può modificare') : t('sola lettura'));
  badge.className = 'role-badge' + (Cloud.role==='viewer' ? ' viewer' : '');
  document.getElementById('ab-team').classList.toggle('hidden', !Cloud.isOwner());
}

// I comandi di navigazione e l'assistente personale restano usabili anche in
// sola lettura: quello che si blocca è tutto ciò che modificherebbe i dati.
const READONLY_ALLOWED = '#tabs, nav.subtabs, #chat-input, #chat-send, #btn-export, #account-bar, .overlay';
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
function DURATA_OPTIONS(scelta){
  return DURATE_INVITO.map(d=>
    `<option value="${d.v}" ${String(scelta)===d.v?'selected':''}>${d.l}</option>`).join('');
}
function ROLE_OPTIONS(scelto){
  return [['editor','può modificare'],['viewer','sola lettura']].map(([v,l])=>
    `<option value="${v}" ${scelto===v?'selected':''}>${l}</option>`).join('');
}
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

async function openTeam(){
  teamEl.classList.add('show');
  document.getElementById('team-kitchen').textContent = Cloud.kitchen.name;
  document.getElementById('team-error').classList.add('hidden');
  document.getElementById('team-body').innerHTML = '<div class="empty">Carico…</div>';
  try{
    const [members, invites] = await Promise.all([Cloud.listMembers(), Cloud.listInvites()]);
    const pending = invites.filter(Cloud.inviteIsPending);
    document.getElementById('team-body').innerHTML = `
      <div class="panel">
        <h3>Chi ha accesso all'app</h3>
        <p class="small-note mt-0">Sono gli account che possono aprire Comanda su questa cucina. Chi ci lavora davvero si gestisce in Brigata: le due cose non coincidono — puoi avere accesso senza mai essere sui turni, ed essere sui turni senza avere un account.</p>
        ${members.map(m=>{
          const io = m.user_id === Cloud.user.id;
          const nome = m.display_name || m.email || 'Senza nome';
          return `
          <div class="panel subpanel" >
            <div class="row top between gap-3">
              <div class="wrap-anywhere">
                <div class="bold wrap-anywhere">${esc(nome)}</div>
                <div class="contact wrap-anywhere" >${esc(m.email||'')}${
                  io ? ' · sei tu' : ' · dal ' + new Date(m.created_at).toLocaleDateString('it-IT')}</div>
              </div>
              ${io
                ? `<span class="role-badge">${m.role==='owner'?'titolare':(m.role==='editor'?'può modificare':'sola lettura')}</span>`
                : `<select class="tm-role" data-u="${esc(m.user_id)}" style="width:auto;flex-shrink:0;">
                     <option value="editor" ${m.role==='editor'?'selected':''}>può modificare</option>
                     <option value="viewer" ${m.role==='viewer'?'selected':''}>sola lettura</option>
                     <option value="owner"  ${m.role==='owner'?'selected':''}>titolare</option>
                   </select>`}
            </div>
            <div class="grid2 mt-2" >
              <input type="text" class="tm-name" data-u="${esc(m.user_id)}"
                     value="${esc(m.display_name||'')}" placeholder="nome nell'app, es. Marco secondo">
              ${io ? '' : `<button class="btn ghost small tm-rm text-alert" data-u="${esc(m.user_id)}"
                           data-n="${esc(nome)}">Rimuovi dalla cucina</button>`}
            </div>
          </div>`;}).join('')}
      </div>
      <div class="panel">
        <h3>Cosa vede chi può modificare</h3>
        <p class="small-note mt-0">Chi ha solo lettura vede i turni pubblicati, le ricette senza numeri e le proprie richieste — e nient'altro, comunque. Qui decidi quanto mostrare al tuo secondo.</p>
        <label class="riga-scelta">
          <input type="checkbox" id="ris-costi" ${Cloud.kitchen.editor_vede_costi ? 'checked' : ''}>
          <span><b>Prezzi e food cost</b><br><span class="contact">Prezzi d'acquisto, food cost, margini, fornitori e fatture. Senza, non può comporre un menu né valutare un piatto.</span></span>
        </label>
        <label class="riga-scelta">
          <input type="checkbox" id="ris-personali" ${Cloud.kitchen.editor_vede_personali ? 'checked' : ''}>
          <span><b>Dati personali della brigata</b><br><span class="contact">Telefono, email e ore contrattuali. Senza, vede nomi, stazioni e quote: quanto basta per fare i turni.</span></span>
        </label>
      </div>
      <div class="panel">
        <h3>Invita qualcuno</h3>
        <p class="small-note mt-0" >Genera un codice e daglielo: lo inserisce al primo accesso ed entra con il permesso che scegli tu. Vale per una persona sola. Permesso e durata restano modificabili anche dopo averlo consegnato.</p>
        <div class="grid2">
          <div>
            <label>Permesso</label>
            <select id="inv-role">${ROLE_OPTIONS('editor')}</select>
          </div>
          <div>
            <label>Validità</label>
            <select id="inv-days">${DURATA_OPTIONS(14)}</select>
          </div>
        </div>
        <button class="btn small full mt-3" id="inv-create">Genera codice</button>
        <div id="team-new-code"></div>

        ${pending.length ? `<label class="mt-4">Codici ancora validi</label>` + pending.map(i=>`
          <div class="panel subpanel" >
            <div class="row middle between">
              <span class="code-inline">${esc(i.code)}</span>
              <span class="row middle">
                <span class="small-note m-0" >${esc(scadenzaTesto(i.expires_at))}</span>
                <button class="rm tm-revoke" data-c="${esc(i.code)}" title="Annulla il codice">✕</button>
              </span>
            </div>
            <div class="grid2 mt-2" >
              <select class="inv-edit-role" data-c="${esc(i.code)}">${ROLE_OPTIONS(i.role)}</select>
              <select class="inv-edit-days" data-c="${esc(i.code)}">
                <option value="">— cambia validità —</option>${DURATA_OPTIONS()}
              </select>
            </div>
          </div>`).join('') : ''}
      </div>`;

    const cambiaRiservatezza = async (campo, valore, elemento)=>{
      try{ await Cloud.setRiservatezza({[campo]: valore}); toast(t('Impostazione salvata')); }
      catch(e){ elemento.checked = !valore; teamError(e); }
    };
    document.getElementById('ris-costi').addEventListener('change', e=>
      cambiaRiservatezza('costi', e.target.checked, e.target));
    document.getElementById('ris-personali').addEventListener('change', e=>
      cambiaRiservatezza('personali', e.target.checked, e.target));

    document.getElementById('inv-create').addEventListener('click', async ()=>{
      try{
        const giorni = document.getElementById('inv-days').value;
        const code = await Cloud.createInvite(
          document.getElementById('inv-role').value,
          giorni === 'mai' ? null : giorni
        );
        document.getElementById('team-new-code').innerHTML =
          `<div class="invite-code">${esc(code)}</div><p class="small-note mt-0" >Annotalo ora: lo trovi anche nell'elenco qui sotto, ma è più comodo dettarlo subito.</p>`;
      }catch(e){ teamError(e); }
    });
    teamEl.querySelectorAll('.inv-edit-role').forEach(sel=>sel.addEventListener('change', async ()=>{
      try{ await Cloud.updateInvite(sel.dataset.c, {role: sel.value}); toast('Permesso del codice aggiornato'); }
      catch(e){ teamError(e); }
    }));
    teamEl.querySelectorAll('.inv-edit-days').forEach(sel=>sel.addEventListener('change', async ()=>{
      if(!sel.value) return;
      try{
        await Cloud.updateInvite(sel.dataset.c, {giorni: sel.value === 'mai' ? null : sel.value});
        openTeam(); toast('Validità aggiornata');
      }catch(e){ teamError(e); }
    }));
    teamEl.querySelectorAll('.tm-role').forEach(sel=>sel.addEventListener('change', async ()=>{
      try{ await Cloud.setMemberRole(sel.dataset.u, sel.value); toast('Ruolo aggiornato'); }
      catch(e){ teamError(e); }
    }));
    teamEl.querySelectorAll('.tm-name').forEach(inp=>inp.addEventListener('change', async ()=>{
      try{
        await Cloud.setMemberName(inp.dataset.u, inp.value);
        if(inp.dataset.u === Cloud.user.id){ Cloud.myDisplayName = inp.value.trim() || null; renderAccountBar(); }
        toast('Nome aggiornato');
      }catch(e){ teamError(e); }
    }));
    teamEl.querySelectorAll('.tm-rm').forEach(b=>b.addEventListener('click', async ()=>{
      // Rimuovere qualcuno gli toglie l'accesso subito: meglio una conferma con
      // il nome davanti agli occhi, viste le righe una sotto l'altra.
      const ok = await conferma(`Togliere a ${b.dataset.n} l'accesso a ${Cloud.kitchen.name}?`,
        'Perde solo l\'accesso all\'app. Se è anche in brigata ci resta, con i suoi turni già assegnati: quella è un\'altra cosa e si toglie da Brigata. Potrai riammetterla con un nuovo codice d\'invito.',
        {conferma:'Rimuovi', pericolo:true});
      if(!ok) return;
      try{ await Cloud.removeMember(b.dataset.u); openTeam(); toast('Persona rimossa'); }
      catch(e){ teamError(e); }
    }));
    teamEl.querySelectorAll('.tm-revoke').forEach(b=>b.addEventListener('click', async ()=>{
      try{ await Cloud.revokeInvite(b.dataset.c); openTeam(); }
      catch(e){ teamError(e); }
    }));
  }catch(e){ teamError(e); }
}
function teamError(e){
  const el = document.getElementById('team-error');
  el.textContent = humanError(e); el.classList.remove('hidden');
}

document.getElementById('ab-kitchen-sel').addEventListener('change', e=>{
  // Ricarico invece di ridisegnare: cambiare cucina cambia tutto (brigata,
  // servizi, turni, richieste) e una ripartenza pulita non lascia residui.
  Cloud.selectKitchen(e.target.value);
  location.reload();
});
document.getElementById('ab-team').addEventListener('click', openTeam);
document.getElementById('ab-rename').addEventListener('click', async ()=>{
  const nome = await chiediTesto("Il tuo nome nell'app", 'Come ti chiamano',
                      Cloud.myDisplayName || '',
                      'È il nome con cui compari fra chi ha accesso a questa cucina. Non è la scheda della brigata: quella la gestisce il titolare in Brigata.');
  if(nome === null) return;
  try{ await Cloud.setMyDisplayName(nome); renderAccountBar(); toast('Nome aggiornato'); }
  catch(e){ toast(humanError(e)); }
});
document.getElementById('ab-logout').addEventListener('click', async ()=>{ await Cloud.signOut(); location.reload(); });
document.getElementById('ab-switch').addEventListener('click', ()=>{
  try{ localStorage.removeItem((Cloud.isStaging?'comanda_staging_':'comanda_')+'last_kitchen'); }catch(e){}
  location.reload();
});
