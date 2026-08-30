import { esc, save, state, toast, uid } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
/* ============================= BRIGATA ============================= */

/* Le partite di una persona come si leggono in elenco. L'ORDINE dell'array
   `stations` E' la priorita' — il motore lo usa cosi' (prioritaDi in logic.js) —
   e finche' qui si leggeva "Primi, Pass, Secondi" separato da virgole non c'era
   modo di accorgersene: tre nomi in fila sembrano tre pari. La principale si
   dice per nome, le altre stanno dopo un "poi". */
function elencoPartite(s){
  const nomi = (s.stations||[])
    .map(id=>{ const st=state.stations.find(x=>x.id===id); return st?st.name:null; })
    .filter(Boolean);
  if(!nomi.length) return '—';
  if(nomi.length===1) return esc(nomi[0]);
  return `<b>${esc(nomi[0])}</b> (principale) · poi ${nomi.slice(1).map(esc).join(', ')}`;
}

export function renderStaffList(){
  const el = document.getElementById('staff-list');
  if(!state.staff.length){ el.innerHTML = `<div class="empty">Nessuna persona in brigata ancora.</div>`; return; }
  const ultimo = state.staff.length - 1;
  el.innerHTML = state.staff.map((s,i)=>{
    const senzaStazioni = !(s.stations && s.stations.length);
    return `
    <div class="staff-card">
      <div>
        <div class="bold">${esc(s.name)}</div>
        <div class="contact">${esc(s.role)} · ${s.hours||'—'}h/sett contrattuali</div>
        <div class="contact">${s.phone? '📞 '+esc(s.phone):''}${s.phone&&s.email?' · ':''}${s.email? '✉ '+esc(s.email):''}</div>
        <div class="contact${senzaStazioni?' text-alert':''}">🍳 ${senzaStazioni
          ? '⚠ nessuna stazione — il generatore la salta, resta assegnabile a mano nella griglia'
          : elencoPartite(s)}</div>
        ${s.puoFareExtra === false ? `<div class="contact">🚫 fuori dai turni extra</div>` : ''}
      </div>
      <div class="col">
        <div class="row gap-1 ordina">
          <button class="btn ghost" data-su="${i}" ${i===0?'disabled':''} aria-label="Sposta ${esc(s.name)} più in alto" title="Sposta ${esc(s.name)} più in alto">▲</button>
          <button class="btn ghost" data-giu="${i}" ${i===ultimo?'disabled':''} aria-label="Sposta ${esc(s.name)} più in basso" title="Sposta ${esc(s.name)} più in basso">▼</button>
        </div>
        <button class="btn ghost small" data-edit="${s.id}">Modifica</button>
        <button class="btn ghost small text-alert" data-del="${s.id}">Rimuovi</button>
      </div>
    </div>`;
  }).join('');
  // L'ordine della brigata È la posizione in state.staff: spostare su e giù
  // scambia due elementi dell'array, non c'è nessun campo "ordine" da tenere
  // allineato. I turni sono indicizzati per id della persona (state.shifts),
  // quindi riordinare l'elenco non tocca un solo turno assegnato.
  const sposta = (da, a)=>{
    [state.staff[da], state.staff[a]] = [state.staff[a], state.staff[da]];
    save('staff');
    renderStaffList();
    // Dopo il ridisegno la scheda si è spostata di una posizione. Sul telefono,
    // senza questo, il pulsante appena premuto finisce sotto un'altra persona e
    // il secondo tocco sposterebbe quella sbagliata: si insegue lo stesso
    // pulsante della stessa persona alla sua nuova posizione. Se lì è arrivata
    // in fondo alla corsa quel pulsante è disabilitato e non prende il fuoco:
    // si ripiega sull'altra freccia, che è comunque sulla sua riga.
    const verso = da < a ? 'giu' : 'su';
    const b = el.querySelector(`[data-${verso}="${a}"]:not([disabled])`)
           || el.querySelector(`[data-${verso==='giu'?'su':'giu'}="${a}"]:not([disabled])`);
    if(b){ b.scrollIntoView({block:'nearest'}); b.focus(); }
  };
  el.querySelectorAll('[data-su]').forEach(b=>
    b.addEventListener('click', ()=> sposta(+b.dataset.su, +b.dataset.su - 1)));
  el.querySelectorAll('[data-giu]').forEach(b=>
    b.addEventListener('click', ()=> sposta(+b.dataset.giu, +b.dataset.giu + 1)));
  el.querySelectorAll('[data-edit]').forEach(b=> b.addEventListener('click', ()=> openStaffForm(state.staff.find(s=>s.id===b.dataset.edit))));
  el.querySelectorAll('[data-del]').forEach(b=>{
    b.addEventListener('click', ()=>{
      state.staff = state.staff.filter(s=>s.id!==b.dataset.del);
      delete state.shifts[b.dataset.del];
      save('staff'); save('shifts'); renderStaffList(); toast('Rimosso dalla brigata');
    });
  });
}
async function openStaffForm(existing){
  const holder = document.getElementById('staff-form-holder');
  const s = existing || {id:uid(), name:'', role:'Cuoco', hours:'', phone:'', email:'', stations:[], weeklyQuota:[], puoFareExtra:true, userId:null};
  // Chi ha un account nella cucina, per poter collegare la persona al suo
  // accesso: senza il collegamento non può inviare le proprie richieste.
  let membri = [];
  if(Cloud.enabled && Cloud.isOwner()){
    try{ membri = await Cloud.listMembers(); }catch(e){ console.error('membri non caricati', e); }
  }
  holder.innerHTML = `
    <div class="panel">
      <h3>${existing?'Modifica persona':'Aggiungi persona'}</h3>
      <label>Nome</label>
      <input type="text" id="s-name" value="${esc(s.name)}" placeholder="es. Marco">
      <div class="grid2">
        <div><label>Ruolo</label>
          <select id="s-role">
            ${['Chef','Sous Chef','Chef de partie','Cuoco','Commis','Pasticcere','Plongeur'].map(r=>`<option ${s.role===r?'selected':''}>${r}</option>`).join('')}
          </select>
        </div>
        <div><label>Ore contrattuali/sett.</label><input type="number" id="s-hours" value="${s.hours}" placeholder="es. 40"></div>
      </div>
      <div class="grid2">
        <div><label>Numero di cellulare</label><input type="tel" id="s-phone" value="${esc(s.phone)}" placeholder="es. 333 1234567"></div>
        <div><label>Email</label><input type="email" id="s-email" value="${esc(s.email)}" placeholder="es. nome@email.it"></div>
      </div>
      <label>Le sue partite, dalla principale in giù</label>
      <div id="s-stations"></div>
      <p class="small-note">L'ordine è la priorità: la prima è la <b>partita principale</b>, quella dove il generatore la mette per prima. Le altre sono dove la sposta quando la principale è già coperta. Chi non ha nessuna partita il generatore la salta.</p>
      <label class="riga-scelta">
        <input type="checkbox" id="s-extra" ${s.puoFareExtra !== false ? 'checked' : ''}>
        <span><b>Può fare turni extra</b><br><span class="contact">Quando il fabbisogno supera le quote della brigata, il generatore può assegnarle un turno oltre la sua quota. Spenta, resta fuori dagli extra: la postazione risulterà scoperta invece che coperta da lei.</span></span>
      </label>
      ${membri.length ? `
      <label>Account collegato</label>
      <select id="s-user">
        <option value="">— nessuno: le richieste le inserisci tu per lui —</option>
        ${membri.map(m=>`<option value="${esc(m.user_id)}" ${s.userId===m.user_id?'selected':''}>${esc(m.display_name||m.email||'membro')}</option>`).join('')}
      </select>
      <p class="small-note">Collega questa persona al suo account per farle inviare da sola ferie e richieste di riposo, e per prendere la sua email da lì. Chi non ha un account resta in brigata e nei turni comunque: lascia "nessuno" e le richieste le inserisci tu per lui.</p>` : ''}
      <div class="row gap-3 mt-4">
        <button class="btn" id="s-save">Salva</button>
        <button class="btn ghost" id="s-cancel">Annulla</button>
      </div>
    </div>
  `;
  // ---- LE PARTITE, IN ORDINE DI PRIORITA' ---------------------------------
  // «Alcune persone fanno primi e secondi, altre secondi e pass: la priorità la
  // deve impostare il titolare». L'ORDINE di `stations` E' la priorità, e il
  // motore la legge di lì (prioritaDi in logic.js). Prima l'ordine c'era ma
  // nessuno poteva sceglierlo: le stazioni si spuntavano, e al salvataggio si
  // rileggevano dal DOM — cioè nell'ordine in cui le stazioni erano state
  // CREATE, uguale per tutta la brigata. Il campo è sempre stato quello, quindi
  // non c'è niente da migrare: chi ha dati salvati ha già un ordine, al massimo
  // casuale, e appena il titolare lo sistema il motore lo segue.
  //
  // Si lavora su una copia e si salva solo con Salva: chi annulla non cambia
  // niente. Gli id di stazioni cancellate altrove restano da parte e tornano
  // nel salvataggio — questa scheda non è il posto dove ripulire i dati.
  const conosciuta = id => state.stations.some(x=>x.id===id);
  const partite = (s.stations||[]).filter(conosciuta);
  const orfane  = (s.stations||[]).filter(id=> !conosciuta(id));
  const nomePartita = id => (state.stations.find(x=>x.id===id)||{}).name || '—';

  function renderPartite(){
    const box = document.getElementById('s-stations');
    if(!state.stations.length){
      box.innerHTML = `<p class="small-note mt-0">Nessuna stazione creata ancora — puoi crearle in Turni → Stazioni, poi torna qui.</p>`;
      return;
    }
    const ultima = partite.length - 1;
    const righe = partite.map((id,i)=>`
      <div class="partita-riga${i===0?' principale':''}">
        <span class="partita-rango">${i+1}ª</span>
        <div class="grow wrap-anywhere">
          <div class="bold">${esc(nomePartita(id))}</div>
          ${i===0 ? `<div class="contact text-accent">principale — ci va per prima</div>` : ''}
        </div>
        <div class="row gap-1 ordina">
          <button type="button" class="btn ghost" data-psu="${i}" ${i===0?'disabled':''} aria-label="Sposta ${esc(nomePartita(id))} più in alto" title="Più in alto">▲</button>
          <button type="button" class="btn ghost" data-pgiu="${i}" ${i===ultima?'disabled':''} aria-label="Sposta ${esc(nomePartita(id))} più in basso" title="Più in basso">▼</button>
          <button type="button" class="btn ghost text-alert" data-pvia="${i}" aria-label="Togli ${esc(nomePartita(id))}" title="Togli">✕</button>
        </div>
      </div>`).join('');
    const restanti = state.stations.filter(st=> !partite.includes(st.id));
    box.innerHTML =
      (righe || `<div class="empty">Nessuna partita: il generatore la salterebbe.</div>`) +
      (restanti.length ? `
        <div class="contact mt-2">Aggiungi una partita — entra in fondo, poi la porti su con ▲</div>
        <div class="chip-toggle">
          ${restanti.map(st=>`<button type="button" data-padd="${st.id}">+ ${esc(st.name)}</button>`).join('')}
        </div>` : '');

    // Dopo il ridisegno la riga si è spostata di un posto: si insegue lo stesso
    // pulsante della stessa partita alla sua nuova posizione, altrimenti sul
    // telefono il secondo tocco sposta quella sbagliata. È lo stesso rimedio
    // dell'elenco della brigata qui sopra, e per lo stesso motivo.
    const sposta = (da, a)=>{
      [partite[da], partite[a]] = [partite[a], partite[da]];
      renderPartite();
      const verso = da < a ? 'pgiu' : 'psu';
      const b = box.querySelector(`[data-${verso}="${a}"]:not([disabled])`)
             || box.querySelector(`[data-${verso==='pgiu'?'psu':'pgiu'}="${a}"]:not([disabled])`);
      if(b){ b.scrollIntoView({block:'nearest'}); b.focus(); }
    };
    box.querySelectorAll('[data-psu]').forEach(b=>
      b.addEventListener('click', ()=> sposta(+b.dataset.psu, +b.dataset.psu - 1)));
    box.querySelectorAll('[data-pgiu]').forEach(b=>
      b.addEventListener('click', ()=> sposta(+b.dataset.pgiu, +b.dataset.pgiu + 1)));
    box.querySelectorAll('[data-pvia]').forEach(b=>
      b.addEventListener('click', ()=>{ partite.splice(+b.dataset.pvia, 1); renderPartite(); }));
    box.querySelectorAll('[data-padd]').forEach(b=>
      b.addEventListener('click', ()=>{
        partite.push(b.dataset.padd);
        renderPartite();
        // Il fuoco va sulla riga appena aggiunta: è lì che si decide se è la
        // principale, e senza questo il pulsante ▲ che serve resta fuori
        // schermo sul telefono.
        const su = box.querySelector(`[data-psu="${partite.length-1}"]`);
        if(su){ su.scrollIntoView({block:'nearest'}); su.focus(); }
      }));
  }
  renderPartite();

  document.getElementById('s-cancel').addEventListener('click', ()=> holder.innerHTML='');
  // L'email di chi ha un account nella cucina è già qui: la porta
  // Cloud.listMembers() insieme al nome, e il database la manda solo al
  // titolare (policy members_select). Si compila da sola SOLO se il campo è
  // vuoto: quella scritta a mano vince sempre, e staccare l'account non
  // cancella niente. Si riempie alla selezione e non al salvataggio, così il
  // titolare la vede comparire e può correggerla prima di salvare.
  const selUser = document.getElementById('s-user');
  if(selUser) selUser.addEventListener('change', ()=>{
    const campoEmail = document.getElementById('s-email');
    if(campoEmail.value.trim()) return;
    const m = membri.find(x=>x.user_id === selUser.value);
    if(!m || !m.email) return;
    campoEmail.value = m.email;
    toast('Email presa dall\'account collegato');
  });
  document.getElementById('s-save').addEventListener('click', ()=>{
    const name = document.getElementById('s-name').value.trim();
    if(!name){ toast('Serve un nome'); return; }
    // L'ordine è quello dell'elenco, non quello del DOM delle chip: è il dato.
    const stations = partite.concat(orfane);
    const userSel = document.getElementById('s-user');
    const newStaff = { id:s.id, name, role:document.getElementById('s-role').value, hours:document.getElementById('s-hours').value,
      phone:document.getElementById('s-phone').value.trim(), email:document.getElementById('s-email').value.trim(),
      stations, weeklyQuota: s.weeklyQuota||[],
      // Qui l'oggetto si ricostruisce da zero, non si modifica: ogni campo non
      // elencato sparisce alla prima Modifica. È il motivo per cui weeklyQuota
      // è riportata a mano, ed è il motivo per cui puoFareExtra dev'esserci.
      puoFareExtra: document.getElementById('s-extra').checked,
      userId: userSel ? (userSel.value || null) : (s.userId||null) };
    const idx = state.staff.findIndex(x=>x.id===s.id);
    if(idx>=0) state.staff[idx]=newStaff; else state.staff.push(newStaff);
    save('staff'); holder.innerHTML=''; renderStaffList(); toast('Salvato');
  });
}
document.getElementById('btn-new-staff').addEventListener('click', ()=> openStaffForm(null));
