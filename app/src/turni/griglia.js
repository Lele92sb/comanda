import { CODE_HOURS, CODE_LABEL, SERVICE_LABEL, SHIFT_CONFIG, TURNO_DEF, WORKING_CODES, esc, periodDates, periodLabel, periodMode, save, state } from '../core/state.js';
import { assegnaStazione, dayName, isoDate, normalizzaCella, parseISO, serviziDelCodice, stazioneDi, stazioniDi } from '../lib/logic.js';
import { renderDashboard } from '../viste/dashboard.js';
// fabbisogno.js importa da qui `coloreStazione`, e qui si importa `renderCapienza`
// da lì: i due moduli si citano a vicenda. È lecito perché nessuno dei due usa
// l'altro mentre viene caricato — solo dentro funzioni, chiamate dopo. Stessa
// coppia che griglia.js e dashboard.js formano da sempre due righe più su.
import { renderCapienza } from './fabbisogno.js';
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
export function coloreStazione(stationId){
  const i = state.stations.findIndex(st=>st.id===stationId);
  if(i < 0) return 'var(--brass)';
  // Il colore scelto dal titolare vince su quello calcolato: quello automatico
  // e' un ripiego decoroso, il suo e' un'informazione — «il lavaggio e' blu» se
  // lo dice lui vuol dire qualcosa in cucina.
  const scelto = state.stations[i].colore;
  if(scelto) return scelto;
  const n = Math.max(state.stations.length, 1);
  return 'hsl(' + (Math.round(i*360/n) + 24) % 360 + ' 38% 58%)';
}

/* Colore di un TIPO DI TURNO. Stessa regola: se il titolare l'ha scelto vale
   il suo, altrimenti resta quello che il foglio di stile da' alla sigla. */
export function coloreTurno(code){
  const t = (state.shiftTypes||[]).find(x=> x.code === code);
  return (t && t.colore) || null;
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
  // Quattro livelli, non tre. Quello in mezzo — due lettere per parola — e'
  // nato dalle partite vere di una cucina: Pass e Primi hanno la stessa
  // iniziale, quindi il livello delle iniziali viene saltato perche' non e'
  // univoco, e si resta col nome intero. In una cella che deve dire DUE
  // partite ("Pass/Primi", dieci caratteri in una colonna da 97px) questo
  // vuol dire non dirne nessuna. Con due lettere diventa "Pa/Pr" e ci sta.
  // Resta un'abbreviazione e non un troncamento: e' la stessa regola delle
  // iniziali, con una lettera in piu' quando una sola non basta a distinguere.
  const due = parti.map(p=> p.slice(0,2)).join('');
  return [testo, parti[0], due.charAt(0).toUpperCase() + due.slice(1),
          parti.map(p=>p[0].toUpperCase()).join('')];
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
  const formeAl = i => {
    const forme = new Map(state.stations.map(st=>{
      const f = formeStazione(st.name);
      return [st.id, f[Math.min(i, f.length-1)]];
    }));
    const valori = [...forme.values()];
    // Il livello 0 sono i nomi veri: si mostrano anche se due stazioni si
    // chiamano uguale, perché l'ambiguità è nei dati, non nell'abbreviazione.
    return (i > 0 && new Set(valori).size !== valori.length) ? null : forme;
  };
  // I due gruppi si accorciano SEPARATAMENTE, e non è pignoleria: una cella a
  // due partite ha bisogno del doppio dello spazio, e se decidesse per tutti
  // basterebbero tre celle doppie a far scrivere «Pa» al posto di «Pass» nelle
  // altre sessanta. Ogni gruppo scende al primo livello che gli sta.
  const gruppi = [
    { sel: '.ct-nome-stazione:not([data-stazione2])',
      quali: etichette.filter(e=> !e.dataset.stazione2),
      testo: (e,f) => f.get(e.dataset.stazione) || e.dataset.nome || '' },
    { sel: '.ct-nome-stazione[data-stazione2]',
      quali: etichette.filter(e=> e.dataset.stazione2),
      // Le due metà si accorciano allo STESSO livello: «Pass/Pr» farebbe
      // sembrare che una delle due valga più dell'altra.
      testo: (e,f) => (f.get(e.dataset.stazione) || e.dataset.nome || '')
                    + '/' + (f.get(e.dataset.stazione2) || e.dataset.nome2 || '') },
  ];
  gruppi.forEach(g=>{
    if(!g.quali.length) return;
    for(let i=0; i<livelli; i++){
      const forme = formeAl(i);
      if(!forme) continue;
      g.quali.forEach(e=>{ e.textContent = g.testo(e, forme); });
      if(!sfora(g.sel)) return;
    }
    // Nessuna forma entra: per QUESTO gruppo restano i pallini. Le celle a una
    // partita sola non pagano per quelle a due.
    g.quali.forEach(e=>{ e.textContent = ''; });
  });
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

  /* Una partita per tutti i servizi o una per ciascuno. È una scelta che si
     ricorda finché il foglio resta aperto, e parte da quello che la cella dice
     già: chi non fa partite miste — cioè quasi tutti, e tutti quelli che hanno
     dati salvati da prima — non se ne accorge nemmeno. Chiedere due volte la
     stessa stazione sarebbe una tassa su chi non fa spezzati misti. */
  let collegate = null;

  disegnaFoglio();

  function disegnaFoglio(){
    const cella = (state.shifts[staffId]||{})[day] || {code:'', stations:{}};
    const lavora = WORKING_CODES().includes(cella.code);
    const stazioni = stazioniPer(s);
    const servizi = lavora ? (serviziDelCodice(cella.code, SHIFT_CONFIG()) || []) : [];
    if(collegate === null){
      collegate = servizi.every(sv=> stazioneDi(cella, sv) === stazioneDi(cella, servizi[0]));
    }
    // Un gruppo di scelte per servizio, o uno solo per tutta la giornata. Con un
    // turno che copre un servizio solo l'aspetto è identico a prima.
    const gruppi = (servizi.length > 1 && !collegate)
      ? servizi.map(sv=> ({sv, etichetta: SERVICE_LABEL(sv), scelta: stazioneDi(cella, sv)}))
      : [{sv:'*', etichetta:'Stazione', scelta: stazioneDi(cella, servizi[0])}];
    const gruppoHtml = g => `
      <label>${esc(g.etichetta)}</label>
      <div class="chip-toggle" data-gruppo="stazione" data-servizio="${esc(g.sv)}">
        <button type="button" data-station="" class="${!g.scelta?'on':''}">nessuna</button>
        ${stazioni.map(st=>`<button type="button" data-station="${esc(st.id)}" class="${g.scelta===st.id?'on':''}">
          <i class="ct-pallino" style="--pallino:${coloreStazione(st.id)}"></i>${esc(st.name)}</button>`).join('')}
      </div>`;
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
        ${lavora ? (stazioni.length ? `
          ${servizi.length > 1 ? `<div class="chip-toggle" data-gruppo="collega">
            <button type="button" data-collega="1" class="${collegate?'on':''}">stessa partita tutto il giorno</button>
            <button type="button" data-collega="0" class="${collegate?'':'on'}">una per servizio</button>
          </div>` : ''}
          ${gruppi.map(gruppoHtml).join('')}
        ` : `<p class="nota-foglio">Nessuna stazione definita: si aggiungono nella scheda Stazioni.</p>`) : ''}
        <div class="dialog-actions"><button class="btn ghost" data-chiudi>Chiudi</button></div>
      </div>`;

    back.querySelector('[data-chiudi]').addEventListener('click', chiudi);
    back.querySelectorAll('[data-gruppo="turno"] button').forEach(b=>
      b.addEventListener('click', ()=> scegliTurno(b.dataset.code)));
    back.querySelectorAll('[data-gruppo="collega"] button').forEach(b=>
      b.addEventListener('click', ()=>{ collegate = b.dataset.collega === '1'; disegnaFoglio(); }));
    back.querySelectorAll('[data-gruppo="stazione"]').forEach(g=>
      g.querySelectorAll('button').forEach(b=>
        b.addEventListener('click', ()=> scegliStazione(g.dataset.servizio, b.dataset.station))));
  }

  function scegliTurno(code){
    state.shifts[staffId] = state.shifts[staffId] || {};
    const cella = state.shifts[staffId][day] || {code:'', stations:{}, extra:false};
    cella.code = code;
    // Cambiando il turno cambia cosa copre, e la normalizzazione fa il resto: i
    // servizi che il nuovo codice non copre perdono la chiave, quelli nuovi
    // ereditano la stazione già decisa — passando da P a SP il pranzo non si
    // ridecide. Un codice che non copre servizi (riposo, ferie, malattia) resta
    // senza stazione: sarebbe un dato che non vuol dire niente.
    state.shifts[staffId][day] = normalizzaCella(cella, SHIFT_CONFIG());
    save('shifts');
    disegnaFoglio(); aggiornaTutto();
  }
  function scegliStazione(sv, stationId){
    const giorni = state.shifts[staffId] = state.shifts[staffId] || {};
    const cella = giorni[day] = giorni[day] || {code:'', stations:{}};
    const quali = (sv === '*') ? (serviziDelCodice(cella.code, SHIFT_CONFIG()) || []) : [sv];
    quali.forEach(x=> assegnaStazione(cella, x, stationId, SHIFT_CONFIG()));
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
    // Anche le frecce vanno rifatte: cambiando larghezza cambia quanti giorni
    // ci stanno, e quindi se servono e cosa scrivono.
    const box = tab.closest('.shift-scroll');
    if(box) box.dispatchEvent(new Event('scroll'));
  }, 120);
});

export function renderTurni(){
  const el = document.getElementById('turni-panel');
  // Il conto di capienza sta sopra il pulsante che genera, ma dipende dalle
  // stesse tre cose di questa griglia — periodo, brigata, fabbisogno — e
  // renderTurni() è l'unica funzione che gira a ogni cambio di tutte e tre
  // (cambio periodo, ingresso nella scheda, modifica di una cella). Agganciarlo
  // qui vuol dire che non può restare indietro; agganciato alla sola scheda
  // Fabbisogno resterebbe fermo sul periodo di prima.
  // Prima del `return` per la brigata vuota: senza persone il conto dice
  // «servono 28, coperti 0», ed è esattamente quello che si vuole leggere.
  renderCapienza();
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
  const posPrec = posizioneScorrimento(el);
  el.innerHTML = `
    <div class="shift-nav hidden">
      <button type="button" data-passo="-1" title="Giorni precedenti">‹</button>
      <span class="shift-nav-label"></span>
      <button type="button" data-passo="1" title="Giorni successivi">›</button>
    </div>
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
  collegaScorrimento(el, tab, dates, oggi, posPrec);
  renderLegenda();
}

/* ---- Scorrimento orizzontale: non perdere il segno -----------------------
   Su un telefono la vista mese è larga 1904px in una finestra da 302px: sono
   sei schermate, e senza un riferimento non si sa più dove si è. Tre cose,
   nessuna delle quali è una vista nuova da imparare:
   1. la posizione si conserva fra un disegno e l'altro — renderTurni() gira a
      ogni modifica di una cella, e senza questo assegnare un turno il 20 del
      mese riportava la griglia al giorno 1;
   2. cambiando periodo si parte da oggi, se oggi è nel periodo;
   3. due frecce spostano di una schermata di giorni per volta, con scritto
      quali giorni si stanno guardando. Compaiono solo se c'è da scorrere. */
function posizioneScorrimento(el){
  const box = el.querySelector('.shift-scroll');
  return box ? {x: box.scrollLeft, y: box.scrollTop} : null;
}

let ultimoPeriodo = '';

function collegaScorrimento(el, tab, dates, oggi, posPrec){
  const box = el.querySelector('.shift-scroll');
  const nav = el.querySelector('.shift-nav');
  if(!box || !nav) return;

  const larghezzaColonna = ()=> tab.querySelector('thead th:nth-child(2)').getBoundingClientRect().width || 1;
  const larghezzaNome = ()=> tab.querySelector('thead th.name-col').getBoundingClientRect().width;
  // Quanti giorni interi ci stanno oltre la colonna dei nomi, che resta ferma.
  const giorniPerSchermata = ()=> Math.max(1, Math.floor((box.clientWidth - larghezzaNome()) / larghezzaColonna()));

  const chiave = periodMode + '|' + dates[0] + '|' + dates.length;
  if(chiave === ultimoPeriodo && posPrec){
    box.scrollLeft = posPrec.x; box.scrollTop = posPrec.y;
  } else {
    const colOggi = dates.indexOf(oggi);
    if(colOggi >= 0){
      // Al centro, non al bordo: sul bordo sinistro finirebbe sotto la colonna
      // dei nomi, che è appiccicata e ci passa sopra.
      const col = larghezzaColonna();
      const centrato = colOggi*col - (box.clientWidth - larghezzaNome() - col)/2;
      // Arrotondato a colonne intere: fermandosi a metà colonna il primo
      // giorno resta mezzo nascosto sotto la colonna dei nomi, e le frecce
      // (che spostano di multipli esatti) trascinerebbero lo sfasamento.
      box.scrollLeft = Math.max(0, Math.round(centrato/col)*col);
    }
  }
  ultimoPeriodo = chiave;

  const etichetta = iso => parseISO(iso).toLocaleDateString('it-IT', {day:'numeric', month:'short'});
  const aggiorna = ()=>{
    const serve = box.scrollWidth > box.clientWidth + 2;
    nav.classList.toggle('hidden', !serve);
    if(!serve) return;
    const col = larghezzaColonna();
    const primo = Math.min(dates.length-1, Math.max(0, Math.round(box.scrollLeft / col)));
    const ultimo = Math.min(dates.length-1, primo + giorniPerSchermata() - 1);
    nav.querySelector('.shift-nav-label').textContent =
      etichetta(dates[primo]) + (ultimo > primo ? ' – ' + etichetta(dates[ultimo]) : '');
    nav.querySelector('[data-passo="-1"]').disabled = box.scrollLeft <= 1;
    nav.querySelector('[data-passo="1"]').disabled = box.scrollLeft >= box.scrollWidth - box.clientWidth - 1;
  };

  nav.querySelectorAll('[data-passo]').forEach(b=> b.addEventListener('click', ()=>{
    box.scrollBy({left: Number(b.dataset.passo) * giorniPerSchermata() * larghezzaColonna(), behavior:'smooth'});
  }));
  let inCorso = false;
  box.addEventListener('scroll', ()=>{
    if(inCorso) return;
    inCorso = true;
    requestAnimationFrame(()=>{ inCorso = false; aggiorna(); });
  });
  aggiorna();
}

/* Le partite di una giornata, in ordine di servizio e senza ripetizioni. Una
   sola è il caso normale; due vogliono dire due partite nello stesso giorno —
   a pranzo ai primi, a cena al pass. */
function partiteDi(cella){
  return stazioniDi(cella, SHIFT_CONFIG())
    .map(id=> state.stations.find(x=> x.id === id))
    .filter(Boolean);
}
/* Il dettaglio servizio per servizio, per il `title`: "Pranzo: Primi",
   "Cena: Pass". Nella cella non ci starebbe mai, qui sì. */
function dettaglioPartite(cella){
  return (serviziDelCodice(cella.code, SHIFT_CONFIG()) || []).map(sv=>{
    const st = state.stations.find(x=> x.id === stazioneDi(cella, sv));
    return st ? SERVICE_LABEL(sv) + ': ' + st.name : null;
  }).filter(Boolean);
}

function cellaHtml(s, d, oggi){
  const cella = (state.shifts[s.id]||{})[d] || {code:'', stations:{}};
  const lavora = WORKING_CODES().includes(cella.code);
  const partite = lavora ? partiteDi(cella) : [];
  const orario = lavora ? orarioDi(cella.code) : '';
  // Con due partite si scrivono ENTRAMBE, abbreviate: «Pa/Pr». Qui prima
  // restavano i soli pallini, e il dettaglio stava nel `title` — che su un
  // telefono non esiste. Ma «a pranzo ai primi, a cena al pass» è proprio la
  // cosa che lo chef aveva chiesto: lasciarla leggibile solo col mouse voleva
  // dire non averla fatta. Sei pallini colorati non si tengono a mente.
  // Le abbreviazioni sono le stesse di una partita sola (`formeStazione`), e se
  // la coppia non ci sta nemmeno al livello più corto vale la regola di sempre:
  // si spengono i nomi e restano i pallini.
  const nome = partite.length === 1 ? partite[0] : null;
  const coppia = partite.length === 2 ? partite : null;
  const titolo = s.name + ' · ' + dataLunga(d) + ' · ' + CODE_LABEL(cella.code)
    + (partite.length === 1 ? ' · ' + partite[0].name
       : partite.length > 1 ? ' · ' + dettaglioPartite(cella).join(' / ') : '')
    + (cella.extra ? ' · turno extra' : '');
  return `<td class="${d===oggi?'today-col':''}">
    <button type="button" class="cella-turno${cella.extra?' extra':''}" data-staff="${esc(s.id)}" data-day="${esc(d)}" title="${esc(titolo)}">
      <span class="ct-sigla ${esc(cella.code)}"${(()=>{ const c = coloreTurno(cella.code);
        // Il colore scelto si scrive in riga: le regole del foglio di stile
        // (.ct-sigla.P, .ct-sigla.SP...) valgono solo per le sigle predefinite,
        // e una sigla inventata dal titolare non ne avrebbe nessuna.
        return c ? ` style="background:${esc(c)};border-color:${esc(c)};color:#1d1b18;font-weight:700;"` : ''; })()}>${esc(cella.code || SIGLA_VUOTA)}</span>
      <span class="ct-orario">${esc(orario)}</span>
      <span class="ct-stazione">${partite.map(st=>
        `<i class="ct-pallino" style="--pallino:${coloreStazione(st.id)}"></i>`).join('')}${nome
        ? `<span class="ct-nome-stazione" data-stazione="${esc(nome.id)}" data-nome="${esc(nome.name)}">${esc(nome.name)}</span>`
        : coppia
        ? `<span class="ct-nome-stazione" data-stazione="${esc(coppia[0].id)}" data-nome="${esc(coppia[0].name)}" data-stazione2="${esc(coppia[1].id)}" data-nome2="${esc(coppia[1].name)}">${esc(coppia[0].name)}/${esc(coppia[1].name)}</span>`
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
  // Due pallini in una cella sono l'unica cosa che si vede quando il nome della
  // stazione non ci sta, e da soli non si spiegano. La voce compare solo se nel
  // periodo c'è davvero una giornata su due partite: una legenda che spiega
  // qualcosa che non c'è è rumore.
  const dueDavvero = state.staff.some(s=> periodDates().some(d=>
    partiteDi((state.shifts[s.id]||{})[d] || {}).length > 1));
  const doppie = dueDavvero
    ? `<span class="voce-legenda"><i class="ct-pallino" style="--pallino:var(--brass)"></i><i class="ct-pallino" style="--pallino:var(--brass)"></i>due partite nella stessa giornata: a pranzo una, a cena l'altra</span>`
    : '';
  el.innerHTML = turni + (stazioni||orfani||doppie ? `<span class="riga-legenda">${stazioni}${orfani}${doppie}</span>` : '');
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
