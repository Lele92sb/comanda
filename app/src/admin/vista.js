// ============================================================================
// Console di amministrazione — quello che si vede.
//
// Riusa il design system dell'app (app/styles.css): stessi riquadri, stesse
// etichette, stessi pulsanti. Non per coerenza estetica, ma perché il
// proprietario ha quattro cucine e sta in giro: questa pagina la apre dal
// telefono, e una pagina che si comporta come quella che già conosce è una
// pagina che non gli fa sbagliare pulsante in mezzo a un servizio.
//
// Tutto quello che decide QUALCOSA sta in supabase/admin.sql. Qui si disegna e
// si chiede: nascondere un pulsante non è una protezione, e infatti nessuna
// protezione di questa console vive in questo file.
// ============================================================================
import { chiediTesto, conferma, esc, toast } from '../core/state.js';
import {
  account, apriAssistenza, assistenze, cancellaCucina, chiudiAssistenza, cucina, cucine,
  eliminaCucina, errori, erroriGruppi, iscrizioni, numeri, prossimoCursore, registro,
  rimuoviMembro, ripristinaCucina, setAi, setProva, setRuolo, setStato, trasferisciProprieta,
} from './api.js';

const PAGINA = 25;          // righe per pagina negli elenchi
const PAGINA_REGISTRO = 50;

const SCHEDE = [
  { id: 'numeri',   label: 'Numeri' },
  { id: 'cucine',   label: 'Cucine' },
  { id: 'account',  label: 'Account' },
  { id: 'errori',   label: 'Errori' },
  { id: 'registro', label: 'Registro' },
];

const STATO_ETICHETTA = { trial: 'in prova', active: 'attiva', suspended: 'sospesa' };

// Quel che l'elenco sta mostrando adesso: filtri e cursore della pagina
// successiva. Non si chiama "state" apposta: nell'app quel nome è già preso
// dai dati della cucina, e due cose diverse con lo stesso nome si confondono.
const vista = {
  cucine:   { righe: [], cursore: null, cerca: '', stato: '' },
  account:  { righe: [], cursore: null, cerca: '' },
  registro: { righe: [], cursore: null },
  errore:   { impronta: null },
};

/* ============================= FORMATI ============================= */
function dataBreve(iso){
  if(!iso) return '—';
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}
function dataOra(iso){
  if(!iso) return '—';
  return new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function peso(byte){
  const n = Number(byte || 0);
  if(n < 1024) return n + ' B';
  if(n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
// "Quando" detto come lo direbbe una persona: è la colonna che si guarda per
// capire chi ha smesso di usare l'app, e "2026-03-04T21:11:02Z" non lo dice.
function quandoFa(iso){
  if(!iso) return 'mai';
  const giorni = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if(giorni <= 0) return 'oggi';
  if(giorni === 1) return 'ieri';
  if(giorni < 30) return giorni + ' giorni fa';
  if(giorni < 365) return Math.floor(giorni / 30) + ' mesi fa';
  return Math.floor(giorni / 365) + ' anni fa';
}
function badgeStato(k){
  if(k.deleted_at) return '<span class="role-badge viewer">cancellata</span>';
  const cls = k.status === 'suspended' ? ' viewer' : '';
  return `<span class="role-badge${cls}">${esc(STATO_ETICHETTA[k.status] || k.status)}</span>`;
}
function vuoto(testo){ return `<div class="empty">${esc(testo)}</div>`; }

function errore(e){
  const msg = (e && e.message) || 'Qualcosa non ha funzionato.';
  toast(msg.length > 120 ? msg.slice(0, 120) + '…' : msg);
  console.error('[console]', e);
}

// Le funzioni del database tornano {ok:false, motivo} quando rifiutano per
// regola: è un esito, non un guasto, e va detto con le parole che ha scelto il
// database invece che con un generico "non riuscito".
function esito(r, quandoVaBene){
  if(r && r.ok === false){ toast(r.motivo || 'Rifiutato.'); return false; }
  toast(quandoVaBene);
  return true;
}

/* ============================= SCHEDE ============================= */
export function initConsole(){
  const nav = document.getElementById('tabs');
  nav.innerHTML = SCHEDE.map(s => `<button data-tab="${s.id}">${esc(s.label)}</button>`).join('');
  nav.querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => apriScheda(b.dataset.tab)));

  document.getElementById('cu-cerca').addEventListener('input', ritarda(() => {
    vista.cucine.cerca = document.getElementById('cu-cerca').value.trim();
    caricaCucine(true);
  }));
  document.getElementById('cu-stato').addEventListener('change', () => {
    vista.cucine.stato = document.getElementById('cu-stato').value;
    caricaCucine(true);
  });
  document.getElementById('cu-altre').addEventListener('click', () => caricaCucine(false));

  document.getElementById('ac-cerca').addEventListener('input', ritarda(() => {
    vista.account.cerca = document.getElementById('ac-cerca').value.trim();
    caricaAccount(true);
  }));
  document.getElementById('ac-altre').addEventListener('click', () => caricaAccount(false));

  document.getElementById('er-giorni').addEventListener('change', caricaErrori);
  document.getElementById('er-versione').addEventListener('input', ritarda(caricaErrori));

  document.getElementById('re-altre').addEventListener('click', () => caricaRegistro(false));
  document.getElementById('scheda-close').addEventListener('click', chiudiScheda);

  apriScheda('numeri');
}

// Un'attesa breve prima di cercare: scrivendo "trattoria" partirebbero nove
// chiamate, e la risposta della quarta può arrivare dopo quella della nona.
function ritarda(fn, ms){
  let h = null;
  return function(){
    clearTimeout(h);
    h = setTimeout(fn, ms || 250);
  };
}

function apriScheda(id){
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + id));
  if(id === 'numeri')   caricaNumeri();
  if(id === 'cucine')   caricaCucine(true);
  if(id === 'account')  caricaAccount(true);
  if(id === 'errori')   caricaErrori();
  if(id === 'registro') caricaRegistro(true);
}

/* ============================= NUMERI ============================= */
async function caricaNumeri(){
  const stats = document.getElementById('num-stats');
  stats.innerHTML = '';
  document.getElementById('num-stati').innerHTML = vuoto('Carico…');
  try{
    const [n, isc] = await Promise.all([numeri(), iscrizioni(30)]);
    const c = n.cucine || {};
    const a = n.account || {};
    const att = n.attivita || {};

    const riquadro = (numero, etichetta) =>
      `<div class="stat"><div class="n">${esc(numero)}</div><div class="l">${esc(etichetta)}</div></div>`;

    stats.innerHTML = [
      riquadro(c.cucine_vive || 0, 'cucine'),
      riquadro(a.totali == null ? '?' : (a.stimato ? '~' + a.totali : a.totali), 'account'),
      riquadro(att.attive_7g == null ? '—' : att.attive_7g, 'cucine attive 7gg'),
      riquadro(a.attivi_30g == null ? '—' : a.attivi_30g, 'account attivi 30gg'),
    ].join('');

    document.getElementById('num-stati').innerHTML = [
      riga('In prova', c['stato:trial'] || 0),
      riga('Attive', c['stato:active'] || 0),
      riga('Sospese', c['stato:suspended'] || 0),
      riga('Cancellate', c.cucine_cancellate || 0),
    ].join('');

    document.getElementById('num-iscrizioni').innerHTML = grafico(isc.serie || []);

    // I numeri stimati si dichiarano. Un "~12.400" onesto vale più di un
    // numero preciso che nessuno ha davvero contato.
    const note = [];
    if(a.nota) note.push(a.nota);
    if(att.nota) note.push(att.nota);
    document.getElementById('num-nota').textContent = note.length
      ? note.join(' · ')
      : 'Numeri esatti: sotto la soglia oltre la quale si passa alle stime.';
  }catch(e){ errore(e); document.getElementById('num-stati').innerHTML = vuoto('Non leggibile.'); }
}

function riga(etichetta, valore){
  return `<div class="list-row"><span>${esc(etichetta)}</span><span class="mono">${esc(valore)}</span></div>`;
}

// Un grafico a barre fatto con i riquadri che ci sono già: su un telefono una
// libreria di grafici pesa più di tutto il resto della pagina messo insieme.
function grafico(serie){
  if(!serie.length) return vuoto('Nessun dato.');
  const max = Math.max(1, ...serie.map(g => Math.max(g.cucine, g.account)));
  return `<div class="shift-scroll"><table class="hours-table">
    <tr><th>Giorno</th><th>Cucine</th><th>Account</th><th></th></tr>
    ${serie.slice().reverse().filter(g => g.cucine || g.account).map(g => `
      <tr>
        <td class="mono">${esc(dataBreve(g.giorno))}</td>
        <td class="num">${esc(g.cucine)}</td>
        <td class="num">${esc(g.account)}</td>
        <td><span class="tag ok" style="width:${Math.round(60 * g.account / max) + 4}px">&nbsp;</span></td>
      </tr>`).join('') || '<tr><td colspan="4" class="mono">nessuna iscrizione nel periodo</td></tr>'}
  </table></div>`;
}

/* ============================= CUCINE ============================= */
async function caricaCucine(daCapo){
  const box = document.getElementById('cu-lista');
  if(daCapo){ vista.cucine.righe = []; vista.cucine.cursore = null; box.innerHTML = vuoto('Carico…'); }
  try{
    const cancellate = vista.cucine.stato === 'cancellate';
    const righe = await cucine({
      cerca: vista.cucine.cerca,
      stato: cancellate ? null : vista.cucine.stato,
      cancellate,
      limite: PAGINA,
      cursore: vista.cucine.cursore,
    });
    vista.cucine.righe = vista.cucine.righe.concat(righe || []);
    vista.cucine.cursore = prossimoCursore(righe, PAGINA, 'created_at', 'id');
    document.getElementById('cu-altre').classList.toggle('hidden', !vista.cucine.cursore);
    disegnaCucine();
  }catch(e){ errore(e); box.innerHTML = vuoto('Non leggibile.'); }
}

function disegnaCucine(){
  const box = document.getElementById('cu-lista');
  if(!vista.cucine.righe.length){ box.innerHTML = vuoto('Nessuna cucina.'); return; }
  box.innerHTML = vista.cucine.righe.map(k => `
    <div class="panel">
      <div class="row middle between gap-3">
        <div class="wrap-anywhere">
          <div class="bold wrap-anywhere">${esc(k.name)}</div>
          <div class="contact">dal ${esc(dataBreve(k.created_at))} · attività ${esc(quandoFa(k.ultima_scrittura))}</div>
        </div>
        ${badgeStato(k)}
      </div>
      <div class="metric-row">
        <span class="metric">brigata<b>${esc((k.membri_owner || 0) + (k.membri_editor || 0) + (k.membri_viewer || 0))}</b></span>
        <span class="metric">dati<b>${esc(peso(k.byte_dati))}</b></span>
        <span class="metric">AI mese<b>${esc(k.ai_calls)}/${esc(k.ai_limit)}</b></span>
        ${k.status === 'trial'
          ? `<span class="metric">prova fino al<b>${esc(dataBreve(k.trial_ends_at))}</b></span>` : ''}
      </div>
      <button class="btn small full cu-apri" data-k="${esc(k.id)}">Apri la scheda</button>
    </div>`).join('');
  box.querySelectorAll('.cu-apri').forEach(b =>
    b.addEventListener('click', () => mostraScheda(b.dataset.k)));
}

/* ============================= ACCOUNT ============================= */
async function caricaAccount(daCapo){
  const box = document.getElementById('ac-lista');
  if(daCapo){ vista.account.righe = []; vista.account.cursore = null; box.innerHTML = vuoto('Carico…'); }
  try{
    const righe = await account({ cerca: vista.account.cerca, limite: PAGINA, cursore: vista.account.cursore });
    vista.account.righe = vista.account.righe.concat(righe || []);
    vista.account.cursore = prossimoCursore(righe, PAGINA, 'created_at', 'id');
    document.getElementById('ac-altre').classList.toggle('hidden', !vista.account.cursore);

    box.innerHTML = vista.account.righe.length ? vista.account.righe.map(u => `
      <div class="panel">
        <div class="bold wrap-anywhere">${esc(u.email || '(senza email)')}</div>
        <div class="contact">iscritto il ${esc(dataBreve(u.created_at))} ·
          ultimo accesso ${esc(quandoFa(u.last_sign_in_at))}</div>
        ${(u.cucine || []).length
          ? (u.cucine || []).map(c => `<div class="list-row"><span>${esc(c.nome)}</span>
              <span class="role-badge ${c.ruolo === 'viewer' ? 'viewer' : ''}">${esc(c.ruolo)}</span></div>`).join('')
          : '<div class="contact">nessuna cucina</div>'}
      </div>`).join('') : vuoto('Nessun account.');
  }catch(e){ errore(e); box.innerHTML = vuoto('Non leggibile.'); }
}

/* ============================= ERRORI ============================= */
function giorniScelti(){ return parseInt(document.getElementById('er-giorni').value, 10); }
function versioneScelta(){ return document.getElementById('er-versione').value.trim() || null; }

async function caricaErrori(){
  const box = document.getElementById('er-gruppi');
  box.innerHTML = vuoto('Carico…');
  document.getElementById('er-dettaglio').innerHTML = '';
  try{
    const r = await erroriGruppi({ giorni: giorniScelti(), versione: versioneScelta(), limite: 30 });
    const gruppi = r.gruppi || [];
    box.innerHTML = gruppi.length ? gruppi.map(g => `
      <div class="panel">
        <div class="row top between gap-3">
          <div class="wrap-anywhere">
            <div class="bold wrap-anywhere">${esc(g.messaggio)}</div>
            <div class="contact wrap-anywhere">${esc(g.origine || 'origine sconosciuta')}</div>
          </div>
          <span class="role-badge">${esc(g.quante)}×</span>
        </div>
        <div class="metric-row">
          <span class="metric">cucine<b>${esc(g.cucine)}</b></span>
          <span class="metric">prima<b>${esc(dataOra(g.prima_volta))}</b></span>
          <span class="metric">ultima<b>${esc(dataOra(g.ultima_volta))}</b></span>
        </div>
        <div class="contact">versioni: ${esc((g.versioni || []).filter(Boolean).join(', ') || '—')}</div>
        <button class="btn small full mt-3 er-apri" data-i="${esc(g.impronta)}">Vedi le singole segnalazioni</button>
      </div>`).join('') : vuoto('Nessun errore nel periodo. Buon segno.');

    box.querySelectorAll('.er-apri').forEach(b =>
      b.addEventListener('click', () => dettaglioErrore(b.dataset.i)));
  }catch(e){ errore(e); box.innerHTML = vuoto('Non leggibile.'); }
}

async function dettaglioErrore(impronta){
  const box = document.getElementById('er-dettaglio');
  box.innerHTML = vuoto('Carico…');
  try{
    const righe = await errori({ impronta, giorni: giorniScelti(), versione: versioneScelta(), limite: 50 });
    box.innerHTML = `<div class="panel"><h3>Segnalazioni del gruppo</h3>
      ${(righe || []).map(e => `
        <div class="panel subpanel">
          <div class="contact">${esc(dataOra(e.quando))} · v${esc(e.versione || '?')} ·
            ${esc(e.ambiente || 'ambiente ignoto')} · ${esc(e.paese || '--')}</div>
          <div class="wrap-anywhere">${esc(e.messaggio)}</div>
          <div class="contact wrap-anywhere">${esc(e.origine || '')}</div>
          <div class="contact wrap-anywhere">cucina ${esc(e.cucina_id || '—')}</div>
        </div>`).join('') || vuoto('Niente in questo periodo.')}
    </div>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }catch(e){ errore(e); box.innerHTML = vuoto('Non leggibile.'); }
}

/* ============================= REGISTRO ============================= */
async function caricaRegistro(daCapo){
  const box = document.getElementById('re-lista');
  if(daCapo){ vista.registro.righe = []; vista.registro.cursore = null; box.innerHTML = vuoto('Carico…'); }
  try{
    const righe = await registro({ limite: PAGINA_REGISTRO, cursore: vista.registro.cursore });
    vista.registro.righe = vista.registro.righe.concat(righe || []);
    vista.registro.cursore = prossimoCursore(righe, PAGINA_REGISTRO, 'quando', 'id');
    document.getElementById('re-altre').classList.toggle('hidden', !vista.registro.cursore);
    box.innerHTML = vista.registro.righe.length
      ? vista.registro.righe.map(rigaRegistro).join('')
      : vuoto('Nessuna azione registrata.');
  }catch(e){ errore(e); box.innerHTML = vuoto('Non leggibile.'); }
}

function rigaRegistro(a){
  return `
    <div class="panel subpanel">
      <div class="row top between gap-3">
        <div class="wrap-anywhere">
          <div class="bold">${esc(a.azione)}${a.cucina_nome ? ' · ' + esc(a.cucina_nome) : ''}</div>
          <div class="contact wrap-anywhere">${esc(dataOra(a.quando))} · ${esc(a.admin_email || a.admin_id)}
            ${a.bersaglio_email ? ' → ' + esc(a.bersaglio_email) : ''}</div>
          <div class="contact wrap-anywhere">${esc(JSON.stringify(a.dettagli || {}))}</div>
        </div>
        <span class="role-badge ${a.esito === 'ok' ? '' : 'viewer'}">${esc(a.esito)}</span>
      </div>
    </div>`;
}

/* ============================= SCHEDA DI UNA CUCINA ============================= */
const schedaEl = document.getElementById('scheda');
let apertaId = null;

function chiudiScheda(){ schedaEl.classList.remove('show'); apertaId = null; }
function schedaErrore(e){
  const el = document.getElementById('scheda-error');
  el.textContent = (e && e.message) || 'Qualcosa non ha funzionato.';
  el.classList.remove('hidden');
}

async function mostraScheda(id){
  apertaId = id;
  schedaEl.classList.add('show');
  document.getElementById('scheda-error').classList.add('hidden');
  document.getElementById('scheda-body').innerHTML = vuoto('Carico…');
  try{
    const [d, acc] = await Promise.all([cucina(id), assistenze(id)]);
    if(!d.trovata){ document.getElementById('scheda-body').innerHTML = vuoto('Cucina non trovata.'); return; }
    disegnaScheda(d, acc || []);
  }catch(e){ errore(e); document.getElementById('scheda-body').innerHTML = vuoto('Non leggibile.'); }
}

function disegnaScheda(d, acc){
  const k = d.cucina, s = d.stat;
  document.getElementById('scheda-nome').textContent = k.name;

  const scadenza = k.trial_ends_at ? new Date(k.trial_ends_at).toISOString().slice(0, 10) : '';

  document.getElementById('scheda-body').innerHTML = `
    <div class="panel">
      <div class="row middle between gap-3">
        <div class="contact wrap-anywhere">${esc(k.id)}</div>
        ${badgeStato(k)}
      </div>
      <div class="metric-row">
        <span class="metric">creata<b>${esc(dataBreve(k.created_at))}</b></span>
        <span class="metric">dati<b>${esc(peso(s.byte_dati))}</b></span>
        <span class="metric">sezioni<b>${esc(s.sezioni)}</b></span>
        <span class="metric">attività<b>${esc(quandoFa(s.ultima_scrittura))}</b></span>
      </div>
    </div>

    <div class="panel">
      <h3>Stato commerciale</h3>
      <div class="row wrap">
        <button class="btn small grow sc-stato" data-s="trial">In prova</button>
        <button class="btn small grow sc-stato" data-s="active">Attiva</button>
        <button class="btn ghost small grow sc-stato" data-s="suspended">Sospendi</button>
      </div>
      <label>Scadenza della prova</label>
      <div class="grid2">
        <input type="date" id="sc-prova" value="${esc(scadenza)}">
        <button class="btn small" id="sc-prova-btn">Sposta la scadenza</button>
      </div>
    </div>

    <div class="panel">
      <h3>Chiamate AI del mese</h3>
      <p class="small-note mt-0">Mese ${esc(k.ai_month)} · usate ${esc(k.ai_calls)} su ${esc(k.ai_limit)}.</p>
      <div class="grid2">
        <input type="number" id="sc-tetto" min="0" value="${esc(k.ai_limit)}">
        <button class="btn small" id="sc-tetto-btn">Cambia il tetto</button>
      </div>
      <button class="btn ghost small full mt-3" id="sc-azzera">Azzera il contatore del mese</button>
    </div>

    <div class="panel">
      <h3>Chi lavora su questa cucina</h3>
      ${(d.membri || []).map(m => `
        <div class="panel subpanel">
          <div class="row top between gap-3">
            <div class="wrap-anywhere">
              <div class="bold wrap-anywhere">${esc(m.display_name || m.email || m.user_id)}</div>
              <div class="contact wrap-anywhere">${esc(m.email || '(email non leggibile)')} ·
                dal ${esc(dataBreve(m.dal))} · accesso ${esc(quandoFa(m.ultimo_accesso))}</div>
            </div>
            <span class="role-badge ${m.ruolo === 'viewer' ? 'viewer' : ''}">${esc(m.ruolo)}</span>
          </div>
          <div class="grid2 mt-2">
            <select class="sc-ruolo" data-u="${esc(m.user_id)}">
              <option value="owner"  ${m.ruolo === 'owner'  ? 'selected' : ''}>titolare</option>
              <option value="editor" ${m.ruolo === 'editor' ? 'selected' : ''}>può modificare</option>
              <option value="viewer" ${m.ruolo === 'viewer' ? 'selected' : ''}>sola lettura</option>
            </select>
            <button class="btn ghost small sc-rm text-alert" data-u="${esc(m.user_id)}"
                    data-n="${esc(m.email || m.user_id)}">Rimuovi dalla cucina</button>
          </div>
        </div>`).join('') || vuoto('Nessun membro.')}
    </div>

    <div class="panel">
      <h3>Trasferisci la proprietà</h3>
      <p class="small-note mt-0">Il nuovo titolare si indica per email o per id. Il vecchio ANCHE: se lo
        lasci vuoto non viene declassato nessuno e la cucina resta con due titolari, che è uno stato sano.
        "Declassa tutti quelli diversi dal nuovo" è la scorciatoia che toglie il ruolo alla persona sbagliata.</p>
      <label>Nuovo titolare (email o id)</label>
      <input type="text" id="sc-nuovo" placeholder="nome@ristorante.it">
      <label>Vecchio titolare da declassare (facoltativo)</label>
      <input type="text" id="sc-vecchio" placeholder="lascia vuoto per non declassare nessuno">
      <select id="sc-declassa">
        <option value="editor">il vecchio diventa: può modificare</option>
        <option value="viewer">il vecchio diventa: sola lettura</option>
      </select>
      <button class="btn small full mt-3" id="sc-trasferisci">Trasferisci</button>
    </div>

    <div class="panel">
      <h3>Accesso di assistenza</h3>
      <p class="small-note mt-0">Serve per guardare i CONTENUTI di questa cucina — ricette, costi,
        anagrafica. Ha un motivo scritto, una scadenza, e il titolare della cucina lo vede nel suo
        pannello Squadra. Ogni sezione letta finisce nel registro.</p>
      <label>Perché ti serve</label>
      <input type="text" id="sc-motivo" placeholder="es. il cliente segnala food cost sbagliati sul menu estivo">
      <div class="grid2 mt-2">
        <select id="sc-minuti">
          <option value="30">30 minuti</option>
          <option value="60" selected>1 ora</option>
          <option value="240">4 ore</option>
          <option value="1440">1 giorno (massimo)</option>
        </select>
        <button class="btn small" id="sc-assistenza">Apri l'accesso</button>
      </div>
      ${acc.length ? acc.map(a => `
        <div class="panel subpanel">
          <div class="row middle between gap-3">
            <div class="wrap-anywhere">
              <div class="wrap-anywhere">${esc(a.motivo)}</div>
              <div class="contact">${esc(dataOra(a.concesso_il))} → ${esc(dataOra(a.scade_il))}</div>
            </div>
            ${a.in_corso
              ? `<button class="btn ghost small sc-chiudi-ass" data-a="${esc(a.id)}">Chiudi</button>`
              : '<span class="role-badge viewer">concluso</span>'}
          </div>
        </div>`).join('') : ''}
    </div>

    <div class="panel">
      <h3>Cancellazione</h3>
      ${k.deleted_at ? `
        <p class="small-note mt-0">Cancellata il ${esc(dataOra(k.deleted_at))}. I dati ci sono ancora.</p>
        <button class="btn ghost small full" id="sc-ripristina">Ripristina (torna sospesa)</button>
        <button class="btn danger small full mt-3" id="sc-elimina">Elimina definitivamente</button>
        <p class="small-note">L'eliminazione definitiva chiede il nome della cucina scritto per esteso,
          e porta via anche i dati. Nel registro resta scritto chi l'ha fatto.</p>
      ` : `
        <p class="small-note mt-0">Primo passo, reversibile: la cucina viene marcata e sospesa. Chi ci
          lavora vede "cucina sospesa" e i dati restano al loro posto.</p>
        <button class="btn ghost small full text-alert" id="sc-cancella">Cancella la cucina</button>
      `}
    </div>

    <div class="panel">
      <h3>Ultime azioni su questa cucina</h3>
      ${(d.registro || []).map(rigaRegistro).join('') || vuoto('Nessuna azione registrata.')}
    </div>`;

  collegaAzioni(k);
}

function collegaAzioni(k){
  const dopo = () => mostraScheda(k.id);
  const prova = (fn) => async () => { try{ await fn(); }catch(e){ schedaErrore(e); } };

  schedaEl.querySelectorAll('.sc-stato').forEach(b => b.addEventListener('click', prova(async () => {
    if(esito(await setStato(k.id, b.dataset.s), 'Stato aggiornato')) dopo();
  })));

  document.getElementById('sc-prova-btn').addEventListener('click', prova(async () => {
    const v = document.getElementById('sc-prova').value;
    if(!v){ schedaErrore(new Error('Scegli una data.')); return; }
    if(esito(await setProva(k.id, new Date(v + 'T23:59:59').toISOString()), 'Scadenza spostata')) dopo();
  }));

  document.getElementById('sc-tetto-btn').addEventListener('click', prova(async () => {
    const n = parseInt(document.getElementById('sc-tetto').value, 10);
    if(!(n >= 0)){ schedaErrore(new Error('Il tetto è un numero.')); return; }
    if(esito(await setAi(k.id, n, false), 'Tetto aggiornato')) dopo();
  }));

  document.getElementById('sc-azzera').addEventListener('click', prova(async () => {
    if(esito(await setAi(k.id, null, true), 'Contatore azzerato')) dopo();
  }));

  // Il ruolo si cambia sull'id della riga, che è quello che il database ha
  // appena mandato: non sul nome, non sulla posizione nell'elenco.
  schedaEl.querySelectorAll('.sc-ruolo').forEach(sel => sel.addEventListener('change', prova(async () => {
    if(esito(await setRuolo(k.id, sel.value, sel.dataset.u), 'Ruolo aggiornato')) dopo();
  })));

  schedaEl.querySelectorAll('.sc-rm').forEach(b => b.addEventListener('click', prova(async () => {
    const ok = await conferma(`Togliere ${b.dataset.n} da ${k.name}?`,
      'Perde l\'accesso subito. I dati della cucina restano intatti.',
      { conferma: 'Rimuovi', pericolo: true });
    if(!ok) return;
    if(esito(await rimuoviMembro(k.id, b.dataset.u), 'Persona rimossa')) dopo();
  })));

  document.getElementById('sc-trasferisci').addEventListener('click', prova(async () => {
    const nuovo = document.getElementById('sc-nuovo').value.trim();
    const vecchio = document.getElementById('sc-vecchio').value.trim();
    const ok = await conferma(`Trasferire ${k.name} a ${nuovo || '(nessuno)'}?`,
      vecchio ? `${vecchio} diventerà ${document.getElementById('sc-declassa').value}.`
              : 'Nessuno viene declassato: la cucina resterà con due titolari.',
      { conferma: 'Trasferisci' });
    if(!ok) return;
    const r = await trasferisciProprieta(k.id, nuovo, vecchio, document.getElementById('sc-declassa').value);
    if(esito(r, 'Proprietà trasferita')) dopo();
  }));

  document.getElementById('sc-assistenza').addEventListener('click', prova(async () => {
    const motivo = document.getElementById('sc-motivo').value.trim();
    const minuti = parseInt(document.getElementById('sc-minuti').value, 10);
    if(esito(await apriAssistenza(k.id, motivo, minuti), 'Accesso aperto — il titolare lo vede')) dopo();
  }));

  schedaEl.querySelectorAll('.sc-chiudi-ass').forEach(b => b.addEventListener('click', prova(async () => {
    if(esito(await chiudiAssistenza(b.dataset.a), 'Accesso chiuso')) dopo();
  })));

  const cancella = document.getElementById('sc-cancella');
  if(cancella) cancella.addEventListener('click', prova(async () => {
    const motivo = await chiediTesto('Cancellare ' + k.name + '?',
      'Perché', '', 'Passo reversibile: la cucina resta, marcata e sospesa. Il motivo finisce nel registro.');
    if(motivo === null) return;
    if(esito(await cancellaCucina(k.id, motivo), 'Cucina cancellata')) { dopo(); caricaCucine(true); }
  }));

  const ripristina = document.getElementById('sc-ripristina');
  if(ripristina) ripristina.addEventListener('click', prova(async () => {
    if(esito(await ripristinaCucina(k.id, 'suspended'), 'Cucina ripristinata, sospesa')) { dopo(); caricaCucine(true); }
  }));

  const elimina = document.getElementById('sc-elimina');
  if(elimina) elimina.addEventListener('click', prova(async () => {
    // Il nome scritto per esteso, non un "sei sicuro?": è l'unico attrito che
    // ferma davvero il clic sbagliato sulla riga sbagliata.
    const nome = await chiediTesto('Eliminare definitivamente?',
      'Scrivi il nome della cucina', '',
      'Sparisce tutto: dati, membri, inviti, richieste. Non si torna indietro.\nLa cucina si chiama: ' + k.name);
    if(nome === null) return;
    const r = await eliminaCucina(k.id, nome);
    if(esito(r, 'Cucina eliminata')){ chiudiScheda(); caricaCucine(true); }
  }));
}
