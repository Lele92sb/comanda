// ============================================================================
// Raccolta degli errori.
//
// Finché usi l'app tu, un errore lo vedi. Con clienti veri no: l'app si rompe
// nella cucina di qualcun altro, quello smette di usarla, e tu non lo sai mai.
// Oggi ho introdotto tre volte un errore che nessun test vedeva e che si
// manifestava solo a schermo — è esattamente questa la classe di problemi.
//
// COSA VIENE MANDATO: messaggio, punto del codice, versione, tipo di browser,
// e gli identificativi di cucina e utente per poter richiamare chi ha avuto il
// problema. NON viene mandato nulla del contenuto: né ricette, né prezzi, né
// nomi del personale. Va scritto nell'informativa privacy quando ci saranno
// clienti terzi.
// ============================================================================

interface Segnalazione {
  messaggio: string;
  origine: string;
  versione: string;
  // Quale database sta usando l'app che si è rotta. Senza, le segnalazioni
  // delle prove e quelle dei clienti finiscono nello stesso mucchio e non si
  // capisce più quali contino davvero.
  ambiente: string;
  browser: string;
  cucinaId?: string;
  utenteId?: string;
  quando: string;
}

const DESTINAZIONE = '/api/errori';
const MAX_PER_SESSIONE = 20;   // un ciclo che si ripete non deve inondare nulla

let inviate = 0;
const gia = new Set<string>();
let contesto: () => { cucinaId?: string; utenteId?: string } = () => ({});

function riassumi(e: unknown): { messaggio: string; origine: string } {
  if (e instanceof Error) {
    const riga = (e.stack || '').split('\n')[1] || '';
    return { messaggio: `${e.name}: ${e.message}`, origine: riga.trim().slice(0, 200) };
  }
  return { messaggio: String(e).slice(0, 300), origine: '' };
}

async function segnala(e: unknown): Promise<void> {
  if (inviate >= MAX_PER_SESSIONE) return;
  const { messaggio, origine } = riassumi(e);
  // Lo stesso errore ripetuto va mandato una volta sola: dice la stessa cosa.
  const impronta = messaggio + '|' + origine;
  if (gia.has(impronta)) return;
  gia.add(impronta);
  inviate++;

  const dati: Segnalazione = {
    messaggio, origine,
    versione: __VERSIONE__,
    ambiente: __AMBIENTE__,
    browser: navigator.userAgent.slice(0, 200),
    ...contesto(),
    quando: new Date().toISOString(),
  };

  try {
    // keepalive: la segnalazione parte anche se l'errore fa chiudere la pagina.
    await fetch(DESTINAZIONE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dati),
      keepalive: true,
    });
  } catch {
    // Se la segnalazione non parte, pazienza: non deve mai diventare essa
    // stessa una fonte di errori, né bloccare quello che l'utente sta facendo.
  }
}

/**
 * Attiva la raccolta. `daiContesto` viene chiamata al momento dell'errore,
 * non ora: all'avvio la cucina non è ancora scelta.
 */
export function raccogliErrori(daiContesto: () => { cucinaId?: string; utenteId?: string }): void {
  contesto = daiContesto;

  window.addEventListener('error', ev => {
    segnala(ev.error ?? ev.message);
  });
  // Le promesse rifiutate senza catch: è da lì che arrivano gli errori delle
  // chiamate al database e all'AI, quelli che l'utente vede come "non
  // succede niente quando premo il pulsante".
  window.addEventListener('unhandledrejection', ev => {
    segnala(ev.reason);
  });
}

/** Per segnalare a mano una cosa andata storta ma gestita. */
export function segnalaErrore(e: unknown): void { void segnala(e); }
