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

function stessoValore(x, y){
  // Vuoto, nullo e non definito sono la stessa cosa: un campo mai compilato e
  // un campo svuotato non sono due stati diversi per chi guarda.
  const vuotoX = x === null || x === undefined || x === '';
  const vuotoY = y === null || y === undefined || y === '';
  if(vuotoX || vuotoY) return vuotoX && vuotoY;

  if(typeof x === 'boolean' || typeof y === 'boolean') return !!x === !!y;

  const nx = Number(x), ny = Number(y);
  if(Number.isFinite(nx) && Number.isFinite(ny)) return nx === ny;

  return String(x) === String(y);
}
