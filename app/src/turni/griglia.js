import { CODE_HOURS, CODE_LABEL, TURNO_DEF, WORKING_CODES, esc, periodDates, periodLabel, periodMode, save, state } from '../core/state.js';
import { dayName, isoDate, parseISO } from '../lib/logic.js';
import { renderDashboard } from '../viste/dashboard.js';
/* ============================= TURNI: griglia =============================

   UNA CELLA = UN SOLO BERSAGLIO.

   Prima ogni cella conteneva due <select> impilati: quello della sigla,
   disegnato apposta (52 × 23,3 px, carattere 10px), e quello della stazione,
   che non aveva NESSUNA regola propria e quindi ereditava lo stile del campo
   di modulo delle schede (91,3 × 37,3 px, carattere 13,5px). Due controlli di
   famiglie diverse nella stessa cella. Misurato sulla griglia vera:

     · tre larghezze e due altezze diverse per lo stesso comando;
     · 27,3px di scarto verticale fra le sigle della STESSA riga, perché una
       cella con la stazione è alta il triplo di una senza e `vertical-align`
       le centra su due quote diverse;
     · 20 etichette tagliate su 42 celle in vista settimana, 107 su 107 in
       vista mese ("Anti…", "staz…"): il carattere più grande della tabella
       assegnato al testo che non si legge;
     · 5 taglie di carattere (8, 9, 10, 10,5, 13,5px) in un riquadro largo
       827px;
     · il bersaglio più usato alto 23,3px, contro i 44px minimi per un dito.

   Ora la cella MOSTRA il turno — sigla, orario, pallino della stazione — e il
   tocco apre un foglio di scelta, dove l'etichetta intera ci sta perché c'è la
   larghezza dello schermo. Un <select> è un controllo di sistema: larghezza
   della freccia, altezza minima e padding non sono governabili dal CSS in modo
   affidabile, e su telefono apre comunque un foglio a tutto schermo. Impilarne
   due in 52px voleva dire affidare l'impaginazione a qualcosa che non si
   controlla.

   La geometria è DICHIARATA, non emergente: `table-layout:fixed` più le
   variabili qui sotto. Prima la stessa tendina misurava 91,3px in settimana e
   52,0px in mese, quindi qualunque taratura in pixel valeva per una vista sola.

   Il testo di dettaglio compare solo se ci sta PER INTERO (vedi adattaTesti):
   meglio il solo pallino che "Anti…".
   ========================================================================== */

const SIGLA_VUOTA = '—';

/* Colore del pallino di una stazione. Le tinte si ricavano dalla posizione
   nell'elenco spargendo le tonalità sul giro completo, invece di pescare da
   una tavolozza a cicli: con più stazioni della tavolozza due partite
   finirebbero dello stesso colore e il pallino direbbe una cosa falsa. */
function coloreStazione(stationId){
  const i = state.stations.findIndex(st=>st.id===stationId);
  if(i < 0) return 'var(--brass)';
  const n = Math.max(state.stations.length, 1);
  return 'hsl(' + (Math.round(i*360/n) + 24) % 360 + ' 38% 58%)';
}

/* Chi non ha nessuna stazione assegnata. Il generatore non lo assegna mai
   (motore turni, punto 5): nella griglia resta visibile e assegnabile a mano,
   ma marcato — altrimenti la fila di R sembra un difetto invece di una
   conseguenza. */
function senzaStazioni(s){ return !(s.stations && s.stations.length); }

/* Le stazioni proponibili a una persona: le sue, o tutte se non ne ha
   nessuna — l'assegnazione a mano deve restare possibile. */
function stazioniPer(s){
  return senzaStazioni(s) ? state.stations : state.stations.filter(st=> s.stations.includes(st.id));
}

/* L'orario è già dentro l'etichetta del tipo di turno ("Pranzo 9:00–17:00",
   "Spezzato 10–16 / 18–23"): si legge da lì invece di aggiungere due campi al
   motore dei turni, che è coperto dai test e non ha bisogno di sapere che ore
   sono. Se l'etichetta non contiene un orario — perché ogni cucina scrive la
   sua — la cella mostra solo la sigla, come prima. Nessuna migrazione. */
function orarioDi(code){
  const m = String(CODE_LABEL(code)||'')
    .match(/\d{1,2}(?:[:.]\d{2})?\s*[–—-]\s*\d{1,2}(?:[:.]\d{2})?(?:\s*\/\s*\d{1,2}(?:[:.]\d{2})?\s*[–—-]\s*\d{1,2}(?:[:.]\d{2})?)*/);
  return m ? m[0].replace(/\s+/g,'') : '';
}

function dataLunga(iso){
  return parseISO(iso).toLocaleDateString('it-IT', {weekday:'long', day:'numeric', month:'long'});
}

/* Forme via via più corte dello stesso nome. Serve ad accorciaNomi: si sceglie
   la prima che entra nella colonna PER INTERO, invece di tagliare con i
   puntini. "Giulia De Angelis Ferrari" chiedeva 160,6px in una colonna da
   122px: andava a capo su tre righe e alzava tutta la riga, mentre "Yu"
   lasciava 109px vuoti. */
function formeNome(nome){
  const parti = String(nome||'').trim().split(/\s+/).filter(Boolean);
  if(!parti.length) return [SIGLA_VUOTA, SIGLA_VUOTA, SIGLA_VUOTA, SIGLA_VUOTA];
  const primo = parti[0];
  // Quattro caselle fisse, una per livello di accorciamento, anche quando due
  // livelli coincidono: l'indice DEVE voler dire la stessa cosa per tutti.
  // Con un elenco compattato "Yu" (che di forme ne ha una sola) finiva subito
  // sull'ultima e si leggeva "Y" mentre gli altri erano ancora per esteso.
  return [
    parti.join(' '),
    parti.length > 1 ? primo + ' ' + parti[parti.length-1][0].toUpperCase() + '.' : primo,
    primo,
    parti.map(p=>p[0].toUpperCase()).join(''),
  ];
}

/* ---- Le due passate di misura, dopo il disegno ---------------------------
   I test non coprono l'interfaccia (CLAUDE.md): queste due funzioni fanno a
   ogni disegno la misura che altrimenti andrebbe rifatta a mano a ogni
   modifica — e la fanno sulla cella VERA, non su una taratura in pixel che
   varrebbe per una vista sola. */

/* Nomi: si prova la forma più lunga, e si accorcia tutta la colonna insieme
   finché nessuno sfora. Tutti nella stessa forma, così la colonna resta
   coerente. */
function accorciaNomi(tab){
  const celle = [...tab.querySelectorAll('.nome-persona')];
  if(!celle.length) return;
  const forme = celle.map(c=> formeNome(c.dataset.nome || c.textContent));
  const passi = Math.max(...forme.map(f=>f.length));
  for(let i=0; i<passi; i++){
    celle.forEach((c,k)=>{ const f = forme[k]; c.textContent = f[Math.min(i, f.length-1)]; });
    if(!celle.some(c=> c.scrollWidth > c.clientWidth + 1)) return;
  }
}

/* Forme via via più corte del nome di una stazione. Stesso mestiere di
   formeNome, ma qui c'è un vincolo in più: vedi adattaTesti. */
function formeStazione(nome){
  const testo = String(nome||'').trim();
  const parti = testo.split(/[\s/·|,-]+/).filter(Boolean);
  if(!parti.length) return [testo, testo, testo];
  // Tre caselle fisse, come per i nomi delle persone: l'indice è il livello di
  // accorciamento, uguale per tutte le stazioni.
  // Le iniziali servono anche a un nome di una parola sola: in vista mese la
  // colonna è larga 56px e "Antipasti" non ci sta, ma "A" sì. Un'iniziale è
  // un'abbreviazione, non un troncamento — "Anti…" invece non dice niente.
  return [testo, parti[0], parti.map(p=>p[0].toUpperCase()).join('')];
}

/* Orario e nome della stazione compaiono solo se ci stanno PER INTERO.
   L'orario è o tutto o niente. Il nome della stazione si accorcia prima di
   sparire ("Secondi / griglia" → "Secondi" → "SG"), ma una forma accorciata si
   usa solo se resta UNIVOCA fra tutte le stazioni: "Secondi carne" e "Secondi
   pesce" ridotte entrambe a "Secondi" farebbero dire alla cella una cosa
   falsa, e una cella che mente è peggio di una cella muta. Quando nessuna
   forma entra resta il pallino, col nome per esteso nella legenda, nel foglio
   di scelta e nel `title`.
   La misura si fa sulla cella VERA, dopo il disegno: la stessa griglia ha
   colonne da 97px in vista settimana e da 56px in vista mese, e una taratura
   in pixel varrebbe per una vista sola. */
function adattaTesti(tab){
  tab.classList.add('con-orario', 'con-stazione');
  const sfora = sel => [...tab.querySelectorAll(sel)].some(e=> e.scrollWidth > e.clientWidth + 1);
  if(sfora('.ct-orario')) tab.classList.remove('con-orario');

  const etichette = [...tab.querySelectorAll('.ct-nome-stazione')];
  if(!etichette.length) return;
  const livelli = Math.max(1, ...state.stations.map(st=> formeStazione(st.name).length));
  for(let i=0; i<livelli; i++){
    const forme = new Map(state.stations.map(st=>{
      const f = formeStazione(st.name);
      return [st.id, f[Math.min(i, f.length-1)]];
    }));
    const valori = [...forme.values()];
    // Il livello 0 sono i nomi veri: si mostrano anche se due stazioni si
    // chiamano uguale, perché l'ambiguità è nei dati, non nell'abbreviazione.
    if(i > 0 && new Set(valori).size !== valori.length) continue;
    etichette.forEach(e=>{ e.textContent = forme.get(e.dataset.stazione) || e.dataset.nome || ''; });
    if(!sfora('.ct-nome-stazione')) return;
  }
  tab.classList.remove('con-stazione');
}

/* ---- Il foglio di scelta -------------------------------------------------
   Riusa .dialog, che esiste già. Qui l'etichetta intera si legge ("SP ·
   Spezzato 10–16 / 18–23", "Secondi / griglia") perché c'è la larghezza dello
   schermo: è il posto dove le scelte si spiegano, la cella è il posto dove il
   turno si legge. */
function apriSceltaTurno(staffId, day){
  const s = state.staff.find(x=> x.id === staffId);
  if(!s) return;
  const back = document.createElement('div');
  back.className = 'dialog-backdrop';
  document.body.appendChild(back);

  const chiudi = ()=>{ document.removeEventListener('keydown', tasti, true); back.remove(); };
  const tasti = e => { if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); chiudi(); } };
  document.addEventListener('keydown', tasti, true);
  back.addEventListener('click', e=>{ if(e.target === back) chiudi(); });

  disegnaFoglio();

  function disegnaFoglio(){
    const cella = (state.shifts[staffId]||{})[day] || {code:'', stationId:null};
    const lavora = WORKING_CODES().includes(cella.code);
    const stazioni = stazioniPer(s);
    back.innerHTML = `
      <div class="dialog foglio-turno" role="dialog" aria-modal="true" aria-label="${esc(s.name+' — '+dataLunga(day))}">
        <h3>${esc(s.name)}</h3>
        <p class="contact m-0">${esc(dataLunga(day))}</p>
        ${cella.extra ? `<p class="nota-foglio accento">Turno extra: assegnato oltre la quota di questa persona per coprire il fabbisogno.</p>` : ''}
        ${senzaStazioni(s) ? `<p class="nota-foglio">Nessuna stazione assegnata: il generatore non le dà turni, perché un turno senza stazione non copre nessun servizio. Qui puoi assegnarglielo a mano.</p>` : ''}
        <label>Turno</label>
        <div class="chip-toggle" data-gruppo="turno">
          ${Object.keys(TURNO_DEF()).map(code=>`
            <button type="button" data-code="${esc(code)}" class="${cella.code===code?'on':''}">${esc(code ? CODE_LABEL(code) : SIGLA_VUOTA)}</button>`).join('')}
        </div>
        ${lavora ? `
          <label>Stazione</label>
          ${stazioni.length ? `<div class="chip-toggle" data-gruppo="stazione">
            <button type="button" data-station="" class="${!cella.stationId?'on':''}">nessuna</button>
            ${stazioni.map(st=>`<button type="button" data-station="${esc(st.id)}" class="${cella.stationId===st.id?'on':''}">
              <i class="ct-pallino" style="--pallino:${coloreStazione(st.id)}"></i>${esc(st.name)}</button>`).join('')}
          </div>` : `<p class="nota-foglio">Nessuna stazione definita: si aggiungono nella scheda Stazioni.</p>`}
        ` : ''}
        <div class="dialog-actions"><button class="btn ghost" data-chiudi>Chiudi</button></div>
      </div>`;

    back.querySelector('[data-chiudi]').addEventListener('click', chiudi);
    back.querySelectorAll('[data-gruppo="turno"] button').forEach(b=>
      b.addEventListener('click', ()=> scegliTurno(b.dataset.code)));
    back.querySelectorAll('[data-gruppo="stazione"] button').forEach(b=>
      b.addEventListener('click', ()=> scegliStazione(b.dataset.station)));
  }

  function scegliTurno(code){
    state.shifts[staffId] = state.shifts[staffId] || {};
    const prima = state.shifts[staffId][day] || {code:'', stationId:null};
    // Un codice che non copre servizi (riposo, ferie, malattia) non può
    // portarsi dietro una stazione: sarebbe un dato che non vuol dire niente.
    state.shifts[staffId][day] = {
      code, stationId: WORKING_CODES().includes(code) ? prima.stationId : null, extra: !!prima.extra,
    };
    save('shifts');
    disegnaFoglio(); aggiornaTutto();
  }
  function scegliStazione(stationId){
    const giorni = state.shifts[staffId] = state.shifts[staffId] || {};
    giorni[day] = giorni[day] || {code:'', stationId:null};
    giorni[day].stationId = stationId || null;
    save('shifts');
    disegnaFoglio(); aggiornaTutto();
  }
}

function aggiornaTutto(){ renderTurni(); renderOreExtra(); renderDashboard(); }

/* Girare il telefono cambia la larghezza delle colonne, quindi cambia cosa ci
   sta dentro. Le due passate di misura vanno rifatte: senza, restano in piedi
   le decisioni prese per l'altra larghezza e il testo torna tagliato — provato
   passando da 900px a 375px senza ridisegnare, e si leggeva di nuovo "Antipa",
   "Pastic", "Lavagg". Si rimisura soltanto, senza ridisegnare: la griglia
   scorsa a metà mese resta dov'era. */
let attesaRiadatta = 0;
window.addEventListener('resize', ()=>{
  clearTimeout(attesaRiadatta);
  attesaRiadatta = setTimeout(()=>{
    const tab = document.querySelector('#turni-panel .shift-table');
    if(!tab) return;
    accorciaNomi(tab);
    adattaTesti(tab);
  }, 120);
});

export function renderTurni(){
  const el = document.getElementById('turni-panel');
  document.getElementById('period-label').textContent = periodLabel();
  document.querySelectorAll('.period-modes button').forEach(b=>
    b.classList.toggle('active', b.dataset.period === periodMode));
  if(!state.staff.length){ el.innerHTML = `<div class="empty">Aggiungi prima persone alla brigata.</div>`; return; }
  const dates = periodDates();
  const oggi = isoDate(new Date());
  // Le ore per persona le calcola già weeklyExtraFromTurni(): si riusa, non si
  // duplica — e viene fuori nello stesso ordine di state.staff, quindi la riga
  // i-esima della griglia e la riga i-esima del conteggio sono la stessa persona.
  const ore = weeklyExtraFromTurni();

  // L'ORDINE DELLE RIGHE È L'ORDINE DI state.staff, cioè quello che il titolare
  // ha deciso con i pulsanti su/giù nella brigata. Non si riordina qui: due
  // ordinamenti diversi per lo stesso elenco sono due elenchi diversi.
  el.innerHTML = `
    <div class="shift-scroll">
    <table class="shift-table">
      <colgroup>
        <col class="c-nome">${dates.map(()=>`<col class="c-giorno">`).join('')}<col class="c-ore">
      </colgroup>
      <thead><tr><th class="name-col left">Persona</th>${dates.map(d=>{
        const g = dayName(d), weekend = (g==='Sab'||g==='Dom');
        return `<th class="${d===oggi?'today':''} ${weekend?'weekend':''}">${g}<br>${parseISO(d).getDate()}</th>`;
      }).join('')}<th class="ore-col">Ore</th></tr></thead>
      <tbody>
        ${state.staff.map((s,i)=>`
          <tr>
            <td class="name ${senzaStazioni(s)?'senza-stazioni':''}" title="${esc(s.name + (senzaStazioni(s)?' — nessuna stazione assegnata: il generatore non lo assegna':''))}">
              <i class="ct-pallino vuoto" aria-hidden="true"></i><span class="nome-persona" data-nome="${esc(s.name)}">${esc(s.name)}</span>
            </td>
            ${dates.map(d=> cellaHtml(s, d, oggi)).join('')}
            ${orePersonaHtml(ore[i])}
          </tr>
        `).join('')}
      </tbody>
      ${totaliHtml(dates, oggi, ore)}
    </table>
    </div>
  `;

  const tab = el.querySelector('.shift-table');
  // Il numero di giorni è un dato, non una decisione di stile: serve al CSS per
  // calcolare la larghezza minima della tabella (vedi --turni-col).
  tab.style.setProperty('--n-giorni', String(dates.length));
  tab.querySelectorAll('.cella-turno').forEach(b=>
    b.addEventListener('click', ()=> apriSceltaTurno(b.dataset.staff, b.dataset.day)));
  accorciaNomi(tab);
  adattaTesti(tab);
  renderLegenda();
}

function cellaHtml(s, d, oggi){
  const cella = (state.shifts[s.id]||{})[d] || {code:'', stationId:null};
  const lavora = WORKING_CODES().includes(cella.code);
  const st = lavora ? state.stations.find(x=> x.id === cella.stationId) : null;
  const orario = lavora ? orarioDi(cella.code) : '';
  const titolo = s.name + ' · ' + dataLunga(d) + ' · ' + CODE_LABEL(cella.code)
    + (st ? ' · ' + st.name : '') + (cella.extra ? ' · turno extra' : '');
  return `<td class="${d===oggi?'today-col':''}">
    <button type="button" class="cella-turno${cella.extra?' extra':''}" data-staff="${esc(s.id)}" data-day="${esc(d)}" title="${esc(titolo)}">
      <span class="ct-sigla ${esc(cella.code)}">${esc(cella.code || SIGLA_VUOTA)}</span>
      <span class="ct-orario">${esc(orario)}</span>
      <span class="ct-stazione">${st
        ? `<i class="ct-pallino" style="--pallino:${coloreStazione(st.id)}"></i><span class="ct-nome-stazione" data-stazione="${esc(st.id)}" data-nome="${esc(st.name)}">${esc(st.name)}</span>`
        : ''}</span>
    </button>
  </td>`;
}

/* ---- I totali dentro la griglia -----------------------------------------
   Il dato che serve — quante ore ho fatto, il giovedì è coperto — c'era già,
   ma stava altrove: le ore per persona in un riquadro separato, il totale per
   giorno da nessuna parte. Qui non compare nessun numero nuovo: la colonna
   riusa lo stesso calcolo del riquadro "Ore extra del periodo", che sta nella
   stessa scheda ed è sempre stato visibile a chiunque veda questa griglia. */
function orePersonaHtml(r){
  const scarto = r.extra > 0 ? '+' + r.extra.toFixed(1) + 'h'
               : (r.under > 0 ? '−' + r.under.toFixed(1) + 'h' : 'in linea');
  const classe = r.extra > 0 ? 'extra' : (r.under > 0 ? 'under' : '');
  const titolo = r.name + ' · ' + r.totalHours.toFixed(1) + 'h pianificate'
    + (r.contracted ? ' su ' + r.contracted.toFixed(1) + 'h contrattuali nel periodo' : '');
  return `<td class="ore" title="${esc(titolo)}">
    <span class="ore-tot">${r.totalHours.toFixed(1)}h</span>
    <span class="ore-scarto ${classe}">${esc(scarto)}</span>
  </td>`;
}

/* Riga dei totali per giorno: ore e teste. È il controllo che mancava del
   tutto — si vede a colpo d'occhio se un giovedì è scoperto. */
function totaliHtml(dates, oggi, ore){
  const celle = dates.map(d=>{
    let h = 0, teste = 0;
    state.staff.forEach(s=>{
      const code = ((state.shifts[s.id]||{})[d]||{}).code || '';
      h += CODE_HOURS(code);
      if(WORKING_CODES().includes(code)) teste++;
    });
    const titolo = dataLunga(d) + ' · ' + h.toFixed(1) + 'h su ' + teste + (teste===1?' persona':' persone');
    return `<td class="${d===oggi?'today-col':''}" title="${esc(titolo)}">
      <span class="ore-tot">${h.toFixed(1)}h</span>
      <span class="ore-scarto">${teste}</span>
    </td>`;
  }).join('');
  const totale = ore.reduce((n,r)=> n + r.totalHours, 0);
  return `<tfoot><tr>
    <th class="name-col left">Totale</th>${celle}
    <td class="ore"><span class="ore-tot">${totale.toFixed(1)}h</span><span class="ore-scarto">periodo</span></td>
  </tr></tfoot>`;
}

/* La legenda non è decorativa: quando il nome della stazione non entra nella
   cella, il pallino è l'unica cosa che resta — e qui si legge cosa vuol dire.
   Stesso posto per la marcatura di chi il generatore non assegna. */
function renderLegenda(){
  const el = document.getElementById('turni-legend');
  if(!el) return;
  const turni = Object.entries(TURNO_DEF()).filter(([c])=>c).map(([,v])=> esc(v.label)).join(' · ');
  const stazioni = state.stations.map(st=>
    `<span class="voce-legenda"><i class="ct-pallino" style="--pallino:${coloreStazione(st.id)}"></i>${esc(st.name)}</span>`).join('');
  const orfani = state.staff.some(senzaStazioni)
    ? `<span class="voce-legenda"><i class="ct-pallino vuoto"></i>senza stazioni: il generatore non li assegna, si assegnano a mano</span>`
    : '';
  el.innerHTML = turni + (stazioni||orfani ? `<span class="riga-legenda">${stazioni}${orfani}</span>` : '');
}

export function weeklyExtraFromTurni(){
  const dates = periodDates();
  // Le ore contrattuali sono settimanali: su un mese vanno rapportate alla
  // durata del periodo, altrimenti chiunque risulterebbe in fortissimo extra.
  const settimane = dates.length / 7;
  return state.staff.map(s=>{
    const days = state.shifts[s.id] || {};
    const totalHours = dates.reduce((sum,d)=> sum + CODE_HOURS((days[d]||{}).code||''), 0);
    const contracted = (parseFloat(s.hours)||0) * settimane;
    const extra = Math.max(0, totalHours - contracted);
    const under = contracted>0 ? Math.max(0, contracted-totalHours) : 0;
    return {id:s.id, name:s.name, totalHours, contracted, extra, under};
  });
}
export function renderOreExtra(){
  const el = document.getElementById('ore-extra-table');
  if(!state.staff.length){ el.innerHTML = `<div class="empty">Nessuna persona in brigata.</div>`; return; }
  const rows = weeklyExtraFromTurni();
  el.innerHTML = `
    <table class="hours-table">
      <thead><tr><th>Persona</th><th>Ore pianificate</th><th>Contrattuali</th><th>Extra</th></tr></thead>
      <tbody>
        ${rows.map(r=>`<tr>
          <td>${esc(r.name)}</td>
          <td class="num">${r.totalHours.toFixed(1)}h</td>
          <td class="num">${r.contracted? r.contracted.toFixed(1)+'h':'—'}</td>
          <td class="num ${r.extra>0?'extra':(r.under>0?'under':'')}">${r.extra>0? '+'+r.extra.toFixed(1)+'h' : (r.under>0? '−'+r.under.toFixed(1)+'h sotto':'in linea')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;
}
