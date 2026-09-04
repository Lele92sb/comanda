// ============================================================================
// COSA È CAMBIATO fra due elenchi.
//
// È il cuore del passaggio alle tabelle vere: prima ogni salvataggio riscriveva
// la sezione intera — a 5.000 ingredienti, 620 KB per cambiare un prezzo — e
// adesso si toccano solo le righe che differiscono, di solito una.
//
// STA QUI E NON IN `cloud.js` per la ragione di sempre: dentro `cloud.js` c'è
// il client di Supabase, e una regola che vive accanto a una connessione di
// rete non si può provare senza rete. Qui gira dentro Node e ha dei test.
//
// E la regola merita dei test più di quanto sembri. Un confronto sbagliato non
// dà un errore: dà un salvataggio che non salva. Si scrive un prezzo, l'app
// dice «salvato», e il prezzo vecchio resta lì — perché il confronto ha
// deciso che le due righe erano uguali. È il genere di difetto che si scopre
// il mese dopo guardando un food cost che non torna.
// ============================================================================

/**
 * Le righe da scrivere e quelle da togliere.
 *
 * `campi` elenca cosa guardare per decidere se due righe sono diverse. È un
 * elenco esplicito e non «tutti i campi» apposta: le righe che arrivano dal
 * database si portano dietro roba che il client non ha (`aggiornato_il`), e
 * confrontarla farebbe risultare cambiato tutto a ogni giro.
 */
export function differenze(nuovi, precedenti, campi){
  const prima = new Map((precedenti || []).map(r => [r.id, r]));
  const dopo  = new Map((nuovi || []).map(r => [r.id, r]));

  const daScrivere = [];
  for(const [id, r] of dopo){
    if(!uguali(r, prima.get(id), campi)) daScrivere.push(r);
  }

  const daTogliere = [];
  for(const id of prima.keys()){
    if(!dopo.has(id)) daTogliere.push(id);
  }

  return { daScrivere, daTogliere };
}

/**
 * Due righe sono uguali se lo sono tutti i campi indicati.
 *
 * IL CONFRONTO PASSA DALLE STRINGHE, e non è pigrizia. I campi numerici del
 * browser restituiscono stringhe: chi scrive «2.40» in un campo mette la
 * STRINGA '2.40' in `state`, mentre dal database quello stesso prezzo torna
 * come NUMERO 2.4. Un `===` li direbbe diversi, e ogni salvataggio
 * riscriverebbe l'anagrafica intera — cioè esattamente quello che questo
 * codice esiste per evitare.
 *
 * `Number(...)` sui valori che sembrano numeri risolve anche '2.40' contro
 * '2.4', che sono la stessa cifra scritta in due modi.
 */
export function uguali(a, b, campi){
  if(!a || !b) return false;
  return (campi || []).every(c => stessoValore(a[c], b[c]));
}

function eVuoto(v){
  if(v === null || v === undefined || v === '') return true;
  if(Array.isArray(v)) return v.length === 0;
  if(typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

function stessoValore(x, y){
  // Vuoto, nullo e non definito sono la stessa cosa: un campo mai compilato e
  // un campo svuotato non sono due stati diversi per chi guarda.
  //
  // E fra i vuoti ci sono anche la LISTA VUOTA e l'OGGETTO VUOTO. Una ricetta
  // senza allergeni arriva dal database come `[]` e dal client a volte come
  // `undefined`: senza questa riga risulterebbe cambiata a ogni giro, e ogni
  // salvataggio riscriverebbe tutte le ricette che non hanno allergeni — cioe'
  // quasi tutte.
  const vuotoX = eVuoto(x), vuotoY = eVuoto(y);
  if(vuotoX || vuotoY) return vuotoX && vuotoY;

  if(typeof x === 'boolean' || typeof y === 'boolean') return !!x === !!y;

  // LISTE E OGGETTI si confrontano per contenuto. Senza questo ramo,
  // `String([{...}])` da' «[object Object]» per QUALUNQUE contenuto: due
  // ricette con componenti completamente diversi risulterebbero uguali, e i
  // componenti non si salverebbero MAI. Nessun errore, nessun segnale: si
  // scrive una ricetta, l'app dice «salvato», e dentro non c'e' niente.
  //
  // Si usa JSON, e per queste liste e' giusto: l'ordine E' il dato — le
  // portate di un menu degustazione, le righe di una ricetta, i gruppi di
  // turni in ordine di preferenza. Due ordini diversi sono due cose diverse.
  if(typeof x === 'object' || typeof y === 'object'){
    try{ return JSON.stringify(x) === JSON.stringify(y); }
    catch(e){ return false; }   // riferimenti circolari: meglio riscrivere che perdere
  }

  const nx = Number(x), ny = Number(y);
  if(Number.isFinite(nx) && Number.isFinite(ny)) return nx === ny;

  return String(x) === String(y);
}

/* ============================================================================
   LE CELLE DEI TURNI sono fatte diversamente, e vogliono un confronto loro.

   Non sono un elenco di righe con un `id`: sono una mappa annidata,
   `{personaId: {giorno: cella}}`. E hanno una regola in più che gli elenchi non
   hanno: una cella VUOTA non è una cella con dentro il vuoto — è una cella che
   non c'è. Un prospetto mezzo compilato non deve costare righe quanto uno
   pieno, e «— » in una casella è l'assenza di un turno, non un turno di tipo
   niente.
   ============================================================================ */

/** Vero se questa cella non contiene un turno. */
function vuota(c){ return !c || !c.code; }

/**
 * Cosa scrivere e cosa cancellare, passando da una mappa di celle all'altra.
 *
 * Restituisce righe piatte — `{staff_id, giorno, code, stations}` — perché è
 * la forma in cui vanno nel database, e ricomporre la mappa è mestiere di chi
 * legge, non di chi confronta.
 */
export function differenzeCelle(nuove, precedenti){
  const daScrivere = [], daTogliere = [];
  const prima = precedenti || {}, dopo = nuove || {};

  for(const staffId of Object.keys(dopo)){
    for(const [giorno, cella] of Object.entries(dopo[staffId] || {})){
      const vecchia = (prima[staffId] || {})[giorno];
      if(vuota(cella)){
        // Si cancella solo se PRIMA c'era qualcosa: cancellare una cella già
        // inesistente sarebbe una scrittura per niente, e su un prospetto
        // mensile appena sfiorato sarebbero seicento scritture per niente.
        if(!vuota(vecchia)) daTogliere.push({ staff_id: staffId, giorno });
        continue;
      }
      if(stessaCella(cella, vecchia)) continue;
      daScrivere.push({
        staff_id: staffId, giorno,
        code: cella.code,
        stations: cella.stations || {},
      });
    }
  }

  // Le celle sparite dalla mappa: una persona tolta dalla brigata, un giorno
  // uscito dal periodo.
  for(const staffId of Object.keys(prima)){
    for(const [giorno, vecchia] of Object.entries(prima[staffId] || {})){
      if(vuota(vecchia)) continue;
      if((dopo[staffId] || {})[giorno] === undefined){
        daTogliere.push({ staff_id: staffId, giorno });
      }
    }
  }

  return { daScrivere, daTogliere };
}

function stessaCella(a, b){
  if(vuota(a) || vuota(b)) return vuota(a) && vuota(b);
  if(a.code !== b.code) return false;
  // Le partite per servizio: poche chiavi, e l'ordine non conta. Si
  // confrontano una per una invece di affidarsi a JSON.stringify, che direbbe
  // diversi due oggetti uguali scritti in ordine diverso — e li riscriverebbe
  // tutti a ogni giro.
  const sa = a.stations || {}, sb = b.stations || {};
  const chiavi = new Set([...Object.keys(sa), ...Object.keys(sb)]);
  for(const k of chiavi){
    const x = sa[k] || null, y = sb[k] || null;
    if(x !== y) return false;
  }
  return true;
}
